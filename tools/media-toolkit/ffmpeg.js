/**
 * ffmpeg / ffprobe 封装（可选依赖）
 * ---------------------------------------------------------------------------
 * 设计要点：**不 npm install 任何 ffmpeg 相关包**，只调用外部二进制。
 * 这样整个 tools/media-toolkit 目录可以随时删掉，前端功能不受影响。
 *
 * 三档探测顺序（先命中先用）：
 *   1. 环境变量   MEDIA_FFMPEG_PATH / MEDIA_FFPROBE_PATH
 *   2. 项目内置   tools/media-toolkit/bin/ffmpeg(.exe)
 *   3. 系统 PATH  ffmpeg / ffprobe
 *
 * 一个都没找到时，本模块的所有导出函数都返回 null / false，
 * 调用方据此走降级路径（只显示图标、不显示时长），绝不抛错。
 */

import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

const BIN_DIR = join(__dirname, 'bin')
const IS_WIN = process.platform === 'win32'

/** 探测结果缓存：进程内只查一次，避免每次调用都启动进程 */
let cached = null

function candidatePaths(name) {
  const exe = IS_WIN ? `${name}.exe` : name
  const list = []
  const envValue = name === 'ffprobe' ? process.env.MEDIA_FFPROBE_PATH : process.env.MEDIA_FFMPEG_PATH
  if (envValue) list.push(envValue)
  list.push(join(BIN_DIR, exe))
  list.push(exe)
  return list
}

async function canRun(binary) {
  try {
    const { stdout } = await execFileAsync(binary, ['-version'], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    // ffprobe -version 输出里也有 "FFmpeg developers"，大小写不敏感匹配
    return typeof stdout === 'string' && stdout.toLowerCase().includes('ffmpeg')
  } catch {
    return false
  }
}

/**
 * 探测可用二进制
 * @returns {{available:boolean, ffmpeg:string, ffprobe:string}}
 */
export async function detect() {
  if (cached) return cached

  const result = { available: false, ffmpeg: '', ffprobe: '' }

  for (const name of ['ffmpeg', 'ffprobe']) {
    for (const candidate of candidatePaths(name)) {
      if (await canRun(candidate)) {
        result[name] = candidate
        break
      }
    }
  }

  result.available = Boolean(result.ffmpeg)
  cached = result
  return result
}

/** 帧率：ffprobe 给的是 30000/1001 这类分数，转成 29.97 */
function parseFrameRate(value) {
  if (!value) return null
  const text = String(value)
  if (text.includes('/')) {
    const [a, b] = text.split('/').map(Number)
    if (!Number.isFinite(a) || !Number.isFinite(b) || !b) return null
    const result = a / b
    return result > 0 ? Number(result.toFixed(3)) : null
  }
  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(3)) : null
}

/** 旋转角归一到 0 / 90 / 180 / 270 */
function normalizeRotation(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const positive = ((n % 360) + 360) % 360
  const candidates = [0, 90, 180, 270]
  return candidates.reduce((best, r) => (Math.abs(positive - r) < Math.abs(positive - best) ? r : best), 0)
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseProbe(data) {
  const format = data.format || {}
  const streams = Array.isArray(data.streams) ? data.streams : []

  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const audio = streams.find((s) => s.codec_type === 'audio')

  let rotation = 0
  if (video) {
    // 新版 ffprobe 放在 side_data_list[].rotation，老版放在 stream tags.rotate
    const side = (video.side_data_list || []).find((d) => typeof d.rotation === 'number')
    if (side) rotation = normalizeRotation(side.rotation)
    else if (video.tags?.rotate !== undefined) rotation = normalizeRotation(video.tags.rotate)
  }

  return {
    duration: toNumber(format.duration),
    bitrate: toNumber(format.bit_rate),
    container: String(format.format_name || '').split(',')[0] || '',
    // 图片没有 video stream，宽高退化为空，由调用方决定兜底
    width: toNumber(video?.width),
    height: toNumber(video?.height),
    codec: String(video?.codec_name || '').toLowerCase(),
    rotation,
    hasAudio: Boolean(audio),
    audioCodec: String(audio?.codec_name || '').toLowerCase(),
    frameRate: parseFrameRate(video?.avg_frame_rate || video?.r_frame_rate)
  }
}

/**
 * 探测媒体文件元信息
 * @param {string} filePath
 * @returns {Promise<object|null>} ffprobe 不可用时返回 null
 */
export async function probeMedia(filePath) {
  const { ffprobe, ffmpeg } = await detect()
  // 只有 ffmpeg 没有 ffprobe 时，用 ffmpeg -i 也能拿到粗略信息，但解析 stderr 太脆，直接放弃
  if (!ffprobe) return null

  try {
    const { stdout } = await execFileAsync(
      ffprobe,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 30000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    )
    return parseProbe(JSON.parse(stdout))
  } catch {
    return null
  }
}

/**
 * 生成缩略图
 * · 图片：等比例缩放到指定长边
 * · 视频：跳到 10% 处抽一帧（避开常见的黑帧开头），再缩放
 *
 * @param {object} options { input, output, width, kind, seek }
 * @returns {Promise<boolean>} 是否生成成功
 */
export async function generateThumbnail({ input, output, width = 480, kind = 'image', seek = 0 }) {
  const { ffmpeg } = await detect()
  if (!ffmpeg) return false

  const scale = `scale=${width}:-2`
  const args =
    kind === 'video'
      ? ['-y', '-ss', String(seek), '-i', input, '-frames:v', '1', '-vf', scale, '-q:v', '4', output]
      : ['-y', '-i', input, '-vf', scale, '-q:v', '4', output]

  try {
    await execFileAsync(ffmpeg, args, {
      timeout: 60000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      // ffmpeg 的进度信息全在 stderr，成功时这里会 resolve
      stdio: ['ignore', 'ignore', 'ignore']
    })
    return true
  } catch {
    return false
  }
}

/** 回读图片真实像素尺寸 */
async function readImageSize(ffprobe, filePath) {
  try {
    const { stdout } = await execFileAsync(
      ffprobe,
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', filePath],
      { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }
    )
    const [width, height] = String(stdout).trim().split(',').map(Number)
    if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return null
    return { width, height }
  } catch {
    return null
  }
}

/**
 * 生成进度预览雪碧图（sprite sheet）
 * ---------------------------------------------------------------------------
 * 拖动进度条时想看到"那一刻的画面"，若靠实时 seek 会连发一串 Range 请求。
 * 雪碧图一次把 N 帧拼成一张网格图，拖动时只挪 background-position —— 零请求。
 *
 * **已实测的关键行为**：ffmpeg 默认会应用容器的 rotation 标记。
 * 竖拍视频（1280×720 + rotate=90）抽出来直接是竖格（160×284），
 * 和浏览器里看到的方向一致，所以前端无需再做任何旋转换算。
 *
 * @param {object} options
 * @param {string} options.input    视频路径
 * @param {string} options.output   sprite 图输出路径（*.sprite.jpg）
 * @param {number} options.duration 视频时长（秒），决定抽帧间隔
 * @param {number} [options.cols=10]      每行几格
 * @param {number} [options.cellWidth=160] 每格宽
 * @param {number} [options.maxFrames=40] 最多几格（长视频会自动放大间隔）
 * @param {number} [options.minInterval=0.5] 最小抽帧间隔（秒）
 * @returns {Promise<object|null>} 雪碧图元数据；ffmpeg 不可用或失败时返回 null
 */
export async function generateSprite({
  input,
  output,
  duration,
  cols = 10,
  cellWidth = 160,
  maxFrames = 40,
  minInterval = 0.5
}) {
  const { ffmpeg, ffprobe } = await detect()
  if (!ffmpeg || !ffprobe) return null

  const total = Number(duration)
  if (!Number.isFinite(total) || total <= 0) return null

  // 短视频每 0.5s 一格；长视频自动放大间隔，保证总格数压在 maxFrames 以内
  const interval = Math.max(minInterval, total / maxFrames)
  const count = Math.max(1, Math.min(maxFrames, Math.floor(total / interval)))
  const rows = Math.ceil(count / cols)

  const filter = `fps=1/${interval.toFixed(3)},scale=${cellWidth}:-2,tile=${cols}x${rows}`

  try {
    await execFileAsync(
      ffmpeg,
      ['-y', '-i', input, '-frames:v', '1', '-vf', filter, '-q:v', '5', output],
      { timeout: 180000, windowsHide: true, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'ignore', 'ignore'] }
    )
  } catch {
    return null
  }

  // 必须回读：竖拍被自动旋转后，格子高度无法预先推算
  const size = await readImageSize(ffprobe, output)
  if (!size) return null

  return {
    cols,
    rows,
    count,
    interval: Number(interval.toFixed(3)),
    cellWidth: Math.round(size.width / cols),
    cellHeight: Math.round(size.height / rows),
    width: size.width,
    height: size.height
  }
}

/** 供 CLI / 文档用的状态描述 */
export async function describe() {
  const { available, ffmpeg, ffprobe } = await detect()
  return { available, ffmpeg: ffmpeg || '(未找到)', ffprobe: ffprobe || '(未找到)' }
}

export default {
  detect,
  probeMedia,
  generateThumbnail,
  generateSprite,
  describe
}

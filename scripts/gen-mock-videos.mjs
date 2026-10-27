/**
 * 生成演示视频（H.264 MP4 + 缩略图）
 * ---------------------------------------------------------------------------
 * 剧本与 src/mock/photos.js 的 VIDEO_SCENARIOS 共用，生成后用 ffprobe 回读
 * 真实的时长 / 分辨率 / 旋转角，写进 src/mock/video-assets.js。
 *
 * 没有 ffmpeg 时：直接写出 available:false 的清单，
 * 前端视频项会退化成"只显示图标"的形态 —— 这是设计要求的行为，不是失败。
 */

import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { detect, generateSprite, generateThumbnail, probeMedia } from '../tools/media-toolkit/ffmpeg.js'
import { VIDEO_SCENARIOS } from '../src/mock/photos.js'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

const ROOT = resolve(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'mock', 'videos')
const ASSETS_FILE = join(ROOT, 'src', 'mock', 'video-assets.js')

/** 用 lavfi 合成一段测试视频：彩色测试图 + 可选 440Hz 音轨 */
async function makeClip(ffmpeg, spec, id) {
  const output = join(OUT_DIR, `${id}.mp4`)
  const source = `testsrc2=size=${spec.width}x${spec.height}:rate=${spec.fps}:duration=${spec.duration}`

  const args = ['-y', '-f', 'lavfi', '-i', source]
  if (spec.audio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${spec.duration}`)

  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
  if (spec.audio) args.push('-c:a', 'aac', '-b:a', '96k', '-shortest')

  // 需要标记旋转时先出中间文件，再用 -c copy 封一层
  const firstPass = spec.rotation ? `${output}.tmp.mp4` : output
  args.push(firstPass)

  await execFileAsync(ffmpeg, args, {
    timeout: 180000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'ignore', 'ignore']
  })

  // 老版本 ffmpeg 在 lavfi 直出时写不进 rotate，必须再 -c copy 一次才会落到 displaymatrix
  if (spec.rotation) {
    await execFileAsync(
      ffmpeg,
      ['-y', '-i', firstPass, '-c', 'copy', '-metadata:s:v:0', `rotate=${spec.rotation}`, output],
      { timeout: 120000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'ignore', 'ignore'] }
    )
    await rm(firstPass, { force: true })
  }

  return output
}

async function writeAssets({ available, generatedAt, items }) {
  const body = `/**
 * 视频演示资源清单（由 \`npm run gen:mock\` 自动生成，可安全删除）
 * ---------------------------------------------------------------------------
 * 存在的意义：演示视频要用 ffmpeg 才能生成（H.264 MP4 + 抽帧缩略图），
 * 而 ffmpeg 是本项目的**可选依赖**——装了才生成，没装就保持 available: false。
 *
 *   available: true  → 视频卡片显示缩略图 + 时长，点击可播放
 *   available: false → 视频卡片只显示图标（这正是无 ffmpeg 时的降级形态）
 */

export const VIDEO_ASSETS = {
  available: ${available},
  generatedAt: ${JSON.stringify(generatedAt)},
  items: ${JSON.stringify(items, null, 2)}
}

export default VIDEO_ASSETS
`
  await writeFile(ASSETS_FILE, body, 'utf8')
}

async function main() {
  const { available, ffmpeg } = await detect()
  await mkdir(OUT_DIR, { recursive: true })

  if (!available) {
    await writeAssets({ available: false, generatedAt: '', items: {} })
    console.log('[gen:videos] 未检测到 ffmpeg → 跳过生成')
    console.log('            前端视频项将只显示图标，这是预期的降级形态')
    console.log('            想要真实视频：把 ffmpeg/ffprobe 放进 tools/media-toolkit/bin/ 或装进 PATH')
    return
  }

  const items = {}

  for (let i = 0; i < VIDEO_SCENARIOS.length; i += 1) {
    const spec = VIDEO_SCENARIOS[i]
    const id = `vd_${String(i + 1).padStart(4, '0')}`

    const file = await makeClip(ffmpeg, spec, id)
    const info = await probeMedia(file)
    const duration = info?.duration ?? spec.duration

    const posterFile = join(OUT_DIR, `${id}_poster.jpg`)
    const hasPoster = await generateThumbnail({
      input: file,
      output: posterFile,
      width: 480,
      kind: 'video',
      // 跳到 10% 处抽帧，避开lavfi 开头几帧
      seek: Number(Math.max(0.1, duration * 0.1).toFixed(2))
    })

    // 进度预览雪碧图：本地数据服务器是"按需生成"，演示数据则一次性做好，
    // 这样 mock 通路拿到的永远是 ready 态，不需要走"生成中"的中间流程
    const spriteFile = join(OUT_DIR, `${id}_sprite.jpg`)
    const spriteMeta = await generateSprite({ input: file, output: spriteFile, duration })
    if (!spriteMeta) await rm(spriteFile, { force: true })

    items[id] = {
      media: `/mock/videos/${id}.mp4`,
      poster: hasPoster ? `/mock/videos/${id}_poster.jpg` : '',
      sprite: spriteMeta ? { image: `/mock/videos/${id}_sprite.jpg`, ...spriteMeta } : null,
      duration: Number(duration.toFixed(2)),
      width: info?.width ?? spec.width,
      height: info?.height ?? spec.height,
      rotation: info?.rotation ?? spec.rotation,
      frameRate: info?.frameRate ?? spec.fps,
      bitrate: info?.bitrate ?? null
    }

    console.log(
      `[gen:videos] ${id} ${items[id].width}×${items[id].height} ${items[id].duration}s ` +
        `rotate=${items[id].rotation} poster=${hasPoster ? '有' : '无'} ` +
        `雪碧图=${spriteMeta ? `${spriteMeta.count} 格` : '无'}`
    )
  }

  await writeAssets({ available: true, generatedAt: new Date().toISOString(), items })
  console.log(`[gen:videos] 完成 ${VIDEO_SCENARIOS.length} 个演示视频 → public/mock/videos/`)
}

main().catch((error) => {
  console.error('[gen:videos] 失败：', error?.message || error)
  process.exitCode = 1
})

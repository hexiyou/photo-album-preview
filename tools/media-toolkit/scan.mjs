#!/usr/bin/env node
/**
 * 目录扫描 CLI：把硬盘上的图片 / 视频纳入管理
 * ---------------------------------------------------------------------------
 * 用法：
 *   npm run scan -- --roots "D:/素材,D:/手机相册" --recursive --thumbs
 *   npm run scan -- --roots "D:/素材" --no-recursive --no-thumbs --out data/x.json
 *
 * 三条设计约束：
 *   1. **不写数据库**：产出是一个可丢弃的 JSON 索引，真相是磁盘上的原始文件；
 *   2. **对素材目录只读**：P1 阶段绝不修改源文件，只往 media-cache/ 写缩略图；
 *   3. **ffmpeg 可选**：没有它就只登记文件名与体积，缩略图和时长留空，前端自动显示图标。
 *
 * 增量：索引里记录了 mtime 与 size，未变化的文件直接复用上一次的结果，
 * 二次扫描 1000 个文件通常在 1 秒内完成。
 */

import { lstat, readdir, readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  albumFromPath,
  cacheKey,
  ensurePosterDir,
  loadIndex,
  mediaId,
  posterPath,
  readSidecar,
  saveIndex,
  toCacheUrl
} from './cache.js'
import {
  IMAGE_EXTENSIONS,
  MIME_BY_EXT,
  SUPPORTED_CODECS,
  SUPPORTED_CONTAINERS,
  VIDEO_EXTENSIONS
} from './constants.js'
import { detect, generateThumbnail, probeMedia } from './ffmpeg.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')

/* -------------------------------------------------------------------------- */
/* 参数                                                                        */
/* -------------------------------------------------------------------------- */

function splitList(text) {
  return String(text || '')
    .split(/[,;]/)
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

function parseArgs(argv) {
  const options = {
    roots: [],
    recursive: true,
    thumbs: true,
    include: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS],
    concurrency: 4,
    out: 'data/media-index.json',
    cacheDir: 'media-cache',
    force: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => argv[i + 1]

    switch (arg) {
      case '--roots':
      case '-r':
        options.roots = splitList(next())
        i += 1
        break
      case '--recursive':
        options.recursive = true
        break
      case '--no-recursive':
        options.recursive = false
        break
      case '--thumbs':
        options.thumbs = true
        break
      case '--no-thumbs':
        options.thumbs = false
        break
      case '--include':
        options.include = splitList(next()).map((item) => item.toLowerCase().replace(/^\./, ''))
        i += 1
        break
      case '--concurrency':
        options.concurrency = Math.max(1, Number(next()) || 4)
        i += 1
        break
      case '--out':
        options.out = next() || options.out
        i += 1
        break
      case '--cache':
        options.cacheDir = next() || options.cacheDir
        i += 1
        break
      case '--force':
        options.force = true
        break
      default:
        break
    }
  }

  if (!options.roots.length && process.env.MEDIA_SCAN_ROOTS) {
    options.roots = splitList(process.env.MEDIA_SCAN_ROOTS)
  }

  options.includeSet = new Set(options.include)
  options.outPath = resolve(PROJECT_ROOT, options.out)
  options.cachePath = resolve(PROJECT_ROOT, options.cacheDir)

  return options
}

/**
 * 从项目 .env 兜底读取 MEDIA_SCAN_ROOTS
 * 不引第三方依赖：只认这一个键，读不到就跳过（用命令行参数也一样能用）
 */
async function loadEnvFallback() {
  if (process.env.MEDIA_SCAN_ROOTS) return
  try {
    const text = await readFile(join(PROJECT_ROOT, '.env'), 'utf8')
    const matched = /^\s*MEDIA_SCAN_ROOTS\s*=\s*(.*)$/m.exec(text)
    if (!matched) return
    const value = matched[1].trim().replace(/^["']|["']$/g, '')
    if (value) process.env.MEDIA_SCAN_ROOTS = value
  } catch {
    /* 没有 .env 时用命令行参数即可 */
  }
}

/* -------------------------------------------------------------------------- */
/* 遍历                                                                        */
/* -------------------------------------------------------------------------- */

const isHidden = (name) => name.startsWith('.')

async function walk(dir, options, collected = []) {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return collected
  }

  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    const full = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (options.recursive) await walk(full, options, collected)
      continue
    }

    if (!entry.isFile()) continue
    const ext = extname(entry.name).slice(1).toLowerCase()
    if (options.includeSet.has(ext)) collected.push(full)
  }

  return collected
}

/** 固定并发，避免一次性启动几百个 ffprobe 进程 */
/**
 * 结构化进度输出
 * ---------------------------------------------------------------------------
 * 只有在 MEDIA_SCAN_PROGRESS=1 时才写这些标记行 —— 命令行直接跑的时候
 * 用户只想看干净的人类可读输出；只有被 media server 拉起来做 SSE 推送时，
 * 服务端才需要一个机器上好解析的进度流。
 *
 * 行格式：`SCAN_PROGRESS\t{json}`，服务端按行拆分后取走，不会混进 logs。
 */
const PROGRESS_ENABLED = process.env.MEDIA_SCAN_PROGRESS === '1'

function emitProgress(phase, payload) {
  if (!PROGRESS_ENABLED) return
  try {
    process.stdout.write(`SCAN_PROGRESS\t${JSON.stringify({ phase, ...payload })}\n`)
  } catch {
    /* stdout 关闭时（管道提前断开）不必在意，扫描结果照常落盘 */
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

/* -------------------------------------------------------------------------- */
/* 单文件                                                                      */
/* -------------------------------------------------------------------------- */

async function buildItem(filePath, stat, options, ffAvailable) {
  const id = mediaId(filePath)
  const ext = extname(filePath).slice(1).toLowerCase()
  const kind = VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image'

  const info = await probeMedia(filePath)

  const width = info?.width || 0
  const height = info?.height || 0
  const duration = info?.duration || 0

  // 缩略图：有 ffmpeg 才生成，否则留空让前端显示图标
  let poster = ''
  if (options.thumbs && ffAvailable) {
    const key = cacheKey(filePath)
    const target = posterPath(key, options.cachePath)
    await ensurePosterDir(key, options.cachePath)
    const ok = await generateThumbnail({
      input: filePath,
      output: target,
      width: 480,
      kind,
      seek: duration ? Number(Math.max(0.1, duration * 0.1).toFixed(2)) : 0
    })
    if (ok) poster = toCacheUrl(target, options.cachePath)
  }

  // sidecar 元数据（可选）：与源文件同目录，跟着文件走
  const sidecar = await readSidecar(filePath)
  const birthtime = stat.birthtimeMs || stat.mtimeMs

  const item = {
    id,
    kind,
    title: sidecar?.title || '',
    description: sidecar?.description || '',
    fileName: basename(filePath),
    mimeType: MIME_BY_EXT[ext] || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    size: stat.size,
    width,
    height,
    createdAt: new Date(birthtime).toISOString(),
    updatedAt: stat.mtime.toISOString(),
    takenAt: sidecar?.takenAt || new Date(birthtime).toISOString(),
    tags: sidecar?.tags || [],
    album: albumFromPath(filePath, sidecar?.album),
    location: { name: '', latitude: null, longitude: null },
    urls: {
      thumb: poster,
      poster,
      full: `/api/file/${id}`,
      download: `/api/file/${id}?download=1`,
      page: ''
    },
    exif: null,
    permissions: { canView: true, canDownload: true, canEdit: false, canDelete: false, canShare: false },

    /** 增量扫描用的内部字段，服务端输出时会剥离 */
    _path: filePath,
    _mtime: stat.mtimeMs,
    _size: stat.size
  }

  if (kind === 'video') {
    const codec = String(info?.codec || '').toLowerCase()
    item.video = {
      duration: duration || null,
      codec,
      audioCodec: info?.audioCodec || '',
      hasAudio: info?.hasAudio ?? null,
      bitrate: info?.bitrate || null,
      frameRate: info?.frameRate || null,
      rotation: info?.rotation || 0,
      supported: SUPPORTED_CONTAINERS.has(ext) && (!codec || SUPPORTED_CODECS.has(codec))
    }
  }

  return item
}

/* -------------------------------------------------------------------------- */
/* 主流程                                                                      */
/* -------------------------------------------------------------------------- */

async function main() {
  await loadEnvFallback()
  const options = parseArgs(process.argv.slice(2))

  if (!options.roots.length) {
    console.error('[scan] 缺少 --roots 参数')
    console.error('       示例：npm run scan -- --roots "D:/素材" [--recursive] [--thumbs]')
    console.error('       也可以在 .env 里配置 MEDIA_SCAN_ROOTS="D:/素材;D:/相册"')
    process.exitCode = 1
    return
  }

  const { available, ffmpeg, ffprobe } = await detect()
  const startedAt = Date.now()

  console.log(`[scan] ffmpeg：${available ? '可用' : '未找到（将只登记文件，不生成缩略图）'}`)
  if (available) console.log(`[scan] 路径：${ffmpeg}${ffprobe ? ` / ${ffprobe}` : ''}`)

  const files = []
  for (const root of options.roots) {
    const absRoot = resolve(root)
    const found = await walk(absRoot, options)
    console.log(`[scan] ${absRoot} → ${found.length} 个候选文件`)
    files.push(...found)
  }

  if (!files.length) {
    console.log('[scan] 没有找到任何匹配文件')
    return
  }

  const previous = options.force ? new Map() : await loadIndex(options.outPath)
  let reused = 0
  let processed = 0
  // 含复用在内的累计完成数：进度条要按它算，
  // 只算"真的重新探测过的"会让增量扫描在 UI 上卡着不动
  let scanned = 0

  // 事件名刻意不叫 start：那属于"扫描进程已拉起"（服务端在 spawn 时发），
  // 这一帧是"候选文件已清点完、接下来逐个探测"，语义与字段都不同
  emitProgress('begin', { total: files.length, previous: previous.size })

  const items = await mapLimit(files, options.concurrency, async (file, index) => {
    let stat
    try {
      stat = await lstat(file)
    } catch {
      scanned += 1
      emitProgress('probing', { current: scanned, total: files.length, file: basename(file), skipped: true })
      return null
    }

    const id = mediaId(file)
    const prev = previous.get(id)

    // 增量：路径、大小、修改时间都没变就直接复用
    if (prev && prev._mtime === stat.mtimeMs && prev._size === stat.size) {
      reused += 1
      scanned += 1
      emitProgress('probing', { current: scanned, total: files.length, file: basename(file), reused: true })
      return prev
    }

    const item = await buildItem(file, stat, options, available)
    processed += 1
    scanned += 1
    emitProgress('probing', { current: scanned, total: files.length, file: basename(file), reused: false })
    if (processed % 100 === 0) console.log(`[scan] 已处理 ${processed}/${files.length}…`)
    return item
  })

  const valid = items.filter(Boolean)
  const thumbed = valid.filter((item) => item.urls.poster).length
  const stats = {
    total: valid.length,
    images: valid.filter((item) => item.kind === 'image').length,
    videos: valid.filter((item) => item.kind === 'video').length,
    thumbed,
    reused,
    durationMs: Date.now() - startedAt
  }

  await saveIndex(options.outPath, { roots: options.roots, items: valid, stats })

  // 用 summary 而不是 done：服务端的 done 事件留给"进程真正退出"那一刻，
  // 它带着退出码与最终错误，才是前端该收尾的信号
  emitProgress('summary', { ...stats })
  console.log(`[scan] 完成 → ${options.out}`)
  console.log(
    `[scan] 共 ${stats.total} 个文件（图片 ${stats.images} / 视频 ${stats.videos}），` +
      `缩略图 ${stats.thumbed}，复用 ${stats.reused}，耗时 ${(stats.durationMs / 1000).toFixed(1)}s`
  )
  if (!available) {
    console.log('[scan] 提示：装上 ffmpeg 后重跑即可获得缩略图与时长')
  }
}

main().catch((error) => {
  console.error('[scan] 失败：', error?.message || error)
  process.exitCode = 1
})

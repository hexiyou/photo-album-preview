/**
 * 本地媒体服务
 * ---------------------------------------------------------------------------
 * 定位：给"扫描本地目录"这条链路提供后端，与前端完全解耦——
 * 不做扫描功能时它不需要启动，前端继续用 mock 或你自己的接口。
 *
 *   npm run media:serve        # 默认 8788
 *   npm run scan -- --roots "D:/素材"
 *
 * 与 mock/server.mjs 的区别：
 *   · 数据源是扫描产出的 data/media-index.json（真实文件），而不是演示数据
 *   · 支持 Range 请求（206 Partial Content）—— 视频拖动进度条全靠它
 *   · 支持 POST /api/scan 直接触发扫描
 *   · 同时提供 /media-cache 下的缩略图静态访问
 */

import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mimeOf } from '../tools/media-toolkit/index.mjs'
import { detect, generateSprite, probeMedia } from '../tools/media-toolkit/ffmpeg.js'
import { albumFromPath, cacheKey, saveIndex, spriteMetaPath, spritePath, toCacheUrl, writeSidecar } from '../tools/media-toolkit/cache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

const INDEX_FILE = join(PROJECT_ROOT, 'data', 'media-index.json')
const CACHE_DIR = join(PROJECT_ROOT, 'media-cache')
const SCAN_SCRIPT = join(PROJECT_ROOT, 'tools', 'media-toolkit', 'scan.mjs')
const PORT = Number(process.env.MEDIA_API_PORT || 8788)

let ITEMS = []
let ROOTS = []
let STATS = {}
let LOADED_AT = null

const byId = new Map()

async function reload() {
  try {
    const data = JSON.parse(await readFile(INDEX_FILE, 'utf8'))
    ITEMS = Array.isArray(data.items) ? data.items : []
    ROOTS = data.roots || []
    STATS = data.stats || {}
    byId.clear()
    for (const item of ITEMS) byId.set(item.id, item)
    LOADED_AT = new Date().toISOString()
    return true
  } catch {
    ITEMS = []
    ROOTS = []
    STATS = {}
    byId.clear()
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* 响应工具                                                                    */
/* -------------------------------------------------------------------------- */

const traceId = () => `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function success(data) {
  return { code: 0, message: 'success', traceId: traceId(), data }
}

function failure(code, message) {
  return { code, message, traceId: traceId(), data: null }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range',
    'Access-Control-Expose-Headers': 'Content-Range,Accept-Ranges',
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

/**
 * 文件流：**支持 Range → 206 Partial Content**
 * 没有这个，浏览器拖动视频进度条时会从头重新缓冲。
 */
function streamFile(req, res, filePath, mimeType, { attachment = false, downloadName = '' } = {}) {
  stat(filePath).then((info) => {
    if (!info.isFile()) {
      sendJson(res, 404, failure(40404, '文件不存在'))
      return
    }

    const headers = {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    }
    if (attachment) {
      // 中文文件名用 RFC 5987 编码，避免乱码
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    }

    const range = req.headers.range
    const matched = range ? /bytes=(\d*)-(\d*)/.exec(range) : null

    if (matched) {
      const [, rawStart, rawEnd] = matched
      let start
      let end

      if (rawStart === '') {
        // 后缀区间（suffix-byte-range-spec）：bytes=-N 表示"最后 N 字节"
        // 浏览器读取 MP4 尾部的 moov 原子时就会用这种写法，
        // 非 faststart 的视频一旦算错会直接播放失败
        const suffix = Number(rawEnd)
        if (rawEnd === '' || !Number.isFinite(suffix) || suffix <= 0) {
          res.writeHead(416, {
            'Content-Range': `bytes */${info.size}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*'
          })
          res.end()
          return
        }
        start = Math.max(0, info.size - suffix)
        end = info.size - 1
      } else {
        start = Number(rawStart)
        end = rawEnd === '' ? info.size - 1 : Number(rawEnd)
        if (!Number.isFinite(start)) start = 0
        if (!Number.isFinite(end)) end = info.size - 1
      }

      start = Math.max(0, start)
      end = Math.min(end, info.size - 1)

      if (start > end || start >= info.size) {
        res.writeHead(416, {
          'Content-Range': `bytes */${info.size}`,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        })
        res.end()
        return
      }

      res.writeHead(206, {
        ...headers,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${info.size}`
      })
      createReadStream(filePath, { start, end }).pipe(res)
      return
    }

    res.writeHead(200, { ...headers, 'Content-Length': info.size })
    createReadStream(filePath).pipe(res)
  }).catch(() => {
    sendJson(res, 404, failure(40404, '文件不存在'))
  })
}

/* -------------------------------------------------------------------------- */
/* 查询                                                                        */
/* -------------------------------------------------------------------------- */

/** 抹掉 _ 前缀的内部字段（_path / _mtime / _size） */
function toResponse(item) {
  const clone = { ...item }
  delete clone._path
  delete clone._mtime
  delete clone._size
  return clone
}

function queryItems({ keyword, albumId, tag, kind, sort, order }) {
  const text = String(keyword || '').trim().toLowerCase()

  let list = ITEMS.filter((item) => {
    if (kind && kind !== 'all') {
      const isVideo = item.kind === 'video'
      if (kind === 'video' ? !isVideo : isVideo) return false
    }
    if (albumId && item.album?.id !== albumId) return false
    if (tag && !item.tags.includes(tag)) return false
    if (text) {
      const haystack = [item.title, item.description, item.fileName, item.album?.name, ...(item.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(text)) return false
    }
    return true
  })

  const allowed = new Set(['takenAt', 'createdAt', 'size', 'fileName', 'width', 'duration'])
  const safeSort = allowed.has(sort) ? sort : 'takenAt'
  const factor = order === 'asc' ? 1 : -1

  const valueOf = (item) => {
    switch (safeSort) {
      case 'size':
        return item.size || 0
      case 'width':
        return item.width || 0
      case 'duration':
        return item.video?.duration || 0
      case 'fileName':
        return String(item.fileName || '').toLowerCase()
      case 'createdAt':
        return new Date(item.createdAt || 0).getTime()
      default:
        return new Date(item.takenAt || item.createdAt || 0).getTime()
    }
  }

  return [...list].sort((a, b) => {
    const av = valueOf(a)
    const bv = valueOf(b)
    if (av === bv) return String(a.id).localeCompare(String(b.id))
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * factor
    return (av - bv) * factor
  })
}

function deriveAlbums() {
  const map = new Map()
  for (const item of ITEMS) {
    if (!item.album) continue
    map.set(item.album.id, { ...item.album, photoCount: 0 })
  }
  for (const item of ITEMS) {
    const album = map.get(item.album?.id)
    if (album) album.photoCount += 1
  }
  return [...map.values()]
}

function deriveTags() {
  const counter = new Map()
  for (const item of ITEMS) {
    for (const tag of item.tags || []) counter.set(tag, (counter.get(tag) || 0) + 1)
  }
  return [...counter.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, photoCount], index) => ({ id: `tag_${index + 1}`, name, photoCount }))
}

/* -------------------------------------------------------------------------- */
/* 扫描任务                                                                    */
/* -------------------------------------------------------------------------- */

let scanState = { running: false, startedAt: null, finishedAt: null, error: null, logs: '', progress: null }

/** 累积扫描日志，只留尾部 4000 字符给轮询接口用 */
function appendLog(text) {
  scanState.logs = `${scanState.logs}${text}`.slice(-4000)
}

/** 当前连着的 SSE 客户端（就是 res 对象本体） */
const sseClients = new Set()

/** 向所有 SSE 连接推一帧；已经断开的顺手清理掉 */
function broadcastScan(event, data) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(chunk)
    } catch {
      sseClients.delete(client)
    }
  }
}

function scanSnapshot() {
  return {
    running: scanState.running,
    startedAt: scanState.startedAt,
    finishedAt: scanState.finishedAt,
    error: scanState.error,
    progress: scanState.progress,
    total: ITEMS.length,
    roots: ROOTS
  }
}

const PROGRESS_MARKER = 'SCAN_PROGRESS\t'

/**
 * 逐行消化扫描进程的输出。
 * 进度标记行拿去推 SSE，其余按老样子累积进 logs（轮询接口还在用）。
 */
function consumeScanLine(rawLine) {
  const line = rawLine.replace(/\r?\n$/, '')

  if (line.startsWith(PROGRESS_MARKER)) {
    let payload = null
    try {
      payload = JSON.parse(line.slice(PROGRESS_MARKER.length))
    } catch {
      payload = null
    }
    if (payload) {
      scanState.progress = payload
      // 按 phase 分派不同的事件名：start / summary 的字段和 probing 完全不同，
      // 混在 progress 里会让前端把统计摘要当成一个进度帧来渲染
      broadcastScan(payload.phase === 'probing' ? 'progress' : payload.phase, payload)
      return
    }
  }

  appendLog(rawLine)
  broadcastScan('log', { text: line })
}

function startScan(payload = {}) {
  if (scanState.running) return { ok: false, error: '已有扫描任务在进行中' }

  const args = [SCAN_SCRIPT]
  if (Array.isArray(payload.roots) && payload.roots.length) args.push('--roots', payload.roots.join(','))
  if (payload.recursive === false) args.push('--no-recursive')
  if (payload.thumbs === false) args.push('--no-thumbs')

  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // 只有服务端拉起时才让 scan.mjs 吐结构化进度行；命令行直跑保持干净输出
    env: { ...process.env, MEDIA_SCAN_PROGRESS: '1' }
  })

  scanState = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    logs: '',
    progress: null
  }
  broadcastScan('start', { startedAt: scanState.startedAt })

  // 必须按行切：进度标记被 chunk 截断会解析失败，直接吃 chunk 是错的
  let stdoutBuf = ''
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString()
    const lines = stdoutBuf.split('\n')
    stdoutBuf = lines.pop() ?? ''
    for (const line of lines) consumeScanLine(`${line}\n`)
  })

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    appendLog(text)
    broadcastScan('log', { text: text.replace(/\r?\n$/, '') })
  })

  child.on('error', (error) => {
    scanState = { ...scanState, running: false, finishedAt: new Date().toISOString(), error: error.message }
    broadcastScan('done', { running: false, error: error.message, total: ITEMS.length })
  })

  child.on('close', async (code) => {
    // 进程退出时行缓冲区里通常还剩一段没有换行的尾巴
    if (stdoutBuf.trim()) consumeScanLine(stdoutBuf)
    stdoutBuf = ''

    const error = code === 0 ? null : `扫描进程退出码 ${code}`
    scanState = { ...scanState, running: false, finishedAt: new Date().toISOString(), error }
    if (code === 0) await reload()
    broadcastScan('done', { running: false, error, total: ITEMS.length, code })
  })

  return { ok: true }
}

/**
 * 读 JSON 请求体
 * @returns {Promise<object|null>} 非法 JSON / 超长 / 读取失败时返回 **null**
 *
 * 刻意区分"没传参数"（{}) 与"传了但我解析不了"（null）：
 * 写入类接口如果把坏报文当空对象处理，会变成一次静默的空操作，
 * 调用方根本无从察觉数据没写进去。
 */
function readJsonBody(req) {
  return new Promise((resolveBody) => {
    let body = ''
    let aborted = false

    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        aborted = true
        req.destroy()
      }
    })

    req.on('end', () => {
      if (aborted) {
        resolveBody(null)
        return
      }
      try {
        const parsed = JSON.parse(body || '{}')
        resolveBody(parsed && typeof parsed === 'object' ? parsed : null)
      } catch {
        resolveBody(null)
      }
    })

    req.on('error', () => resolveBody(null))
  })
}

/* -------------------------------------------------------------------------- */
/* 路由                                                                        */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* 进度预览雪碧图（按需生成）                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 雪碧图是**按需生成**的：扫描阶段完全不碰它 —— 否则每次扫描变慢、
 * media-cache 也无谓变胖。只有某个视频在查看器里第一次被打开时才后台生成。
 *
 * 三态协议（前端据此决定用什么方式预览）：
 *   ready        已有缓存，直接用
 *   generating   后台正在生成，前端先用实时取帧顶着，过两秒再来问
 *   unavailable  没装 ffmpeg，永久降级为实时取帧，不要再问了
 */
const spriteJobs = new Map()

async function readSpriteMeta(metaFile) {
  try {
    const data = JSON.parse(await readFile(metaFile, 'utf8'))
    if (Number.isFinite(data?.cellWidth) && Number.isFinite(data?.count)) return data
    return null
  } catch {
    return null
  }
}

/** 后台生成雪碧图。同一个 key 只会跑一个任务，重复请求命中同一个 Promise */
function startSpriteJob(item, { key, metaFile, imageFile }) {
  if (spriteJobs.has(key)) return

  const task = (async () => {
    // 时长优先用索引里已有的；没有再现场探测（索引是无 ffmpeg 时产出的情况）
    let duration = Number(item.video?.duration)
    if (!Number.isFinite(duration) || duration <= 0) {
      const probed = await probeMedia(item._path)
      duration = Number(probed?.duration)
    }

    const meta = await generateSprite({ input: item._path, output: imageFile, duration })
    if (!meta) return

    await mkdir(dirname(metaFile), { recursive: true })
    await writeFile(
      metaFile,
      `${JSON.stringify({ ...meta, image: toCacheUrl(imageFile, CACHE_DIR) }, null, 2)}\n`,
      'utf8'
    )
  })()
    .catch(() => {
      /* 生成失败就让它下次重试；不影响其它任何功能 */
    })
    .finally(() => spriteJobs.delete(key))

  spriteJobs.set(key, task)
}

async function handleSprite(res, id) {
  const item = byId.get(id)
  if (!item) {
    sendJson(res, 404, failure(40404, '媒体不存在'))
    return
  }
  if (item.kind !== 'video') {
    sendJson(res, 200, success({ state: 'unavailable', reason: '静态图片不需要雪碧图' }))
    return
  }

  const key = cacheKey(item._path)
  const metaFile = spriteMetaPath(key, CACHE_DIR)
  const imageFile = spritePath(key, CACHE_DIR)

  const cached = await readSpriteMeta(metaFile)
  if (cached) {
    sendJson(res, 200, success({ state: 'ready', sprite: cached }))
    return
  }

  const tools = await detect()
  if (!tools.available) {
    sendJson(res, 200, success({ state: 'unavailable', reason: '未安装 ffmpeg，改用实时取帧' }))
    return
  }

  startSpriteJob(item, { key, metaFile, imageFile })
  sendJson(res, 202, success({ state: 'generating' }))
}

/* -------------------------------------------------------------------------- */
/* sidecar 元数据写入                                                          */
/* -------------------------------------------------------------------------- */

const META_TEXT_LIMIT = { title: 200, description: 2000, album: 100 }

/** 只放行已知字段，超长截断；未知字段一律丢弃，避免把垃圾写进 sidecar */
function sanitizeMetaPatch(patch) {
  const clean = {}
  if (!patch || typeof patch !== 'object') return clean

  if (typeof patch.title === 'string') clean.title = patch.title.trim().slice(0, META_TEXT_LIMIT.title)
  if (typeof patch.description === 'string') clean.description = patch.description.trim().slice(0, META_TEXT_LIMIT.description)
  if (typeof patch.album === 'string') clean.album = patch.album.trim().slice(0, META_TEXT_LIMIT.album)
  if (typeof patch.takenAt === 'string') clean.takenAt = patch.takenAt.trim()
  if (Array.isArray(patch.tags)) {
    const unique = new Set(patch.tags.filter(Boolean).map((tag) => String(tag).trim().slice(0, 50)))
    clean.tags = [...unique].slice(0, 50)
  }
  return clean
}

/** 把写入结果同步回内存里的那条记录，让列表立刻反映变化 */
function applyMetaToItem(item, clean) {
  if (clean.title !== undefined) item.title = clean.title
  if (clean.description !== undefined) item.description = clean.description
  if (clean.tags !== undefined) item.tags = clean.tags
  // album 在领域模型里是 { id, name }，字符串要还原成同构对象
  if (clean.album !== undefined) item.album = albumFromPath(item._path, clean.album)
  if (clean.takenAt !== undefined) item.takenAt = clean.takenAt
}

async function handleApi(req, res, url) {
  const pathname = url.pathname
  const query = url.searchParams

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS'
    })
    res.end()
    return
  }

  // ---- 列表 ----
  if (pathname === '/api/media' || pathname === '/api/photos') {
    if (req.method !== 'GET') {
      sendJson(res, 405, failure(40005, '仅支持 GET'))
      return
    }

    const page = Math.max(1, Number(query.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 20))

    const filtered = queryItems({
      keyword: query.get('keyword') || '',
      albumId: query.get('albumId') || '',
      tag: query.get('tag') || '',
      kind: query.get('kind') || 'all',
      sort: query.get('sort') || 'takenAt',
      order: query.get('order') || 'desc'
    })

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * pageSize

    sendJson(res, 200, success({
      list: filtered.slice(start, start + pageSize).map(toResponse),
      pagination: { page: safePage, pageSize, total, totalPages, hasMore: safePage < totalPages }
    }))
    return
  }

  // ---- 相册 / 标签 ----
  if (pathname === '/api/albums') {
    sendJson(res, 200, success({ list: deriveAlbums() }))
    return
  }

  if (pathname === '/api/tags') {
    sendJson(res, 200, success({ list: deriveTags() }))
    return
  }

  // ---- 扫描 ----
  if (pathname === '/api/scan' && req.method === 'POST') {
    // 扫描允许不带 body；解析失败时退化为空参数而不是报错
    const payload = (await readJsonBody(req)) || {}
    const result = startScan(payload)
    if (!result.ok) {
      sendJson(res, 409, failure(40900, result.error))
      return
    }
    sendJson(res, 202, success({ running: true, startedAt: scanState.startedAt }))
    return
  }

  if (pathname === '/api/scan/status') {
    sendJson(res, 200, success({
      running: scanState.running,
      startedAt: scanState.startedAt,
      finishedAt: scanState.finishedAt,
      error: scanState.error,
      // 最后一个结构化进度帧；没有 SSE 时靠它轮询也能画出进度
      progress: scanState.progress,
      // 扫描进程 stdout 的尾部 4000 字符，长任务时可以看进度
      logs: scanState.logs || '',
      total: ITEMS.length,
      loadedAt: LOADED_AT,
      roots: ROOTS
    }))
    return
  }

  // ---- 扫描进度 SSE ----
  // 轮询也能看 running/logs，但拿不到"第几个 / 共几个"这种逐文件进度。
  // 前端不支持 EventSource 时会自己退回轮询，所以这里不是唯一通路。
  if (pathname === '/api/scan/stream') {
    if (req.method !== 'GET') {
      sendJson(res, 405, failure(40005, '仅支持 GET'))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      // 反向代理默认会缓冲响应体，那样 SSE 就永远"卡住不动"了
      'X-Accel-Buffering': 'no'
    })

    // 先塞一帧当前快照，客户端不必干等下一个事件才能渲染
    res.write(`event: snapshot\ndata: ${JSON.stringify(scanSnapshot())}\n\n`)
    sseClients.add(res)

    // 心跳：中间的代理/防火墙会因为"长时间没数据"静默掐断长扫描，
    // 每 15 秒写一行注释帧就能保活
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n')
      } catch {
        /* 连接已断，统一在 close 里清理 */
      }
    }, 15000)

    req.on('close', () => {
      clearInterval(heartbeat)
      sseClients.delete(res)
    })
    return
  }

  // ---- 进度预览雪碧图（按需生成，三态）----
  const spriteMatch = /^\/api\/sprite\/([^/]+)$/.exec(pathname)
  if (spriteMatch) {
    if (req.method !== 'GET') {
      sendJson(res, 405, failure(40005, '仅支持 GET'))
      return
    }
    await handleSprite(res, decodeURIComponent(spriteMatch[1]))
    return
  }

  // ---- sidecar 元数据写入 ----
  // 写的是与源文件同目录的 IMG_0042.jpg.meta.json —— 元数据跟着文件走。
  // 这条能力本期默认不在 UI 暴露（见 features.metaEdit），先把链路铺通。
  const metaMatch = /^\/api\/(?:media|photos)\/([^/]+)\/meta$/.exec(pathname)
  if (metaMatch) {
    if (req.method !== 'PUT' && req.method !== 'PATCH') {
      sendJson(res, 405, failure(40005, '仅支持 PUT / PATCH'))
      return
    }

    const item = byId.get(decodeURIComponent(metaMatch[1]))
    if (!item) {
      sendJson(res, 404, failure(40404, '媒体不存在'))
      return
    }

    const patch = await readJsonBody(req)
    if (patch === null) {
      sendJson(res, 400, failure(40001, '请求体不是合法 JSON'))
      return
    }

    const clean = sanitizeMetaPatch(patch)
    await writeSidecar(item._path, clean)
    applyMetaToItem(item, clean)
    // 真相是 sidecar，但此刻不同步索引的话，服务重启前列表看不到改动
    await saveIndex(INDEX_FILE, { roots: ROOTS, items: ITEMS, stats: STATS })

    sendJson(res, 200, success({ media: toResponse(item) }))
    return
  }

  // ---- 缩略图（直接用缓存文件）----
  const thumbMatch = /^\/api\/thumb\/([^/]+)$/.exec(pathname)
  if (thumbMatch) {
    const item = byId.get(decodeURIComponent(thumbMatch[1]))
    if (!item?.urls?.poster) {
      sendJson(res, 404, failure(40404, '该媒体没有缩略图（未生成或未装 ffmpeg）'))
      return
    }
    const filePath = join(CACHE_DIR, normalize(item.urls.poster.replace(/^\/media-cache\//, '')))
    streamFile(req, res, filePath, 'image/jpeg')
    return
  }

  // ---- 原始文件流（支持 Range）----
  const fileMatch = /^\/api\/file\/([^/]+)$/.exec(pathname)
  if (fileMatch) {
    const item = byId.get(decodeURIComponent(fileMatch[1]))
    if (!item) {
      sendJson(res, 404, failure(40404, '媒体不存在'))
      return
    }
    const attachment = query.get('download') === '1'
    streamFile(req, res, item._path, mimeOf(extname(item._path).slice(1)), {
      attachment,
      downloadName: item.fileName
    })
    return
  }

  // ---- 下载（走 Content-Disposition）----
  const downloadMatch = /^\/api\/(?:media|photos)\/([^/]+)\/download$/.exec(pathname)
  if (downloadMatch) {
    const item = byId.get(decodeURIComponent(downloadMatch[1]))
    if (!item) {
      sendJson(res, 404, failure(40404, '媒体不存在'))
      return
    }
    streamFile(req, res, item._path, mimeOf(extname(item._path).slice(1)), {
      attachment: true,
      downloadName: item.fileName
    })
    return
  }

  // ---- 详情 ----
  const detailMatch = /^\/api\/(?:media|photos)\/([^/]+)$/.exec(pathname)
  if (detailMatch) {
    const item = byId.get(decodeURIComponent(detailMatch[1]))
    if (!item) {
      sendJson(res, 404, failure(40404, '媒体不存在'))
      return
    }
    sendJson(res, 200, success({ media: toResponse(item) }))
    return
  }

  sendJson(res, 404, failure(40400, `接口不存在：${pathname}`))
}

/** /media-cache/ 下的缩略图静态访问（防路径穿越） */
async function handleCacheStatic(req, res, url) {
  // 两步都要按顺序做：
  // 1. 先解码再 normalize —— 借 normalize 把 ".." 解析掉，这是防穿越的关键；
  //    Windows 上它会把 "/" 写成 "\"，所以分隔符要同时认 "/" 与 "\"
  // 2. 再剥掉 URL 前缀 media-cache/ —— 它和缓存目录同名，
  //    不剥就会拼出 <cache>\media-cache\xxx.jpg，在所有平台都 404
  const normalized = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
  const relative = normalized.replace(/^media-cache[/\\]/i, '')
  const filePath = join(CACHE_DIR, relative)

  if (!filePath.startsWith(CACHE_DIR)) {
    sendJson(res, 403, failure(40300, '禁止访问'))
    return
  }

  streamFile(req, res, filePath, mimeOf(extname(filePath).slice(1)))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url)
    return
  }

  if (url.pathname.startsWith('/media-cache/')) {
    handleCacheStatic(req, res, url)
    return
  }

  sendJson(res, 200, success({
    service: 'media-server',
    note: '数据源为扫描产出的 data/media-index.json',
    loaded: { items: ITEMS.length, roots: ROOTS, stats: STATS, at: LOADED_AT },
    endpoints: [
      'GET  /api/media?page=1&pageSize=20&kind=all|image|video&keyword=&albumId=&tag=&sort=&order=',
      'GET  /api/media/:id',
      'GET  /api/media/:id/download',
      'GET  /api/file/:id            （支持 Range → 206，视频拖动必需）',
      'GET  /api/thumb/:id',
      'GET  /api/albums',
      'GET  /api/tags',
      'POST /api/scan  {roots, recursive, thumbs}',
      'GET  /api/scan/status'
    ]
  }))
})

await reload()

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[media:serve] 已启动 → http://127.0.0.1:${PORT}/api/media`)
  console.log(`[media:serve] 索引：${INDEX_FILE}`)
  if (ITEMS.length) {
    console.log(`[media:serve] 已载入 ${ITEMS.length} 个媒体（图片 ${STATS.images || 0} / 视频 ${STATS.videos || 0}）`)
  } else {
    console.log('[media:serve] 索引为空，先跑：npm run scan -- --roots "D:/你的素材目录"')
  }
})

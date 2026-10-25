/**
 * 本地 Mock 后端（Node 原生 http，零依赖）
 * ---------------------------------------------------------------------------
 * 存在的意义：让你在开发阶段就能用「真实的 HTTP 链路」验证前端，
 * 而不是停留在浏览器内 mock。启动方式：
 *
 *   npm run mock:api        # 监听 8787
 *   npm run dev             # vite 已配置 /api → http://127.0.0.1:8787
 *
 * 然后把 .env 的 VITE_DATA_SOURCE 改成 api，前端就走真实请求了。
 * 本文件返回的 JSON 结构 = API.md 定义的正式契约，后端照此实现即可。
 *
 * 可选：也可以直接 `node mock/server.mjs --static` 让它同时托管图片静态资源。
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MOCK_ALBUMS, MOCK_PHOTOS, MOCK_TAGS } from '../src/mock/photos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, '..', 'public')
const PORT = Number(process.env.MOCK_API_PORT || 8787)
const SERVE_STATIC = process.argv.includes('--static')

const MIME_TYPES = {
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8'
}

/** 抹掉 mock 专用字段，保证返回值与真实接口一致 */
function toResponsePhoto(raw) {
  const clone = JSON.parse(JSON.stringify(raw))
  delete clone._mockRender
  return clone
}

function success(data) {
  return {
    code: 0,
    message: 'success',
    traceId: `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    data
  }
}

function failure(code, message, status = 400) {
  return {
    status,
    body: {
      code,
      message,
      traceId: `mock-${Date.now().toString(36)}`,
      data: null
    }
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

function sendFile(res, filePath, { attachment = false, downloadName = '' } = {}) {
  stat(filePath).then((info) => {
    if (!info.isFile()) {
      sendJson(res, 404, failure(40404, '文件不存在', 404).body)
      return
    }

    const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': info.size,
      'Access-Control-Allow-Origin': '*',
      ...(attachment ? { 'Content-Disposition': `attachment; filename="${downloadName}"` } : {})
    })
    createReadStream(filePath).pipe(res)
  }).catch(() => {
    sendJson(res, 404, failure(40404, '文件不存在', 404).body)
  })
}

function applyQuery({ keyword = '', albumId = '', tag = '', sort = 'takenAt', order = 'desc', dateFrom = '', dateTo = '' }) {
  const text = String(keyword).trim().toLowerCase()

  let list = MOCK_PHOTOS.filter((photo) => {
    if (albumId && photo.album?.id !== albumId) return false
    if (tag && !photo.tags.includes(tag)) return false

    if (text) {
      const haystack = [photo.title, photo.description, photo.fileName, photo.author?.name, photo.album?.name, ...photo.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(text)) return false
    }

    if (dateFrom && new Date(photo.takenAt) < new Date(dateFrom)) return false
    if (dateTo && new Date(photo.takenAt) > new Date(`${dateTo}T23:59:59`)) return false

    return true
  })

  const allowedSorts = new Set(['takenAt', 'createdAt', 'size', 'fileName', 'width'])
  const safeSort = allowedSorts.has(sort) ? sort : 'takenAt'
  const factor = order === 'asc' ? 1 : -1

  const valueOf = (photo) => {
    switch (safeSort) {
      case 'size':
        return photo.size
      case 'width':
        return photo.width
      case 'fileName':
        return photo.fileName.toLowerCase()
      case 'createdAt':
        return new Date(photo.createdAt).getTime()
      default:
        return new Date(photo.takenAt).getTime()
    }
  }

  list = [...list].sort((a, b) => {
    const av = valueOf(a)
    const bv = valueOf(b)
    if (av === bv) return a.id.localeCompare(b.id)
    return (av > bv ? 1 : -1) * factor
  })

  return list
}

async function handleApi(req, res, url) {
  const pathname = url.pathname
  const query = url.searchParams

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Allow-Methods': 'GET,OPTIONS'
    })
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, failure(40005, '仅支持 GET 方法', 405).body)
    return
  }

  // GET /api/photos
  if (pathname === '/api/photos' || pathname === '/api/photos/') {
    const page = Math.max(1, Number(query.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 20))

    const filtered = applyQuery({
      keyword: query.get('keyword') || '',
      albumId: query.get('albumId') || '',
      tag: query.get('tag') || '',
      sort: query.get('sort') || 'takenAt',
      order: query.get('order') || 'desc',
      dateFrom: query.get('dateFrom') || '',
      dateTo: query.get('dateTo') || ''
    })

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * pageSize

    sendJson(res, 200, success({
      list: filtered.slice(start, start + pageSize).map(toResponsePhoto),
      pagination: { page: safePage, pageSize, total, totalPages, hasMore: safePage < totalPages }
    }))
    return
  }

  // GET /api/photos/batch?ids=a,b,c
  if (pathname === '/api/photos/batch') {
    const ids = String(query.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean)
    const set = new Set(ids)
    sendJson(res, 200, success({
      list: MOCK_PHOTOS.filter((photo) => set.has(photo.id)).map(toResponsePhoto)
    }))
    return
  }

  // GET /api/albums
  if (pathname === '/api/albums') {
    sendJson(res, 200, success({ list: MOCK_ALBUMS }))
    return
  }

  // GET /api/tags
  if (pathname === '/api/tags') {
    sendJson(res, 200, success({ list: MOCK_TAGS }))
    return
  }

  // GET /api/photos/:id/download
  const downloadMatch = /^\/api\/photos\/([^/]+)\/download$/.exec(pathname)
  if (downloadMatch) {
    const photo = MOCK_PHOTOS.find((item) => item.id === decodeURIComponent(downloadMatch[1]))
    if (!photo) {
      sendJson(res, 404, failure(40404, '照片不存在', 404).body)
      return
    }
    const filePath = join(PUBLIC_DIR, normalize(photo.urls.full.replace(/^\/+/, '')))
    sendFile(res, filePath, { attachment: true, downloadName: `${photo.title}.svg` })
    return
  }

  // GET /api/photos/:id
  const detailMatch = /^\/api\/photos\/([^/]+)$/.exec(pathname)
  if (detailMatch) {
    const photo = MOCK_PHOTOS.find((item) => item.id === decodeURIComponent(detailMatch[1]))
    if (!photo) {
      sendJson(res, 404, failure(40404, '照片不存在', 404).body)
      return
    }
    sendJson(res, 200, success({ photo: toResponsePhoto(photo) }))
    return
  }

  sendJson(res, 404, failure(40400, `接口不存在：${pathname}`, 404).body)
}

async function handleStatic(res, url) {
  const filePath = join(PUBLIC_DIR, normalize(decodeURIComponent(url.pathname).replace(/^\/+/, '')))
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, failure(40300, '禁止访问', 403).body)
    return
  }
  sendFile(res, filePath)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url)
    return
  }

  if (SERVE_STATIC) {
    handleStatic(res, url)
    return
  }

  sendJson(res, 200, success({
    service: 'photo-album-mock-api',
    endpoints: [
      'GET /api/photos?page=1&pageSize=20&keyword=&albumId=&tag=&sort=takenAt&order=desc',
      'GET /api/photos/batch?ids=ph_0001,ph_0002',
      'GET /api/photos/:id',
      'GET /api/photos/:id/download',
      'GET /api/albums',
      'GET /api/tags'
    ]
  }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock:api] 已启动 → http://127.0.0.1:${PORT}/api/photos`)
  if (SERVE_STATIC) console.log(`[mock:api] 同时托管静态资源 → http://127.0.0.1:${PORT}/mock/photos/ph_0001_thumb.svg`)
})

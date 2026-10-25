/**
 * 图片下载工具
 * ---------------------------------------------------------------------------
 * 优先走 fetch → Blob 的方式（可以显示进度、文件名可控、不会跳新标签页），
 * 遇到跨域 / 网络失败时自动降级为浏览器原生下载。
 *
 * 用法：
 *   await downloadFile(url, 'photo.jpg')
 *   await downloadPhoto(photo, { onProgress: (p) => console.log(p) })
 */

const MAX_BLOB_BYTES = 200 * 1024 * 1024

/** Windows / macOS / Linux 非法文件名字符 */
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

export function sanitizeFileName(name, fallback = 'download') {
  const raw = String(name || '').trim()
  const cleaned = raw.replace(ILLEGAL_NAME_CHARS, '_').replace(/\s+/g, ' ').replace(/^\.+/, '')
  return cleaned ? cleaned.slice(0, 180) : fallback
}

/** 从 Content-Disposition 中解析文件名（RFC 5987） */
export function parseFileNameFromHeader(header) {
  if (!header) return ''

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8Match?.[1]) {
    try {
      return sanitizeFileName(decodeURIComponent(utf8Match[1]))
    } catch {
      /* ignore */
    }
  }

  const basicMatch = /filename="?([^";]+)"?/i.exec(header)
  if (basicMatch?.[1]) {
    return sanitizeFileName(basicMatch[1].trim())
  }

  return ''
}

/** 从 URL 中兜底推断文件名 */
export function guessFileNameFromUrl(url, fallbackExt = 'jpg') {
  try {
    const { pathname, search } = new URL(url, window.location.origin)
    const segments = pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] || ''

    const queryName = new URLSearchParams(search).get('filename') || new URLSearchParams(search).get('name')
    const candidate = queryName || decodeURIComponent(last)
    if (candidate && /\.[a-zA-Z0-9]{2,5}$/.test(candidate)) return sanitizeFileName(candidate)
  } catch {
    /* ignore */
  }
  return `photo-${Date.now()}.${fallbackExt}`
}

function triggerSave(blobUrl, fileName) {
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  // 部分浏览器需要延迟回收，避免下载被中断
  setTimeout(() => {
    document.body.removeChild(link)
  }, 0)
}

/**
 * 下载远端文件
 * @param {string} url 资源地址
 * @param {string} fileName 保存文件名
 * @param {{onProgress?: (percent:number, loaded:number, total:number)=>void, signal?: AbortSignal, fallback?: boolean}} options
 * @returns {Promise<{ok:boolean, mode:'blob'|'link'|'failed', fileName:string, size:number}>}
 */
export async function downloadFile(url, fileName, options = {}) {
  const { onProgress, signal } = options
  const result = { ok: false, mode: 'failed', fileName: sanitizeFileName(fileName, 'photo.jpg'), size: 0 }

  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const headerName = parseFileNameFromHeader(response.headers.get('Content-Disposition'))
    if (headerName) result.fileName = headerName

    const totalHint = Number(response.headers.get('Content-Length')) || 0

    // 有可读流且体积在可控范围内时，展示进度
    if (response.body && typeof response.body.getReader === 'function' && totalHint <= MAX_BLOB_BYTES) {
      const reader = response.body.getReader()
      const chunks = []
      let loaded = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value?.length ?? 0
        onProgress?.(totalHint ? Math.min(99, Math.round((loaded / totalHint) * 100)) : Math.min(99, Math.round(loaded / 524288)), loaded, totalHint)
      }

      result.size = loaded
      const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || 'application/octet-stream' })
      const objectUrl = URL.createObjectURL(blob)
      triggerSave(objectUrl, result.fileName)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } else {
      const blob = await response.blob()
      result.size = blob.size
      const objectUrl = URL.createObjectURL(blob)
      triggerSave(objectUrl, result.fileName)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    }

    onProgress?.(100, result.size, result.size)
    result.ok = true
    result.mode = 'blob'
    return result
  } catch (error) {
    // 降级：直接交给浏览器原生下载（跨域、鉴权 Cookie、流式接口等场景）
    if (options.fallback !== false && !(error?.name === 'AbortError')) {
      triggerSave(url, result.fileName)
      result.ok = true
      result.mode = 'link'
      return result
    }
    result.error = error
    return result
  }
}

/**
 * 下载一张照片
 * @param {object} photo Photo 领域模型
 * @param {{size?: 'full'|'regular'|'thumb', onProgress?: Function, signal?: AbortSignal}} options
 */
export async function downloadPhoto(photo, options = {}) {
  if (!photo) throw new Error('downloadPhoto: photo 不能为空')

  const prefers = options.size ? [options.size, 'download', 'full', 'regular', 'thumb'] : ['download', 'full', 'regular', 'thumb']
  const url = prefers.map((key) => photo.urls?.[key]).find(Boolean)

  if (!url) throw new Error(`downloadPhoto: 照片 ${photo.id} 没有可用的下载地址`)

  return downloadFile(url, photo.downloadName || photo.fileName || `${photo.id}.jpg`, options)
}

/**
 * 批量下载（预留给后续的多选/打包能力）
 * 逐张串行下载并留出间隔，避免浏览器拦截连续多次下载。
 */
export async function downloadPhotos(photos = [], options = {}) {
  const results = []

  for (const photo of photos) {
    /* eslint-disable no-await-in-loop */
    results.push(await downloadPhoto(photo, options))
    await new Promise((resolve) => setTimeout(resolve, options.interval ?? 300))
  }

  return results
}

export default {
  downloadFile,
  downloadPhoto,
  downloadPhotos,
  sanitizeFileName,
  parseFileNameFromHeader,
  guessFileNameFromUrl
}

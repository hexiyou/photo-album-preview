/**
 * Photo 领域模型 & 适配器
 * ---------------------------------------------------------------------------
 * 这是「服务端 JSON」与「前端 UI」之间的唯一翻译层：
 *
 *   服务端原始字段 ──adaptPhoto()──► Photo 领域模型 ──► 组件消费
 *
 * 为什么要这一层：
 *   1. 后端字段名变化（比如 size → byteSize）时，只改这里，不用动组件；
 *   2. 兼容多种命名习惯（下划线 / 驼峰 / 嵌套 / 扁平）；
 *   3. 所有派生字段（体积文本、像素、宽高比、下载名）在这里算好，组件保持"笨"；
 *   4. 权限、来源等后续字段可在此统一兜底，UI 不需要写防御性判断。
 */

import { formatAspectRatio, formatBytes, formatDate, formatMegapixel } from '@/utils/format'

/** 取第一个非空值，兼容多种命名 */
function pick(source, keys, fallback = undefined) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return fallback
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string' && value.trim()) return value.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** tolerant URL：相对路径、带空格、协议缺失等情况兜底 */
function normalizeUrl(url, base = '') {
  if (!url) return ''
  const text = String(url).trim()
  if (!text) return ''

  if (/^(https?:)?\/\//i.test(text) || text.startsWith('data:') || text.startsWith('blob:')) return text
  if (text.startsWith('/')) return text

  try {
    return new URL(encodeURI(text), base || window.location.origin).toString()
  } catch {
    return text
  }
}

/**
 * 原始服务端对象 → Photo 领域模型
 * @param {object} raw 服务端返回的单个照片对象
 */
export function adaptPhoto(raw = {}) {
  if (!raw || typeof raw !== 'object') return null

  const id = String(pick(raw, ['id', 'photoId', 'photo_id', 'uid'], ''))
  if (!id) return null

  const urlsSource = { ...(raw.urls || raw.url || {}), ...raw }

  const thumbUrl = normalizeUrl(pick(urlsSource, ['thumbUrl', 'thumbnail', 'thumb', 'urls.thumb']))
  const regularUrl = normalizeUrl(pick(urlsSource, ['regularUrl', 'preview', 'regular', 'urls.regular']))
  const fullUrl = normalizeUrl(pick(urlsSource, ['fullUrl', 'original', 'raw', 'full', 'urls.full', 'src', 'url']))
  const downloadUrl = normalizeUrl(pick(urlsSource, ['downloadUrl', 'download', 'urls.download']))

  const urls = {
    thumb: thumbUrl || regularUrl || fullUrl,
    regular: regularUrl || fullUrl || thumbUrl,
    full: fullUrl || regularUrl || thumbUrl,
    download: downloadUrl || fullUrl || regularUrl || thumbUrl,
    page: normalizeUrl(pick(raw, ['pageUrl', 'page', 'detailUrl'], ''))
  }

  const width = toNumber(pick(raw, ['width', 'imageWidth', 'pixelWidth']), 0)
  const height = toNumber(pick(raw, ['height', 'imageHeight', 'pixelHeight']), 0)
  const byteSize = toNumber(pick(raw, ['size', 'byteSize', 'fileSize', 'filesize']), 0)

  const fileName = String(pick(raw, ['fileName', 'file_name', 'name', 'filename'], '') || '')
  const mimeType = String(pick(raw, ['mimeType', 'mime_type', 'contentType'], 'image/jpeg') || 'image/jpeg')
  const title = String(pick(raw, ['title', 'displayName', 'caption'], '') || '')

  const permissionsSource = raw.permissions || raw.permission || {}
  const permissions = {
    view: permissionsSource.canView !== false && raw.canView !== false,
    download: permissionsSource.canDownload !== false && raw.canDownload !== false,
    edit: permissionsSource.canEdit === true || raw.canEdit === true,
    delete: permissionsSource.canDelete === true || raw.canDelete === true,
    share: permissionsSource.canShare === true || raw.canShare === true
  }

  const exifSource = raw.exif || raw.meta || {}
  const exif = {
    camera: String(pick(exifSource, ['camera', 'Model', 'model'], '') || ''),
    lens: String(pick(exifSource, ['lens', 'LensModel'], '') || ''),
    iso: toNumber(pick(exifSource, ['iso', 'ISO']), 0) || null,
    fNumber: toNumber(pick(exifSource, ['fNumber', 'FNumber', 'aperture']), 0) || null,
    exposureTime: pick(exifSource, ['exposureTime', 'ExposureTime', 'shutter'], '') || '',
    focalLength: pick(exifSource, ['focalLength', 'FocalLength'], '') || '',
    software: String(pick(exifSource, ['software', 'Software'], '') || '')
  }

  const locationSource = raw.location || raw.geo || {}

  const photo = {
    // ---- 基础标识 ----
    id,
    title,
    description: String(pick(raw, ['description', 'desc', 'remark'], '') || ''),
    fileName: fileName || `${id}.jpg`,
    mimeType,
    extension: (() => {
      const matched = /\.([a-zA-Z0-9]{2,5})$/.exec(fileName)
      return matched ? matched[1].toLowerCase() : (mimeType.split('/')[1] || 'jpg')
    })(),

    // ---- 尺寸 & 体积 ----
    width,
    height,
    byteSize,
    thumbWidth: toNumber(pick(raw, ['thumbWidth', 'thumbnailWidth']), 0),
    thumbHeight: toNumber(pick(raw, ['thumbHeight', 'thumbnailHeight']), 0),
    aspectRatio: formatAspectRatio(width, height),
    megapixel: formatMegapixel(width, height),
    orientation: width && height ? (width === height ? 'square' : width > height ? 'landscape' : 'portrait') : 'landscape',
    dominantColor: String(pick(raw, ['dominantColor', 'color', 'avgColor'], '#e9edf2') || '#e9edf2'),

    // ---- 时间 ----
    createdAt: pick(raw, ['createdAt', 'createTime', 'created_at', 'uploadedAt'], '') || '',
    updatedAt: pick(raw, ['updatedAt', 'updateTime', 'updated_at'], '') || '',
    takenAt: pick(raw, ['takenAt', 'shootTime', 'shotAt', 'taken_at'], '') || '',
    createdAtDate: toDate(pick(raw, ['createdAt', 'createTime', 'created_at'])),
    updatedAtDate: toDate(pick(raw, ['updatedAt', 'updateTime', 'updated_at'])),
    takenAtDate: toDate(pick(raw, ['takenAt', 'shootTime', 'shotAt', 'taken_at'])),

    // ---- 组织维度 ----
    tags: ensureArray(pick(raw, ['tags', 'labels'])),
    author: raw.author || raw.uploader || null,
    album: raw.album || raw.folder || null,
    location: {
      name: String(pick(locationSource, ['name', 'place'], '') || ''),
      latitude: toNumber(pick(locationSource, ['latitude', 'lat']), null),
      longitude: toNumber(pick(locationSource, ['longitude', 'lng', 'lon']), null)
    },

    // ---- 文件资源 ----
    urls,
    exif,

    // ---- 权限（后续管理能力的开关依据）----
    permissions,

    // ---- 原始报文，兜底/调试/后续自定义字段从这里取 ----
    raw
  }

  // ---- 派生字段 ----
  photo.displayName = photo.title || photo.fileName
  photo.resolution = width && height ? `${width} × ${height}` : ''
  photo.sizeText = byteSize ? formatBytes(byteSize) : ''

  let shotSource = null
  try {
    shotSource = photo.takenAtDate || photo.createdAtDate || parseDateFromFileName(photo.fileName)
  } catch {
    shotSource = null
  }
  photo.shotAtDate = shotSource
  photo.shotAtText = shotSource ? formatDate(shotSource, 'YYYY-MM-DD HH:mm') : ''

  // 下载文件名：标题 + 扩展名，保证可读性与合法性
  photo.downloadName = ensureExtension(photo.title || stripExtension(photo.fileName) || photo.id, photo.extension)

  /** 列表里用于 <img> 的占位宽高，避免布局抖动 */
  photo.gridSpan = photo.aspectRatio >= 1.6 ? 2 : 1

  return photo
}

function stripExtension(name) {
  return String(name || '').replace(/\.[a-zA-Z0-9]{2,5}$/, '')
}

function ensureExtension(name, ext) {
  const base = String(name || '').trim()
  if (!base) return `photo.${ext}`
  return /\.[a-zA-Z0-9]{2,5}$/.test(base) ? base : `${base}.${ext}`
}

/** 兜底：从 IMG_20261001_064000.jpg 这类文件名里尝试解析拍摄日期 */
function parseDateFromFileName(fileName) {
  const matched = /(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})?/.exec(String(fileName || ''))
  if (!matched) return null
  const [, y, m, d, h, min, s] = matched
  return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s || 0))
}

/** 批量适配 */
export function adaptPhotoList(list = []) {
  return (Array.isArray(list) ? list : []).map(adaptPhoto).filter(Boolean)
}

/**
 * Photo 模型 → 可提交给服务端的对象（重命名、编辑等后续能力复用）
 * 目前只把前端可编辑的字段挑出来，避免把派生字段回传。
 */
export function serializePhoto(photo = {}) {
  return {
    id: photo.id,
    title: photo.title,
    description: photo.description,
    fileName: photo.fileName,
    tags: photo.tags
  }
}

export default {
  adaptPhoto,
  adaptPhotoList,
  serializePhoto
}

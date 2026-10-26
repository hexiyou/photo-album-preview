/**
 * MediaItem 领域模型 & 适配器
 * ---------------------------------------------------------------------------
 * 这是「服务端 JSON」与「前端 UI」之间的唯一翻译层：
 *
 *   服务端原始字段 ──adaptMedia()──► MediaItem 领域模型 ──► 组件消费
 *
 * 为什么要这一层：
 *   1. 后端字段名变化（比如 size → byteSize）时，只改这里，不用动组件；
 *   2. 兼容多种命名习惯（下划线 / 驼峰 / 嵌套 / 扁平）；
 *   3. 所有派生字段（体积文本、时长、像素、宽高比、下载名）在这里算好，组件保持"笨"；
 *   4. 权限、来源等后续字段可在此统一兜底，UI 不需要写防御性判断。
 *
 * 图片 / 视频的融合策略（以图片为主，视频为辅）：
 *   · 共用字段放在外层，两种类型语义一致（尺寸对照片是 6000×4000，对视频是 1920×1080）
 *   · 图片专属字段（exif / megapixel）在视频项里为 null / 空串，组件无需改分支
 *   · 视频专属字段收进 video 子对象，图片项里为 null，加字段波及不到图片路径
 */

import { formatAspectRatio, formatBytes, formatDate, formatDuration, formatMegapixel } from '@/utils/format'

/** 纳入管理的容器格式（当前只保证 H.264 MP4 可播） */
const SUPPORTED_CONTAINERS = new Set(['mp4', 'm4v'])
const SUPPORTED_CODECS = new Set(['h264', 'avc', 'avc1', 'avc3'])

/** 常见编码名归一化到统一叫法 */
const CODEC_ALIASES = {
  avc: 'h264',
  avc1: 'h264',
  avc3: 'h264',
  h264: 'h264'
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif', 'tif', 'tiff', 'heic'])

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

function extensionOf(fileName, mimeType) {
  const matched = /\.([a-zA-Z0-9]{2,5})$/.exec(String(fileName || ''))
  if (matched) return matched[1].toLowerCase()
  const fromMime = String(mimeType || '').split('/')[1]
  return fromMime ? fromMime.toLowerCase().split('+')[0] : ''
}

/**
 * 判定媒体类型：显式声明 > MIME > 扩展名 > 默认图片
 * 显式声明兼容 kind / mediaType / type 三种写法
 */
function detectKind(raw, mimeType, fileName) {
  const declared = String(pick(raw, ['kind', 'mediaType', 'media_type'], '') || '').toLowerCase()
  if (declared) {
    if (['image', 'photo', 'picture', 'img'].includes(declared)) return 'image'
    if (['video', 'clip', 'movie', 'film'].includes(declared)) return 'video'
  }

  const mime = String(mimeType || '').toLowerCase()
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('image/')) return 'image'

  const ext = extensionOf(fileName, mimeType)
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'

  return 'image'
}

/** 帧率：兼容 29.97 与 30000/1001 两种写法 */
function toFrameRate(value) {
  if (value === undefined || value === null || value === '') return null
  const text = String(value)

  if (text.includes('/')) {
    const [a, b] = text.split('/').map(Number)
    if (!Number.isFinite(a) || !Number.isFinite(b) || !b) return null
    return Number((a / b).toFixed(3))
  }

  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(3)) : null
}

function normalizeCodec(value) {
  const text = String(value || '').toLowerCase().trim()
  if (!text) return ''
  return CODEC_ALIASES[text] || text
}

/**
 * 视频外挂属性
 * 返回 null 表示该媒体不是视频（或视频元信息完全缺失但仍是视频 → 返回带 null 字段的对象）
 */
function adaptVideo(raw, { width, height, extension, hasPoster }) {
  // 元信息可能嵌套在 video / videoMeta 里，也可能平铺在顶层（嵌套优先）
  const nested = raw.video || raw.videoMeta || raw.meta?.video || null
  const flat = { ...raw, ...(nested || {}) }

  const duration = toNumber(pick(flat, ['duration', 'durationSec', 'durationSeconds', 'length']), 0) || null
  const codec = normalizeCodec(pick(flat, ['codec', 'codecName', 'videoCodec', 'codec_name'], ''))
  const audioCodec = String(pick(flat, ['audioCodec', 'audio_codec', 'audioCodecName'], '') || '').toLowerCase()
  const container = extension

  // 旋转：手机竖拍视频常在容器 metadata 里带 rotate=90/270，读出后用于交换宽高
  const rotationMeta = toNumber(pick(flat, ['rotation', 'rotate', 'rotationMeta'], 0), 0)

  let hasAudio = null
  if (flat.hasAudio !== undefined && flat.hasAudio !== null) hasAudio = Boolean(flat.hasAudio)
  else if (audioCodec) hasAudio = true

  const explicitSupported = nested?.supported ?? raw.supported
  const supported =
    explicitSupported !== undefined && explicitSupported !== null
      ? Boolean(explicitSupported)
      : SUPPORTED_CONTAINERS.has(container) && (!codec || SUPPORTED_CODECS.has(codec))

  return {
    duration,
    durationText: formatDuration(duration),
    // 竖拍视频：宽高按显示方向归一，避免列表里横着躺
    width: rotationMeta % 180 === 0 ? width : height,
    height: rotationMeta % 180 === 0 ? height : width,
    codec: codec || '',
    audioCodec,
    hasAudio,
    bitrate: toNumber(pick(flat, ['bitrate', 'bit_rate', 'bitRate']), 0) || null,
    frameRate: toFrameRate(pick(flat, ['frameRate', 'fps', 'r_frame_rate', 'avgFrameRate'], '')),
    rotation: rotationMeta,
    orientation: '',
    supported,
    thumbReady: hasPoster,
    previewUrl: normalizeUrl(pick(flat, ['previewUrl', 'sprite', 'spriteUrl'], ''))
  }
}

/**
 * 原始服务端对象 → MediaItem 领域模型
 * @param {object} raw 服务端返回的单个媒体对象（图片或视频）
 */
export function adaptMedia(raw = {}) {
  if (!raw || typeof raw !== 'object') return null

  const id = String(pick(raw, ['id', 'mediaId', 'photoId', 'photo_id', 'uid'], ''))
  if (!id) return null

  const fileName = String(pick(raw, ['fileName', 'file_name', 'name', 'filename'], '') || '')
  const declaredMime = String(pick(raw, ['mimeType', 'mime_type', 'contentType'], '') || '')

  const kind = detectKind(raw, declaredMime, fileName)
  const isVideo = kind === 'video'

  const mimeType = declaredMime || (isVideo ? 'video/mp4' : 'image/jpeg')
  const extension = extensionOf(fileName, mimeType) || (isVideo ? 'mp4' : 'jpg')
  const title = String(pick(raw, ['title', 'displayName', 'caption'], '') || '')

  const urlsSource = { ...(raw.urls || raw.url || {}), ...raw }
  const thumbUrl = normalizeUrl(pick(urlsSource, ['thumbUrl', 'thumbnail', 'thumb']))
  const posterUrl = normalizeUrl(pick(urlsSource, ['posterUrl', 'poster', 'cover', 'coverUrl']))
  const regularUrl = normalizeUrl(pick(urlsSource, ['regularUrl', 'preview', 'regular']))
  const fullUrl = normalizeUrl(pick(urlsSource, ['fullUrl', 'original', 'raw', 'full', 'src', 'url']))
  const downloadUrl = normalizeUrl(pick(urlsSource, ['downloadUrl', 'download']))
  const hasPoster = Boolean(posterUrl || thumbUrl)

  const width = toNumber(pick(raw, ['width', 'imageWidth', 'pixelWidth']), 0)
  const height = toNumber(pick(raw, ['height', 'imageHeight', 'pixelHeight']), 0)
  const byteSize = toNumber(pick(raw, ['size', 'byteSize', 'fileSize', 'filesize']), 0)

  const permissionsSource = raw.permissions || raw.permission || {}
  const permissions = {
    view: permissionsSource.canView !== false && raw.canView !== false,
    download: permissionsSource.canDownload !== false && raw.canDownload !== false,
    edit: permissionsSource.canEdit === true || raw.canEdit === true,
    delete: permissionsSource.canDelete === true || raw.canDelete === true,
    share: permissionsSource.canShare === true || raw.canShare === true
  }

  const exifSource = raw.exif || raw.meta || {}
  // 图片专属：视频项统一为 null，现有读 exif 的组件代码无需任何改动
  const exif = isVideo
    ? null
    : {
        camera: String(pick(exifSource, ['camera', 'Model', 'model'], '') || ''),
        lens: String(pick(exifSource, ['lens', 'LensModel'], '') || ''),
        iso: toNumber(pick(exifSource, ['iso', 'ISO']), 0) || null,
        fNumber: toNumber(pick(exifSource, ['fNumber', 'FNumber', 'aperture']), 0) || null,
        exposureTime: pick(exifSource, ['exposureTime', 'ExposureTime', 'shutter'], '') || '',
        focalLength: pick(exifSource, ['focalLength', 'FocalLength'], '') || '',
        software: String(pick(exifSource, ['software', 'Software'], '') || '')
      }

  const locationSource = raw.location || raw.geo || {}

  // 缩略图回退策略：**图片可以，视频绝不可以**
  //   图片：原图本来就显示得出来，没缩略图时直接显示原图是合理的降级；
  //   视频：一旦回退到自身，卡片会渲染 <img src="xxx.mp4">，
  //        浏览器会把整个视频文件当图片下载下来，网格直接变成流量黑洞，
  //        而且拿到的还是解码不了的字节。所以宁可留空，让卡片显示图标占位。
  const thumbCandidate = isVideo ? thumbUrl || posterUrl : thumbUrl || regularUrl || fullUrl

  const media = {
    // ---- 类型判别 ----
    kind,
    isVideo,
    isImage: !isVideo,

    // ---- 基础标识 ----
    id,
    title,
    description: String(pick(raw, ['description', 'desc', 'remark'], '') || ''),
    fileName: fileName || `${id}.${extension}`,
    mimeType,
    extension,

    // ---- 尺寸 & 体积（图片为像素，视频为分辨率，共用同一字段）----
    width,
    height,
    byteSize,
    thumbWidth: toNumber(pick(raw, ['thumbWidth', 'thumbnailWidth']), 0),
    thumbHeight: toNumber(pick(raw, ['thumbHeight', 'thumbnailHeight']), 0),
    aspectRatio: formatAspectRatio(width, height),
    megapixel: isVideo ? '' : formatMegapixel(width, height),
    orientation: width && height ? (width === height ? 'square' : width > height ? 'landscape' : 'portrait') : 'landscape',
    dominantColor: String(pick(raw, ['dominantColor', 'color', 'avgColor'], '#e9edf2') || '#e9edf2'),

    // ---- 时间 ----
    createdAt: pick(raw, ['createdAt', 'createTime', 'created_at', 'uploadedAt'], '') || '',
    updatedAt: pick(raw, ['updatedAt', 'updateTime', 'updated_at'], '') || '',
    takenAt: pick(raw, ['takenAt', 'shootTime', 'shotAt', 'taken_at'], '') || '',
    createdAtDate: toDate(pick(raw, ['createdAt', 'createTime', 'created_at'])),
    updatedAtDate: toDate(pick(raw, ['updatedAt', 'updateTime', 'updated_at'])),
    takenAtDate: toDate(pick(raw, ['takenAt', 'shootTime', 'shotAt', 'taken_at'])),

    // ---- 组织维度（图片与视频共用）----
    tags: ensureArray(pick(raw, ['tags', 'labels'])),
    author: raw.author || raw.uploader || null,
    album: raw.album || raw.folder || null,
    location: {
      name: String(pick(locationSource, ['name', 'place'], '') || ''),
      latitude: toNumber(pick(locationSource, ['latitude', 'lat']), null),
      longitude: toNumber(pick(locationSource, ['longitude', 'lng', 'lon']), null)
    },

    // ---- 文件资源 ----
    urls: {
      thumb: thumbCandidate,
      poster: posterUrl || thumbUrl || (isVideo ? '' : regularUrl),
      regular: regularUrl || fullUrl || thumbCandidate,
      full: fullUrl || regularUrl || thumbCandidate,
      /** 视频播放源；图片为空串，组件用 urls.full 兜底 */
      play: isVideo ? fullUrl || regularUrl || thumbCandidate : '',
      download: downloadUrl || fullUrl || regularUrl || thumbCandidate,
      page: normalizeUrl(pick(raw, ['pageUrl', 'page', 'detailUrl'], ''))
    },
    exif,

    // ---- ★ 视频外挂属性（图片为 null）----
    video: isVideo ? adaptVideo(raw, { width, height, extension, hasPoster }) : null,

    // ---- 权限（后续管理能力的开关依据）----
    permissions,

    // ---- 原始报文，兜底/调试/后续自定义字段从这里取 ----
    raw
  }

  // 视频的宽高按旋转归一，保证竖视频在列表里是竖的
  if (media.video && media.video.width && media.video.height) {
    media.width = media.video.width
    media.height = media.video.height
    media.aspectRatio = formatAspectRatio(media.video.width, media.video.height)
    media.orientation =
      media.video.width === media.video.height ? 'square' : media.video.width > media.video.height ? 'landscape' : 'portrait'
    media.video.orientation = media.orientation
  }

  // ---- 派生字段 ----
  media.displayName = media.title || media.fileName
  media.resolution = media.width && media.height ? `${media.width} × ${media.height}` : ''
  media.sizeText = byteSize ? formatBytes(byteSize) : ''

  let shotSource = null
  try {
    shotSource = media.takenAtDate || media.createdAtDate || parseDateFromFileName(media.fileName)
  } catch {
    shotSource = null
  }
  media.shotAtDate = shotSource
  media.shotAtText = shotSource ? formatDate(shotSource, 'YYYY-MM-DD HH:mm') : ''

  // 播放源：视频用 urls.play，图片用 urls.full
  media.playUrl = isVideo ? media.urls.play || media.urls.full : media.urls.full || media.urls.regular

  // 下载文件名：标题 + 扩展名，保证可读性与合法性
  media.downloadName = ensureExtension(media.title || stripExtension(media.fileName) || media.id, media.extension)

  /** 列表里用于 <img> 的占位宽高，避免布局抖动 */
  media.gridSpan = media.aspectRatio >= 1.6 ? 2 : 1

  return media
}

function stripExtension(name) {
  return String(name || '').replace(/\.[a-zA-Z0-9]{2,5}$/, '')
}

function ensureExtension(name, ext) {
  const base = String(name || '').trim()
  if (!base) return `media.${ext}`
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
export function adaptMediaList(list = []) {
  return (Array.isArray(list) ? list : []).map(adaptMedia).filter(Boolean)
}

/** 类型筛选：all 返回全部 */
export function filterByKind(list = [], kind = 'all') {
  if (!kind || kind === 'all') return list
  return list.filter((item) => (kind === 'video' ? item.isVideo : item.isImage))
}

/**
 * MediaItem 模型 → 可提交给服务端的对象（重命名、编辑等后续能力复用）
 * 目前只把前端可编辑的字段挑出来，避免把派生字段回传。
 */
export function serializeMedia(media = {}) {
  return {
    id: media.id,
    kind: media.kind,
    title: media.title,
    description: media.description,
    fileName: media.fileName,
    tags: media.tags
  }
}

export default {
  adaptMedia,
  adaptMediaList,
  filterByKind,
  serializeMedia
}

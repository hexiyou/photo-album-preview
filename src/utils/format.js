/**
 * 通用格式化工具（纯函数，便于单测）
 */

const DATE_PADDING = (n) => String(n).padStart(2, '0')

/** 字节数 → 人类可读文本 */
export function formatBytes(bytes, fractionDigits = 1) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const size = value / 1024 ** index

  return `${index === 0 ? size : trimZeros(size.toFixed(index === 0 ? 0 : fractionDigits))} ${units[index]}`
}

function trimZeros(text) {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/** ISO 时间 → 指定格式 */
export function formatDate(input, pattern = 'YYYY-MM-DD HH:mm') {
  if (!input) return '—'
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '—'

  const map = {
    YYYY: String(date.getFullYear()),
    MM: DATE_PADDING(date.getMonth() + 1),
    DD: DATE_PADDING(date.getDate()),
    HH: DATE_PADDING(date.getHours()),
    mm: DATE_PADDING(date.getMinutes()),
    ss: DATE_PADDING(date.getSeconds())
  }

  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token] ?? token)
}

/** 相对时间（刚刚 / 3 分钟前 / 2 天前） */
export function formatRelative(input, now = Date.now()) {
  if (!input) return '—'
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '—'

  const diff = now - date.getTime()
  const abs = Math.abs(diff)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (abs < minute) return '刚刚'
  if (abs < hour) return `${Math.floor(abs / minute)} 分钟前`
  if (abs < day) return `${Math.floor(abs / hour)} 小时前`
  if (abs < 30 * day) return `${Math.floor(abs / day)} 天前`
  return formatDate(date, 'YYYY-MM-DD')
}

/** 快门速度：1/250 */
export function formatExposure(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value >= 1) return `${trimZeros(value.toFixed(1))}s`
  return `1/${Math.round(1 / value)}`
}

/** 焦距：35mm */
export function formatFocalLength(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `${Math.round(n)}mm`
}

/** 光圈：f/2.8 */
export function formatFNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `f/${trimZeros(String(n))}`
}

/** 像素数：（如果存在 MP 换算，保留一位小数）*/
export function formatMegapixel(width, height) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return ''
  return `${trimZeros((w * h / 1_000_000).toFixed(1))} MP`
}

/**
 * 秒 → 时长文本
 * 23.5 → 00:23   3725 → 01:02:05
 * 非正数返回空串，交由调用方决定显示占位符
 */
export function formatDuration(seconds) {
  const total = Number(seconds)
  if (!Number.isFinite(total) || total <= 0) return ''

  const s = Math.floor(total % 60)
  const m = Math.floor((total / 60) % 60)
  const h = Math.floor(total / 3600)

  return h > 0
    ? `${DATE_PADDING(h)}:${DATE_PADDING(m)}:${DATE_PADDING(s)}`
    : `${DATE_PADDING(m)}:${DATE_PADDING(s)}`
}

/** 宽高比，保留两位小数 */
export function formatAspectRatio(width, height) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return 1
  return Number((w / h).toFixed(3))
}

export default {
  formatBytes,
  formatDate,
  formatRelative,
  formatExposure,
  formatFocalLength,
  formatFNumber,
  formatMegapixel,
  formatAspectRatio,
  formatDuration
}

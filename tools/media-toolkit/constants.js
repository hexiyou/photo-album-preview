/**
 * 媒体工具集共用常量
 * ---------------------------------------------------------------------------
 * 当前阶段最广泛支持的是 H.264 MP4，其余容器/编码也允许登记进来
 * （用户可能存着 mov / webm 等素材），只是会标记 supported=false 提示无法播放。
 */

export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff'])

export const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv'])

/** 浏览器可直接播放的组合 */
export const SUPPORTED_CONTAINERS = new Set(['mp4', 'm4v'])
export const SUPPORTED_CODECS = new Set(['h264', 'avc', 'avc1', 'avc3'])

export const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv'
}

export function mimeOf(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || 'application/octet-stream'
}

export default {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  SUPPORTED_CONTAINERS,
  SUPPORTED_CODECS,
  MIME_BY_EXT,
  mimeOf
}

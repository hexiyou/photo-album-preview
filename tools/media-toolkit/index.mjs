/**
 * 媒体工具集统一出口
 * ---------------------------------------------------------------------------
 * 媒体服务（media/server.mjs）只依赖这个入口，
 * 这样 tools/media-toolkit 内部怎么重构都不影响调用方。
 */

export { describe, detect, generateThumbnail, probeMedia } from './ffmpeg.js'

export {
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

export {
  IMAGE_EXTENSIONS,
  MIME_BY_EXT,
  SUPPORTED_CODECS,
  SUPPORTED_CONTAINERS,
  VIDEO_EXTENSIONS,
  mimeOf
} from './constants.js'

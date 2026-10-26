/**
 * Photo 领域模型（兼容出口）
 * ---------------------------------------------------------------------------
 * 真正的实现已迁移到 model/media.js（MediaItem 统一模型，图片 + 视频）。
 *
 * 之所以保留这个文件：现有代码里有大量 `from '@/model/photo'` 的 import，
 * 为了不让「支持视频」这个需求演变成一次全项目改名，这里做零成本转发。
 *
 * 约定：
 *   · 新代码一律从 '@/model/media' 导入，使用 adaptMedia / MediaItem 语义；
 *   · 老代码继续用 adaptPhoto 也能工作，二者是同一个函数；
 *   · 后续若要彻底切到 Media* 命名，删掉本文件并批量替换 import 即可。
 */

import { adaptMedia, adaptMediaList, filterByKind, serializeMedia } from './media'

/** @deprecated 语义等价，新代码请用 adaptMedia */
export const adaptPhoto = adaptMedia
/** @deprecated 语义等价，新代码请用 adaptMediaList */
export const adaptPhotoList = adaptMediaList
/** @deprecated 语义等价，新代码请用 serializeMedia */
export const serializePhoto = serializeMedia

export { adaptMedia, adaptMediaList, filterByKind, serializeMedia }

export default {
  adaptPhoto,
  adaptPhotoList,
  serializePhoto,
  adaptMedia,
  adaptMediaList,
  filterByKind,
  serializeMedia
}

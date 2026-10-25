/**
 * 相册数据 API 门面
 * ---------------------------------------------------------------------------
 * 组件永远只和 photoApi 打交道，由它决定走 mock 还是真实 HTTP，
 * 因此「联调切换」不需要改动任何一行业务代码。
 *
 * 约定：所有方法返回领域模型（Photo），不返回裸 JSON。
 */

import { runtimeConfig } from '@/env'
import httpSource from './sources/httpSource'
import mockSource from './sources/mockSource'

export const activeSource = runtimeConfig.dataSource === 'api' ? httpSource : mockSource

/** 当前生效的数据源名称，UI 上做角标提示用 */
export const activeSourceName = activeSource.name

const EMPTY_RESULT = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasMore: false }
}

export const photoApi = {
  /**
   * 分页查询照片列表
   * @param {object} params {page,pageSize,keyword,albumId,tag,sort,order}
   */
  async fetchPhotos(params = {}, options = {}) {
    try {
      return await activeSource.fetchPhotos(params, options)
    } catch (error) {
      if (options.throwOnError) throw error
      return { ...EMPTY_RESULT, error }
    }
  },

  fetchPhoto(id, options = {}) {
    return activeSource.fetchPhoto(id, options)
  },

  fetchPhotosByIds(ids, options = {}) {
    return activeSource.fetchPhotosByIds(ids, options)
  },

  fetchAlbums(options = {}) {
    return activeSource.fetchAlbums(options)
  },

  fetchTags(options = {}) {
    return activeSource.fetchTags(options)
  },

  // ---- 以下能力本期关闭，先保留调用签名，后端就绪后由 source 提供实现 ----
  uploadPhotos(files, options = {}) {
    return activeSource.uploadPhotos(files, options)
  },

  renamePhoto(id, title, options = {}) {
    return activeSource.renamePhoto(id, title, options)
  },

  deletePhotos(ids, options = {}) {
    return activeSource.deletePhotos(ids, options)
  }
}

export default photoApi

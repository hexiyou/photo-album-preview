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
import localSource from './sources/localSource'
import mockSource from './sources/mockSource'

/**
 * 数据源选择：
 *   api   → 真实后端接口
 *   local → 本地媒体服务（media/server.mjs，扫描本地目录）
 *   mock  → 内置演示数据（默认）
 */
function resolveSource(name) {
  if (name === 'api') return httpSource
  if (name === 'local') return localSource
  return mockSource
}

export const activeSource = resolveSource(runtimeConfig.dataSource)

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
  },

  // ---- 目录扫描：仅本地媒体服务提供 ----
  scanDirectory(payload = {}, options = {}) {
    if (typeof activeSource.scanDirectory !== 'function') {
      return Promise.reject(new Error('当前数据源不支持目录扫描，请改用 VITE_DATA_SOURCE=local'))
    }
    return activeSource.scanDirectory(payload, options)
  },

  fetchScanStatus(options = {}) {
    if (typeof activeSource.fetchScanStatus !== 'function') return Promise.resolve(null)
    return activeSource.fetchScanStatus(options)
  }
}

/**
 * 语义别名：新代码用 mediaApi，指向同一个门面。
 * 保留 photoApi 是为了让既有 import 继续工作（见"保留 Photo* 命名"的决策）。
 */
export const mediaApi = photoApi

export default photoApi

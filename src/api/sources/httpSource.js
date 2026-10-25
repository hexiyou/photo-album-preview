/**
 * HTTP 数据源（真实后端）
 * ---------------------------------------------------------------------------
 * 所有接口约定见 API.md。这里只负责"拼 URL + 适配返回值"，
 * 鉴权、超时、错误码处理统一在 http.js 里完成。
 *
 * 后端需满足：
 *   GET {baseUrl}/photos?page=1&pageSize=20&...   → { code, message, data: { list, pagination } }
 *   GET {baseUrl}/photos/{id}                     → { code, message, data: Photo }
 */

import request from '@/api/http'
import { adaptPhoto, adaptPhotoList } from '@/model/photo'
import { ApiError } from '@/api/http'

function normalizePagination(data = {}, fallback = {}) {
  return {
    page: Number(data.page ?? fallback.page ?? 1),
    pageSize: Number(data.pageSize ?? fallback.pageSize ?? 20),
    total: Number(data.total ?? data.totalCount ?? 0),
    totalPages: Number(data.totalPages ?? data.pageCount ?? 1),
    hasMore: data.hasMore ?? (Number(data.page ?? 1) < Number(data.totalPages ?? 1))
  }
}

export const httpSource = {
  name: 'api',

  async fetchPhotos(params = {}, options = {}) {
    const { page = 1, pageSize = 20, keyword = '', albumId = '', tag = '', sort = 'takenAt', order = 'desc' } = params

    const data = await request('/photos', {
      query: { page, pageSize, keyword, albumId, tag, sort, order },
      signal: options.signal
    })

    if (Array.isArray(data)) {
      // 兼容直接返回数组的后端
      return { list: adaptPhotoList(data), pagination: normalizePagination({}, { page, pageSize }) }
    }

    return {
      list: adaptPhotoList(data?.list ?? data?.items ?? data?.records ?? []),
      pagination: normalizePagination(data?.pagination ?? data?.pager ?? {}, { page, pageSize })
    }
  },

  async fetchPhoto(id, options = {}) {
    if (!id) throw new ApiError('缺少照片 ID', { code: 400 })
    const data = await request(`/photos/${encodeURIComponent(id)}`, { signal: options.signal })
    return adaptPhoto(data?.photo ?? data)
  },

  async fetchPhotosByIds(ids = [], options = {}) {
    if (!ids.length) return []
    const data = await request('/photos/batch', { query: { ids: ids.join(',') }, signal: options.signal })
    return adaptPhotoList(Array.isArray(data) ? data : data?.list ?? [])
  },

  async fetchAlbums(options = {}) {
    const data = await request('/albums', { signal: options.signal })
    return Array.isArray(data) ? data : data?.list ?? []
  },

  async fetchTags(options = {}) {
    const data = await request('/tags', { signal: options.signal })
    return Array.isArray(data) ? data : data?.list ?? []
  },

  // -------------------------------------------------------------------------
  // 管理类接口（本期不启用，先把调用形态定义好）
  // -------------------------------------------------------------------------
  async uploadPhotos() {
    throw new ApiError('上传接口尚未实现', { code: 501 })
  },

  async renamePhoto() {
    throw new ApiError('重命名接口尚未实现', { code: 501 })
  },

  async deletePhotos() {
    throw new ApiError('删除接口尚未实现', { code: 501 })
  }
}

export default httpSource

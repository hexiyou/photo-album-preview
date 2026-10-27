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
import { ApiError } from '@/api/http'
import { runtimeConfig } from '@/env'
import { adaptMedia, adaptMediaList, filterByKind } from '@/model/media'

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
    const {
      page = 1,
      pageSize = 20,
      keyword = '',
      albumId = '',
      tag = '',
      sort = 'takenAt',
      order = 'desc',
      kind = 'all'
    } = params

    // kind=all 时不传该参数，保证与未升级的后端请求完全一致
    const query = { page, pageSize, keyword, albumId, tag, sort, order }
    if (kind && kind !== 'all') query.kind = kind

    const data = await request('/photos', { query, signal: options.signal })

    if (Array.isArray(data)) {
      // 兼容直接返回数组的后端
      return {
        list: filterByKind(adaptMediaList(data), kind),
        pagination: normalizePagination({}, { page, pageSize })
      }
    }

    return {
      // 后端若尚未支持 kind 参数，这里做一次幂等的本地兜底过滤
      list: filterByKind(adaptMediaList(data?.list ?? data?.items ?? data?.records ?? []), kind),
      pagination: normalizePagination(data?.pagination ?? data?.pager ?? {}, { page, pageSize })
    }
  },

  async fetchPhoto(id, options = {}) {
    if (!id) throw new ApiError('缺少媒体 ID', { code: 400 })
    const data = await request(`/photos/${encodeURIComponent(id)}`, { signal: options.signal })
    return adaptMedia(data?.photo ?? data?.media ?? data)
  },

  async fetchPhotosByIds(ids = [], options = {}) {
    if (!ids.length) return []
    const data = await request('/photos/batch', { query: { ids: ids.join(',') }, signal: options.signal })
    return adaptMediaList(Array.isArray(data) ? data : data?.list ?? [])
  },

  async fetchAlbums(options = {}) {
    const data = await request('/albums', { signal: options.signal })
    return Array.isArray(data) ? data : data?.list ?? []
  },

  async   fetchTags(options = {}) {
    const data = await request('/tags', { signal: options.signal })
    return Array.isArray(data) ? data : data?.list ?? []
  },

  /**
   * 进度预览雪碧图
   * 后端若未提供 GET /sprite/{id}，这里会拿到 404，调用方应据此降级为实时取帧。
   * @returns {Promise<{state:string, sprite?:object, reason?:string}>}
   */
  async fetchSprite(id, options = {}) {
    const data = await request(`/sprite/${encodeURIComponent(id)}`, { signal: options.signal })
    return { state: data?.state || 'ready', sprite: data?.sprite ?? data, reason: data?.reason || '' }
  },

  /**
   * 修改媒体信息（标题 / 描述 / 标签 / 相册）
   * 走的是 API.md 里预留的 PATCH /photos/{id}
   */
  async updateMeta(id, patch = {}, options = {}) {
    const data = await request(`/photos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      signal: options.signal
    })
    return adaptMedia(data?.photo ?? data?.media ?? data)
  },

  // -------------------------------------------------------------------------
  // 管理类接口（P3：上传 / 重命名 / 删除，契约见 API.md §5.11–§5.14）
  // 后端未实现时返回 404 / 403，由调用方提示并回滚列表，不会静默失败。
  // -------------------------------------------------------------------------

  /**
   * 上传文件（multipart/form-data）
   * @param {File[]|FileList} files
   * @param {{albumId?:string, directory?:string, signal?:AbortSignal, timeout?:number}} options
   * @returns {Promise<{list: object[], failed: object[]}>}
   */
  async uploadPhotos(files = [], options = {}) {
    const picked = Array.from(files || []).filter(Boolean)
    if (!picked.length) throw new ApiError('请先选择要上传的文件', { code: 400 })

    const form = new FormData()
    picked.forEach((file) => form.append('files', file, file.name))
    if (options.albumId) form.append('albumId', String(options.albumId))
    if (options.directory) form.append('directory', String(options.directory))

    const data = await request('/media/upload', {
      method: 'POST',
      body: form,
      // 走独立的宽松超时，避免大文件被普通请求超时打断
      timeout: options.timeout ?? runtimeConfig.uploadTimeout,
      signal: options.signal
    })

    return {
      list: adaptMediaList(data?.list ?? []),
      failed: Array.isArray(data?.failed) ? data.failed : []
    }
  },

  /**
   * 重命名（改磁盘文件名）
   * 注意：后端 id 由路径派生，改名后 id 会变，所以返回值里同时带新 id 与旧 id，
   * 调用方要用返回的 media 就地替换列表项，而不是刷新整页。
   * @returns {Promise<{id:string, previousId:string, fileName:string, media:object}>}
   */
  async renamePhoto(id, fileName, options = {}) {
    if (!id) throw new ApiError('缺少媒体 ID', { code: 400 })
    const name = String(fileName ?? '').trim()
    if (!name) throw new ApiError('文件名不能为空', { code: 400 })

    const data = await request(`/media/${encodeURIComponent(id)}/rename`, {
      method: 'POST',
      body: { fileName: name },
      signal: options.signal
    })

    const media = adaptMedia(data?.media ?? data)
    return {
      id: data?.id || media?.id || id,
      previousId: data?.previousId || id,
      fileName: data?.fileName || name,
      media
    }
  },

  /**
   * 回收站列表（契约 §5.15）
   * 后端没实现时返回 404，调用方据此隐藏入口，不抛错。
   * @returns {Promise<{list: object[], dir: string}>}
   */
  async listTrash(options = {}) {
    const data = await request('/trash', { signal: options.signal })
    return { list: data?.list ?? [], dir: data?.dir || '' }
  },

  /**
   * 从回收站还原到原位置（契约 §5.15）
   * @param {string[]} ids 删除前的 id；还原成功后 id 会回到原值
   * @returns {Promise<{restored: number, failed: object[]}>}
   */
  async restoreFromTrash(ids = [], options = {}) {
    const targets = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
    if (!targets.length) throw new ApiError('请先选择要还原的文件', { code: 400 })

    const data = await request('/trash/restore', {
      method: 'POST',
      body: { ids: targets },
      signal: options.signal
    })
    return { restored: Number(data?.restored ?? 0), failed: data?.failed ?? [] }
  },

  /**
   * 删除（默认进回收站；permanent=true 才彻底删除）
   * @param {string|string[]} ids
   * @param {{permanent?:boolean, signal?:AbortSignal}} options
   * @returns {Promise<{deleted:number, permanent:boolean, failed:object[]}>}
   */
  async deletePhotos(ids = [], options = {}) {
    const targets = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
    if (!targets.length) throw new ApiError('请先选择要删除的文件', { code: 400 })

    const permanent = Boolean(options.permanent)

    try {
      const data = await request('/media/batch-delete', {
        method: 'POST',
        body: { ids: targets, permanent },
        signal: options.signal
      })
      return {
        deleted: Number(data?.deleted ?? targets.length),
        permanent,
        failed: Array.isArray(data?.failed) ? data.failed : []
      }
    } catch (error) {
      // 契约里 batch-delete 是可选接口，没实现（404）时退回逐个单删
      if (Number(error?.status) !== 404) throw error

      const failed = []
      let deleted = 0
      for (const target of targets) {
        try {
          await request(`/media/${encodeURIComponent(target)}`, {
            method: 'DELETE',
            query: permanent ? { permanent: 'true' } : {},
            signal: options.signal
          })
          deleted += 1
        } catch (deleteError) {
          failed.push({ id: target, code: deleteError?.code ?? -1, message: deleteError?.message || '删除失败' })
        }
      }

      if (!deleted && failed.length) throw new ApiError(failed[0].message, { code: failed[0].code })
      return { deleted, permanent, failed }
    }
  }
}

export default httpSource

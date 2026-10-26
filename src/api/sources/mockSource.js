/**
 * Mock 数据源
 * ---------------------------------------------------------------------------
 * 在浏览器内模拟服务端行为：分页 / 关键词搜索 / 相册筛选 / 标签筛选 / 排序，
 * 返回值结构与真实 HTTP 数据源完全一致，因此上层组件无需区分。
 *
 * 切换到真实接口：把 .env 里的 VITE_DATA_SOURCE 改成 api 即可。
 */

import { adaptMedia, adaptMediaList } from '@/model/media'
import { runtimeConfig } from '@/env'
import { MOCK_ALBUMS, MOCK_MEDIA, MOCK_TAGS } from '@/mock/photos'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function simulate() {
  if (runtimeConfig.mockDelay > 0) await delay(runtimeConfig.mockDelay)
}

/** 原始（未适配）数据上的类型判别，用于查询期过滤 */
function rawIsVideo(raw) {
  const declared = String(raw.kind || raw.mediaType || '').toLowerCase()
  if (declared) return ['video', 'clip', 'movie'].includes(declared)
  return String(raw.mimeType || '').toLowerCase().startsWith('video/')
}

function filterMedia({ keyword = '', albumId = '', tag = '', kind = 'all', dateFrom = '', dateTo = '' } = {}) {
  const text = String(keyword).trim().toLowerCase()

  return MOCK_MEDIA.filter((photo) => {
    if (kind && kind !== 'all') {
      const isVideo = rawIsVideo(photo)
      if (kind === 'video' ? !isVideo : isVideo) return false
    }
    if (albumId && photo.album?.id !== albumId) return false
    if (tag && !photo.tags.includes(tag)) return false

    if (text) {
      const haystack = [photo.title, photo.description, photo.fileName, photo.author?.name, photo.album?.name, ...(photo.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(text)) return false
    }

    if (dateFrom && photo.takenAt && new Date(photo.takenAt) < new Date(dateFrom)) return false
    if (dateTo && photo.takenAt && new Date(photo.takenAt) > new Date(`${dateTo}T23:59:59`)) return false

    return true
  })
}

function sortMedia(list, sort = 'takenAt', order = 'desc') {
  const factor = order === 'asc' ? 1 : -1
  const keyOf = (photo) => {
    switch (sort) {
      case 'size':
        return photo.size ?? 0
      case 'fileName':
        return String(photo.fileName || '').toLowerCase()
      case 'width':
        return photo.width ?? 0
      case 'duration':
        return Number(photo.video?.duration ?? 0)
      case 'createdAt':
        return new Date(photo.createdAt || 0).getTime()
      case 'takenAt':
      default:
        return new Date(photo.takenAt || photo.createdAt || 0).getTime()
    }
  }

  return [...list].sort((a, b) => {
    const av = keyOf(a)
    const bv = keyOf(b)
    if (av === bv) return String(a.id).localeCompare(String(b.id))
    if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * factor
    return (av - bv) * factor
  })
}

export const mockSource = {
  name: 'mock',

  async fetchPhotos(params = {}) {
    await simulate()

    const {
      page = 1,
      pageSize = 20,
      keyword = '',
      albumId = '',
      tag = '',
      kind = 'all',
      sort = 'takenAt',
      order = 'desc'
    } = params

    const filtered = sortMedia(filterMedia({ keyword, albumId, tag, kind }), sort, order)
    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const start = (safePage - 1) * pageSize
    const list = adaptMediaList(filtered.slice(start, start + pageSize))

    return {
      list,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        hasMore: safePage < totalPages
      }
    }
  },

  async fetchPhoto(id) {
    await simulate()
    const raw = MOCK_MEDIA.find((media) => media.id === id)
    return raw ? adaptMedia(raw) : null
  },

  async fetchPhotosByIds(ids = []) {
    await simulate()
    const set = new Set(ids)
    return adaptMediaList(MOCK_MEDIA.filter((media) => set.has(media.id)))
  },

  async fetchAlbums() {
    await simulate()
    return MOCK_ALBUMS
  },

  async fetchTags() {
    await simulate()
    return MOCK_TAGS
  },

  // -------------------------------------------------------------------------
  // 以下为后续管理能力的占位实现：开关打开后如果后端还没就绪，会给出明确报错，
  // 而不是静默失败。
  // -------------------------------------------------------------------------
  async uploadPhotos() {
    throw new Error('[mock] 上传接口尚未接入：请先用 VITE_DATA_SOURCE=api 指向真实后端')
  },

  async renamePhoto() {
    throw new Error('[mock] 重命名接口尚未接入：请先用 VITE_DATA_SOURCE=api 指向真实后端')
  },

  async deletePhotos() {
    throw new Error('[mock] 删除接口尚未接入：请先用 VITE_DATA_SOURCE=api 指向真实后端')
  }
}

export default mockSource

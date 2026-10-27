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
import { VIDEO_ASSETS } from '@/mock/video-assets'

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

/**
 * 演示数据默认开放管理权限
 * 真实后端靠 permissions 字段门控（见 API.md §4.10），mock 里直接给全开，
 * 这样不开后端也能看到上传 / 重命名 / 删除入口。真实数据里的 permissions 优先。
 */
function withManagementPermissions(raw) {
  if (!raw || typeof raw !== 'object') return raw
  return {
    ...raw,
    permissions: { canView: true, canDownload: true, canEdit: true, canDelete: true, ...(raw.permissions || {}) }
  }
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
    const list = adaptMediaList(filtered.slice(start, start + pageSize).map(withManagementPermissions))

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
    return raw ? adaptMedia(withManagementPermissions(raw)) : null
  },

  async fetchPhotosByIds(ids = []) {
    await simulate()
    const set = new Set(ids)
    return adaptMediaList(MOCK_MEDIA.filter((media) => set.has(media.id)).map(withManagementPermissions))
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
  // 管理能力（P3）：演示数据源在浏览器内模拟一遍完整链路，
  // 这样不开后端也能看到"上传 → 重命名 → 删除"的效果。
  // 注意这些改动只在内存里，刷新页面即回到初始演示数据。
  // -------------------------------------------------------------------------

  /**
   * @param {File[]|FileList} files
   * @returns {Promise<{list: object[], failed: object[]}>}
   */
  async uploadPhotos(files = [], options = {}) {
    await simulate()

    const picked = Array.from(files || []).filter(Boolean)
    const list = []
    const failed = []

    picked.forEach((file, index) => {
      const isVideo = String(file.type || '').startsWith('video/')
      const isImage = String(file.type || '').startsWith('image/')

      if (!isImage && !isVideo) {
        failed.push({ fileName: file.name, code: 1005, message: `不支持的文件类型：${file.type || '未知'}` })
        return
      }

      const objectUrl = URL.createObjectURL(file)
      const stamp = `${Date.now()}_${index}`

      const raw = {
        id: `up_${stamp}`,
        title: String(file.name).replace(/\.[^.]+$/, ''),
        fileName: file.name,
        kind: isVideo ? 'video' : 'image',
        mimeType: file.type,
        size: file.size,
        width: 0,
        height: 0,
        // 视频不给封面：没有 ffmpeg 时拿不到帧，留空让卡片显示图标占位
        urls: isVideo ? { full: objectUrl, thumb: '', poster: '' } : { full: objectUrl, regular: objectUrl, thumb: objectUrl },
        tags: [],
        album: options.albumId ? MOCK_ALBUMS.find((item) => item.id === options.albumId) || null : null,
        author: { id: 'u_me', name: '我', avatar: '/mock/avatars/u1.svg' },
        createdAt: new Date().toISOString(),
        takenAt: new Date().toISOString(),
        ...(isVideo ? { video: { duration: 0, codec: '', width: 0, height: 0, rotation: 0 } } : {})
      }

      MOCK_MEDIA.unshift(raw)
      list.push(withManagementPermissions(raw))
    })

    return { list: adaptMediaList(list), failed }
  },

  /**
   * 重命名：演示数据里只改显示用名，id 保持不变（mock 不落盘，没有路径派生的问题）
   * @returns {Promise<{id:string, previousId:string, fileName:string, media:object}>}
   */
  async renamePhoto(id, fileName) {
    await simulate()

    const name = String(fileName ?? '').trim()
    if (!name) throw new Error('文件名不能为空')

    const raw = MOCK_MEDIA.find((media) => media.id === id)
    if (!raw) throw new Error('媒体不存在')

    raw.fileName = name
    raw.title = name.replace(/\.[^.]+$/, '')

    return { id, previousId: id, fileName: name, media: adaptMedia(withManagementPermissions(raw)) }
  },

  /**
   * @param {string|string[]} ids
   * @returns {Promise<{deleted:number, permanent:boolean, failed:object[]}>}
   */
  async deletePhotos(ids = []) {
    await simulate()

    const targets = Array.isArray(ids) ? ids : [ids]
    const failed = []
    let deleted = 0

    targets.forEach((id) => {
      const index = MOCK_MEDIA.findIndex((media) => media.id === id)
      if (index < 0) {
        failed.push({ id, code: 40404, message: '资源不存在' })
        return
      }
      MOCK_MEDIA.splice(index, 1)
      deleted += 1
    })

    return { deleted, permanent: true, failed }
  },

  /**
   * 演示雪碧图：gen:mock 已经把这张图抽好写进 VIDEO_ASSETS，
   * 所以 mock 通路永远是 ready —— 没有"生成中"这个中间态
   */
  async fetchSprite(id) {
    const sprite = VIDEO_ASSETS.available ? VIDEO_ASSETS.items?.[id]?.sprite : null
    return sprite
      ? { state: 'ready', sprite }
      : { state: 'unavailable', reason: '演示数据未包含雪碧图，重跑 npm run gen:mock 即可生成' }
  },

  async updateMeta() {
    throw new Error('[mock] 演示数据源不支持写入元数据，请改用 VITE_DATA_SOURCE=local')
  }
}

export default mockSource

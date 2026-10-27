/**
 * 相册全局状态
 * ---------------------------------------------------------------------------
 * 轻量 store：用 reactive 单例代替引入 Pinia，减少依赖；
 * 接口形态保持一致，后续若要换成 Pinia / 服务端状态库，替换本文件即可。
 *
 * 对外暴露：
 *   state          只读快照（组件里用 store.state.xxx）
 *   actions        loadPhotos / setQuery / setViewMode / openViewer ...
 *   getters        computed 派生数据
 */

import { computed, reactive } from 'vue'
import photoApi from '@/api/photoApi'
import features from '@/config/album.config'

const DEFAULT_PAGE_SIZE = 20

function createDefaultQuery() {
  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    keyword: '',
    albumId: '',
    tag: '',
    /** 媒体类型：all | image | video */
    kind: 'all',
    sort: 'takenAt',
    order: 'desc'
  }
}

const state = reactive({
  photos: [],
  albums: [],
  tags: [],
  pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1, hasMore: false },
  query: createDefaultQuery(),
  viewMode: features.grid ? 'grid' : 'table',
  loading: false,
  loadingMeta: false,
  error: null,
  lastLoadedAt: null,

  /** 多选（后续批量下载 / 批量删除复用） */
  selectedIds: [],

  /** 查看器状态 */
  viewer: {
    open: false,
    index: -1
  }
})

let requestSeq = 0

async function loadPhotos(options = {}) {
  const seq = (requestSeq += 1)
  state.loading = true
  state.error = null

  try {
    const result = await photoApi.fetchPhotos(
      {
        page: state.query.page,
        pageSize: state.query.pageSize,
        keyword: state.query.keyword,
        albumId: state.query.albumId,
        tag: state.query.tag,
        kind: state.query.kind || 'all',
        sort: state.query.sort,
        order: state.query.order
      },
      { throwOnError: true }
    )

    // 丢弃过期响应，避免快速切换筛选时结果错位
    if (seq !== requestSeq) return null

    state.photos = result.list
    state.pagination = result.pagination
    state.lastLoadedAt = new Date()
    return result
  } catch (error) {
    if (seq !== requestSeq) return null
    state.photos = []
    state.error = error?.message || '加载媒体列表失败'
    return null
  } finally {
    if (seq === requestSeq) state.loading = false
  }
}

async function loadMeta() {
  state.loadingMeta = true
  try {
    const [albums, tags] = await Promise.all([photoApi.fetchAlbums(), photoApi.fetchTags()])
    state.albums = albums || []
    state.tags = tags || []
  } catch {
    state.albums = []
    state.tags = []
  } finally {
    state.loadingMeta = false
  }
}

/** 修改查询条件（自动回到第一页，除非显式指定 keepPage） */
function setQuery(patch = {}, { keepPage = false, reload = true } = {}) {
  const next = { ...state.query, ...patch }
  if (!keepPage) next.page = 1
  state.query = next
  if (reload) loadPhotos()
  return state.query
}

function resetQuery() {
  state.query = createDefaultQuery()
  loadPhotos()
}

function setViewMode(mode) {
  if (mode === 'grid' && !features.grid) return
  if (mode === 'table' && !features.table) return
  state.viewMode = mode
}

function toggleViewMode() {
  setViewMode(state.viewMode === 'grid' ? 'table' : 'grid')
}

async function goToPage(page) {
  const target = Math.min(Math.max(1, page), state.pagination.totalPages || 1)
  if (target === state.query.page) return
  state.query.page = target
  await loadPhotos()
}

async function refresh() {
  await Promise.all([loadPhotos(), loadMeta()])
}

// ---------------------------------------------------------------------------
// 查看器
// ---------------------------------------------------------------------------
function openViewer(index) {
  if (!features.viewer) return
  const max = state.photos.length - 1
  state.viewer.index = Math.min(Math.max(0, index), Math.max(0, max))
  state.viewer.open = true
}

function openViewerById(id) {
  const index = state.photos.findIndex((photo) => photo.id === id)
  if (index >= 0) openViewer(index)
}

function closeViewer() {
  state.viewer.open = false
}

function stepViewer(delta) {
  if (!state.viewer.open) return
  const total = state.photos.length
  if (!total) return
  state.viewer.index = (state.viewer.index + delta + total) % total
}

// ---------------------------------------------------------------------------
// 多选（本期 UI 不暴露，先提供完整状态机）
// ---------------------------------------------------------------------------
function toggleSelect(id) {
  const index = state.selectedIds.indexOf(id)
  if (index >= 0) state.selectedIds.splice(index, 1)
  else state.selectedIds.push(id)
}

function clearSelection() {
  state.selectedIds = []
}

/**
 * 把服务端返回的最新一条记录合并回列表（用于 sidecar 元数据写入后的即时刷新）。
 * 保持"同一条记录就地更新"而不是整页重拉，避免滚动位置与选中态被打断。
 */
function applyMediaUpdate(media) {
  if (!media?.id) return null
  const index = state.photos.findIndex((item) => item.id === media.id)
  if (index >= 0) state.photos.splice(index, 1, media)
  return media
}

/**
 * 重命名后的替换（API.md §5.12）
 * 后端 id 由文件路径派生，**改文件名 = 换 id**，所以不能按新 id 去找旧记录，
 * 必须用 previousId 定位，并顺手把选中态一起迁过去。
 */
function replaceMedia(previousId, media) {
  if (!media?.id) return null

  const index = previousId
    ? state.photos.findIndex((item) => item.id === previousId)
    : state.photos.findIndex((item) => item.id === media.id)

  if (index >= 0) state.photos.splice(index, 1, media)

  const selectedIndex = state.selectedIds.indexOf(previousId)
  if (selectedIndex >= 0) state.selectedIds.splice(selectedIndex, 1, media.id)

  return media
}

/** 删除后从当前列表移除，并同步选中态、总数与查看器指针 */
function removeMedias(ids = []) {
  const removed = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean))
  if (!removed.size) return 0

  const viewingId = state.viewer.open ? state.photos[state.viewer.index]?.id : null
  const before = state.photos.length

  state.photos = state.photos.filter((item) => !removed.has(item.id))
  const removedCount = before - state.photos.length

  state.selectedIds = state.selectedIds.filter((id) => !removed.has(id))
  if (removedCount) state.pagination.total = Math.max(0, (state.pagination.total || 0) - removedCount)

  if (state.viewer.open) {
    if (!viewingId || removed.has(viewingId)) {
      closeViewer()
    } else {
      const next = state.photos.findIndex((item) => item.id === viewingId)
      state.viewer.index = next >= 0 ? next : 0
    }
  }

  return removedCount
}

/**
 * 上传完成后把新记录插到当前页头部。
 * 只在第一页这么做 —— 在其他页插入会让人以为文件"跑到这一页来了"，
 * 那种情况返回 0，由调用方整页刷新。
 */
function prependMedias(list = []) {
  const items = (Array.isArray(list) ? list : [list]).filter((item) => item?.id)
  const existing = new Set(state.photos.map((item) => item.id))
  const fresh = items.filter((item) => !existing.has(item.id))
  if (!fresh.length || (state.pagination.page || 1) > 1) return 0

  state.photos = [...fresh, ...state.photos]
  const limit = state.pagination.pageSize || 20
  if (state.photos.length > limit) state.photos = state.photos.slice(0, limit)
  state.pagination.total = (state.pagination.total || 0) + fresh.length
  return fresh.length
}

// ---------------------------------------------------------------------------
// getter
// ---------------------------------------------------------------------------
const activePhoto = computed(() => (state.viewer.index >= 0 ? state.photos[state.viewer.index] ?? null : null))
const hasPhotos = computed(() => state.photos.length > 0)
const isEmptyResult = computed(() => !state.loading && !state.error && state.photos.length === 0)
const selectedPhotos = computed(() => state.photos.filter((photo) => state.selectedIds.includes(photo.id)))
const totalText = computed(() => {
  const total = state.pagination.total || 0
  if (state.query.kind === 'video') return `${total} 个视频`
  if (state.query.kind === 'image') return `${total} 张照片`
  return `${total} 个文件`
})

export function usePhotoStore() {
  return {
    state,
    activePhoto,
    hasPhotos,
    isEmptyResult,
    selectedPhotos,
    totalText,
    loadPhotos,
    loadMeta,
    setQuery,
    resetQuery,
    setViewMode,
    toggleViewMode,
    goToPage,
    refresh,
    openViewer,
    openViewerById,
    closeViewer,
    stepViewer,
    toggleSelect,
    clearSelection,
    applyMediaUpdate,
    replaceMedia,
    removeMedias,
    prependMedias
  }
}

export default usePhotoStore

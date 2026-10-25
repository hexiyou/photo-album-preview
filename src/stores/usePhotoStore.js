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
    state.error = error?.message || '加载照片列表失败'
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

// ---------------------------------------------------------------------------
// getter
// ---------------------------------------------------------------------------
const activePhoto = computed(() => (state.viewer.index >= 0 ? state.photos[state.viewer.index] ?? null : null))
const hasPhotos = computed(() => state.photos.length > 0)
const isEmptyResult = computed(() => !state.loading && !state.error && state.photos.length === 0)
const selectedPhotos = computed(() => state.photos.filter((photo) => state.selectedIds.includes(photo.id)))
const totalText = computed(() => `${state.pagination.total || 0} 张照片`)

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
    clearSelection
  }
}

export default usePhotoStore

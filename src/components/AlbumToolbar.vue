<script setup>
/**
 * 相册工具栏：搜索 / 筛选 / 排序 / 视图切换 / 刷新
 * 所有二次操作（上传等）从 features 开关读取，开关打开后自动出现。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import features from '@/config/album.config'
import { activeSourceName, photoApi } from '@/api/photoApi'
import { usePhotoStore } from '@/stores/usePhotoStore'
import { downloadPhotos } from '@/utils/download'
import { useToast } from '@/composables/useToast'
import { hoverPreviewEnabled, setHoverPreviewEnabled } from '@/composables/useHoverPreview'

const { state, setQuery, setViewMode, refresh } = usePhotoStore()
const toast = useToast()

const keyword = ref(state.query.keyword)
let debounceTimer = null

watch(keyword, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (value === state.query.keyword) return
    setQuery({ keyword: value })
  }, 320)
})

watch(
  () => state.query.keyword,
  (value) => {
    if (value !== keyword.value) keyword.value = value
  }
)

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  // 切页面时必须掐断 SSE，否则连接会一直挂着直到超时
  closeStream()
})

const SORT_OPTIONS = [
  { value: 'takenAt', label: '拍摄时间' },
  { value: 'createdAt', label: '上传时间' },
  { value: 'fileName', label: '文件名' },
  { value: 'size', label: '文件大小' },
  { value: 'width', label: '分辨率' },
  { value: 'duration', label: '时长' }
]

const KIND_OPTIONS = [
  { value: 'all', label: '全部', icon: 'grid' },
  { value: 'image', label: '图片', icon: 'image' },
  { value: 'video', label: '视频', icon: 'video' }
]

const activeFilters = computed(() => {
  const chips = []
  if (state.query.albumId) {
    const album = state.albums.find((item) => item.id === state.query.albumId)
    chips.push({ key: 'albumId', label: album?.name || state.query.albumId, icon: 'folder' })
  }
  if (state.query.tag) {
    chips.push({ key: 'tag', label: state.query.tag, icon: 'tag' })
  }
  return chips
})

function clearFilter(key) {
  setQuery({ [key]: '' })
}

function clearAll() {
  keyword.value = ''
  setQuery({ keyword: '', albumId: '', tag: '', kind: 'all' })
}

function toggleOrder() {
  setQuery({ order: state.query.order === 'desc' ? 'asc' : 'desc' }, { keepPage: true })
}

const batchDownloading = ref(false)

/** 目录扫描只有本地媒体服务提供，其他数据源下按钮不出现 */
const canScan = computed(() => features.scan && activeSourceName === 'local')
const scanning = ref(false)

/** 列表里确实有视频时才显示悬停预览开关（纯图片相册里这个按钮没有意义） */
const hasVideo = computed(() => state.photos.some((item) => item.isVideo))

function toggleHoverPreview() {
  const next = !hoverPreviewEnabled.value
  setHoverPreviewEnabled(next)
  toast.info(next ? '已开启卡片悬停静音预览' : '已关闭卡片悬停静音预览')
}

/** 环境不支持 SSE 时的专用标记，用于决定要不要退回轮询 */
class NoStreamError extends Error {
  constructor() {
    super('当前环境不支持 Server-Sent Events')
    this.name = 'NoStreamError'
  }
}

/** 轮询直到扫描结束（扫描是重活，可能要跑几十秒）—— SSE 不可用时的兜底 */
async function waitForScan(limitMs = 180000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < limitMs) {
    const status = await photoApi.fetchScanStatus()
    if (status && status.running === false) return status
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  throw new Error('扫描超时，请检查目录规模或直接在命令行执行 npm run scan')
}

const scanProgress = ref(null)
let scanStream = null

function closeStream() {
  if (scanStream) {
    scanStream.close()
    scanStream = null
  }
}

/**
 * 走 SSE 完成一次扫描。
 *
 * 顺序很关键：**先连上再触发**。如果反过来（先 POST 再连），
 * 短目录的扫描可能在连接建立前就跑完了，一帧进度都收不到。
 * snapshot 帧就是"监听已就位"的信号，收到它才去发起扫描。
 */
function scanWithStream() {
  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      closeStream()
      error ? reject(error) : resolve()
    }

    const timer = setTimeout(
      () => finish(new Error('扫描超时，请检查目录规模或直接在命令行执行 npm run scan')),
      180000
    )

    scanStream = photoApi.openScanStream({
      onSnapshot: async (data) => {
        // 已经有扫描在跑就不重复触发，安静地看它的进度即可
        if (data.running) return
        try {
          await photoApi.scanDirectory({})
        } catch (error) {
          finish(error)
        }
      },
      onProgress: (data) => {
        if (Number.isFinite(data.current) && Number.isFinite(data.total)) {
          scanProgress.value = { current: data.current, total: data.total }
        }
      },
      onDone: (data) => finish(data?.error ? new Error(data.error) : null),
      onError: () => {
        /* 断线本身不判失败：浏览器会自动重连，真超时了由 timer 兜底 */
      }
    })

    if (!scanStream) finish(new NoStreamError())
  })
}

async function handleScan() {
  if (scanning.value) return
  scanning.value = true
  scanProgress.value = null

  try {
    await scanWithStream().catch(async (error) => {
      // 只有"环境不支持 SSE"才退轮询；其余错误是真实的扫描失败，必须抛出
      if (error?.name !== 'NoStreamError') throw error
      await photoApi.scanDirectory({})
      await waitForScan()
    })
    await refresh()
    toast.success('扫描完成，列表已更新')
  } catch (error) {
    toast.error(`扫描失败：${error?.message || '未知错误'}`)
  } finally {
    closeStream()
    scanning.value = false
    scanProgress.value = null
  }
}

/** 按钮文案：能拿到进度就显示"第几个 / 共几个" */
const scanText = computed(() => {
  if (!scanning.value) return '扫描目录'
  const total = scanProgress.value?.total
  return total ? `扫描中 ${scanProgress.value.current}/${total}` : '扫描中…'
})

async function handleDownloadPage() {
  if (!state.photos.length) return
  batchDownloading.value = true
  try {
    await downloadPhotos(state.photos)
    toast.success(`已下载本页 ${state.photos.length} 个文件`)
  } catch (error) {
    toast.error(`下载失败：${error?.message || '未知错误'}`)
  } finally {
    batchDownloading.value = false
  }
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar__left">
      <div class="search">
        <AppIcon name="search" :size="16" class="search__icon" />
        <input
          v-model="keyword"
          class="search__input"
          type="search"
          placeholder="搜索标题、文件名、标签、作者…"
          aria-label="搜索照片"
        />
        <button v-if="keyword" type="button" class="search__clear" title="清空" @click="clearAll()">
          <AppIcon name="close" :size="14" />
        </button>
      </div>

      <div v-if="features.kindFilter" class="segmented" role="tablist" aria-label="类型筛选">
        <button
          v-for="option in KIND_OPTIONS"
          :key="option.value"
          type="button"
          class="segmented__item"
          :class="{ 'is-active': (state.query.kind || 'all') === option.value }"
          role="tab"
          :aria-selected="(state.query.kind || 'all') === option.value"
          @click="setQuery({ kind: option.value })"
        >
          <AppIcon :name="option.icon" :size="15" />
          <span>{{ option.label }}</span>
        </button>
      </div>

      <select
        v-if="features.filter"
        class="field select"
        :value="state.query.albumId"
        aria-label="按相册筛选"
        @change="setQuery({ albumId: $event.target.value })"
      >
        <option value="">全部相册</option>
        <option v-for="album in state.albums" :key="album.id" :value="album.id">
          {{ album.name }}（{{ album.photoCount }}）
        </option>
      </select>

      <select
        v-if="features.filter"
        class="field select"
        :value="state.query.tag"
        aria-label="按标签筛选"
        @change="setQuery({ tag: $event.target.value })"
      >
        <option value="">全部标签</option>
        <option v-for="tag in state.tags" :key="tag.id" :value="tag.name">
          {{ tag.name }}（{{ tag.photoCount }}）
        </option>
      </select>

      <div v-if="features.sort" class="sort">
        <select
          class="field select"
          :value="state.query.sort"
          aria-label="排序字段"
          @change="setQuery({ sort: $event.target.value })"
        >
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
            按{{ option.label }}
          </option>
        </select>
        <button type="button" class="btn btn--icon" :title="state.query.order === 'desc' ? '当前：降序' : '当前：升序'" @click="toggleOrder">
          <AppIcon :name="state.query.order === 'desc' ? 'sortAsc' : 'sortAsc'" :size="16" :style="state.query.order === 'asc' ? 'transform: scaleY(-1)' : ''" />
        </button>
      </div>
    </div>

    <div class="toolbar__right">
      <button v-if="features.batchDownload" type="button" class="btn btn--sm" :disabled="!state.photos.length || batchDownloading" @click="handleDownloadPage">
        <AppIcon name="download" :size="15" />
        下载本页
      </button>

      <div class="segmented" role="tablist" aria-label="视图切换">
        <button
          v-if="features.grid"
          type="button"
          class="segmented__item"
          :class="{ 'is-active': state.viewMode === 'grid' }"
          role="tab"
          :aria-selected="state.viewMode === 'grid'"
          @click="setViewMode('grid')"
        >
          <AppIcon name="grid" :size="15" />
          <span>缩略图</span>
        </button>
        <button
          v-if="features.table"
          type="button"
          class="segmented__item"
          :class="{ 'is-active': state.viewMode === 'table' }"
          role="tab"
          :aria-selected="state.viewMode === 'table'"
          @click="setViewMode('table')"
        >
          <AppIcon name="list" :size="15" />
          <span>详细记录</span>
        </button>
      </div>

      <button
        v-if="features.hoverPreview && hasVideo"
        type="button"
        class="btn btn--icon"
        :class="{ 'is-off': !hoverPreviewEnabled }"
        :aria-pressed="hoverPreviewEnabled"
        :title="hoverPreviewEnabled ? '卡片悬停时静音预览：开（点击关掉）' : '卡片悬停时静音预览：关（点击开启）'"
        @click="toggleHoverPreview"
      >
        <AppIcon :name="hoverPreviewEnabled ? 'volume' : 'volumeMute'" :size="16" />
      </button>

      <button
        v-if="canScan"
        type="button"
        class="btn btn--sm"
        :disabled="scanning"
        title="重新扫描本地目录（服务端 .env 的 MEDIA_SCAN_ROOTS）"
        @click="handleScan"
      >
        <AppIcon :name="scanning ? 'spinner' : 'refresh'" :size="15" :class="{ 'is-spinning': scanning }" />
        {{ scanText }}
      </button>

      <button type="button" class="btn btn--icon" title="刷新" :disabled="state.loading" @click="refresh()">
        <AppIcon name="refresh" :size="16" :class="{ 'is-spinning': state.loading }" />
      </button>
    </div>

    <TransitionGroup name="chip">
      <div v-if="activeFilters.length" key="chips" class="toolbar__chips">
        <span class="toolbar__chips-label">筛选：</span>
        <button v-for="chip in activeFilters" :key="chip.key" type="button" class="chip chip--removable" @click="clearFilter(chip.key)">
          <AppIcon :name="chip.icon" :size="12" />
          {{ chip.label }}
          <AppIcon name="close" :size="12" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 24px;
  background: var(--toolbar-bg);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border);
}

.toolbar__left,
.toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar__right {
  margin-left: auto;
}

.search {
  position: relative;
  display: flex;
  align-items: center;
  width: 260px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.search:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.search__icon {
  color: var(--text-muted);
  margin-right: 6px;
}

.search__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
}

.search__input::-webkit-search-cancel-button {
  display: none;
}

.search__clear {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.select {
  max-width: 168px;
  cursor: pointer;
}

.sort {
  display: flex;
  align-items: center;
  gap: 4px;
}

.segmented {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.segmented__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  transition: background 0.16s ease, color 0.16s ease;
}

.segmented__item:hover {
  color: var(--text);
}

.segmented__item.is-active {
  background: var(--brand-soft);
  color: var(--brand);
}

.toolbar__chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-basis: 100%;
  flex-wrap: wrap;
}

.toolbar__chips-label {
  font-size: 12.5px;
  color: var(--text-muted);
}

.chip--removable {
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.16s ease, color 0.16s ease;
}

.chip--removable:hover {
  background: var(--brand-soft);
  color: var(--brand);
}

.is-spinning {
  animation: spin 0.9s linear infinite;
}

.chip-enter-active,
.chip-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 900px) {
  .toolbar {
    padding: 10px 14px;
  }

  .search {
    width: 100%;
  }

  .toolbar__right {
    margin-left: 0;
  }
}
</style>

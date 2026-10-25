<script setup>
/**
 * 应用外壳
 * ---------------------------------------------------------------------------
 * 只做三件事：拉取初始数据、按 viewMode 渲染对应视图、挂载查看器与提示。
 * 业务逻辑分别下沉到 store / composable / utils，这里保持薄。
 */
import { computed, onMounted, watch } from 'vue'
import AlbumToolbar from './components/AlbumToolbar.vue'
import PaginationBar from './components/PaginationBar.vue'
import PhotoGrid from './components/PhotoGrid.vue'
import PhotoTable from './components/PhotoTable.vue'
import PhotoViewer from './components/PhotoViewer.vue'
import StatePlaceholder from './components/StatePlaceholder.vue'
import ToastHost from './components/ToastHost.vue'
import AppIcon from './components/AppIcon.vue'

import { usePhotoStore } from '@/stores/usePhotoStore'
import { activeSourceName } from '@/api/photoApi'
import { runtimeConfig } from '@/env'

const { state, loadPhotos, loadMeta, refresh, closeViewer, resetQuery, setViewMode, openViewerById, goToPage } =
  usePhotoStore()

const sourceLabel = computed(() => (activeSourceName === 'api' ? 'HTTP 接口' : 'Mock 数据'))
const sourceClass = computed(() => (activeSourceName === 'api' ? 'badge--api' : 'badge--mock'))

/** 首屏骨架屏数量 */
const skeletonCount = computed(() => Math.min(state.query.pageSize, 12))

/**
 * URL 直达：支持 ?view=table / ?photo=ph_0003
 * 便于分享「某种视图」或「某一张照片」的链接，也方便联调时直接定位。
 */
function readUrlParams() {
  const params = new URLSearchParams(window.location.search)
  return { view: params.get('view'), photo: params.get('photo') }
}

/** view / photo 传 null 表示不改，传空串表示清除 */
function writeUrlParams({ view = null, photo = null }) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)

  if (view !== null) {
    if (view) params.set('view', view)
    else params.delete('view')
  }

  if (photo !== null) {
    if (photo) params.set('photo', photo)
    else params.delete('photo')
  }

  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
}

onMounted(async () => {
  const { view, photo } = readUrlParams()
  if (view === 'table' || view === 'grid') setViewMode(view)

  await Promise.all([loadPhotos(), loadMeta()])

  if (photo) openViewerById(photo)
})

// 视图切换与打开的照片变化时，回写 URL（保持可分享）
watch(() => state.viewMode, (mode) => writeUrlParams({ view: mode }))
watch(
  () => [state.viewer.open, state.viewer.index],
  ([open]) => {
    const photo = open ? state.photos[state.viewer.index] : null
    writeUrlParams({ photo: photo?.id || '' })
  }
)
</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__brand">
        <span class="app__logo">
          <AppIcon name="image" :size="18" />
        </span>
        <div>
          <h1 class="app__title">在线相册</h1>
          <p class="app__subtitle">缩略图 / 详细记录双模式预览</p>
        </div>
      </div>

      <div class="app__header-right">
        <span class="badge" :class="sourceClass" :title="`数据源：${runtimeConfig.dataSource}`">
          <i class="badge__dot" />
          {{ sourceLabel }}
        </span>
        <span class="app__total">{{ state.pagination.total }} 张照片</span>
      </div>
    </header>

    <AlbumToolbar />

    <main class="app__main">
      <!-- 首屏 / 加载中 -->
      <div v-if="state.loading && !state.photos.length" class="grid grid--skeleton">
        <div v-for="i in skeletonCount" :key="i" class="skeleton">
          <div class="skeleton__media" />
          <div class="skeleton__line skeleton__line--lg" />
          <div class="skeleton__line skeleton__line--sm" />
        </div>
      </div>

      <!-- 错误态 -->
      <StatePlaceholder
        v-else-if="state.error"
        type="error"
        icon="alert"
        title="照片列表加载失败"
        :description="state.error"
        action-text="重新加载"
        @action="refresh()"
      />

      <!-- 空结果 -->
      <StatePlaceholder
        v-else-if="!state.photos.length"
        icon="search"
        title="没有找到照片"
        description="试试换个关键词，或者清空筛选条件。"
        action-text="清空筛选"
        @action="resetQuery()"
      />

      <!-- 有数据：网格 / 表格 -->
      <template v-else>
        <PhotoGrid v-if="state.viewMode === 'grid'" :photos="state.photos" />
        <PhotoTable v-else :photos="state.photos" />
      </template>

      <PaginationBar
        v-if="!state.error && state.photos.length"
        class="app__pager"
        :page="state.pagination.page"
        :page-size="state.pagination.pageSize"
        :total="state.pagination.total"
        :total-pages="state.pagination.totalPages"
        @change="goToPage"
      />
    </main>

    <PhotoViewer
      :photos="state.photos"
      :index="state.viewer.index"
      :open="state.viewer.open"
      @update:index="state.viewer.index = $event"
      @close="closeViewer"
    />

    <ToastHost />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app__header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.app__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app__logo {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--brand);
  color: #fff;
}

.app__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.app__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.app__header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-sunken);
  font-size: 12px;
  color: var(--text-secondary);
}

.badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.badge--api {
  border-color: rgba(31, 157, 99, 0.35);
  color: var(--success);
  background: rgba(31, 157, 99, 0.08);
}

.badge--mock {
  border-color: rgba(217, 130, 9, 0.3);
  color: var(--warning);
  background: rgba(217, 130, 9, 0.08);
}

.app__total {
  font-size: 12.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.app__main {
  flex: 1;
  padding-bottom: 24px;
}

.app__pager {
  margin: 0 24px;
}

/* 骨架屏 */
.grid--skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(216px, 1fr));
  gap: 16px;
  padding: 18px 24px 8px;
}

.skeleton {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  padding-bottom: 10px;
  overflow: hidden;
}

.skeleton__media {
  aspect-ratio: 3 / 2;
  background: linear-gradient(90deg, #eef0f4 25%, #f7f8fa 37%, #eef0f4 63%);
  background-size: 840px 100%;
  animation: shimmer 1.3s ease-in-out infinite;
}

.skeleton__line {
  height: 10px;
  margin: 10px 12px 0;
  border-radius: 5px;
  background: linear-gradient(90deg, #eef0f4 25%, #f7f8fa 37%, #eef0f4 63%);
  background-size: 840px 100%;
  animation: shimmer 1.3s ease-in-out infinite;
}

.skeleton__line--lg {
  width: 76%;
}

.skeleton__line--sm {
  width: 44%;
  margin-bottom: 2px;
}

@media (max-width: 900px) {
  .app__header {
    padding: 12px 14px;
  }

  .app__pager {
    margin: 0 14px;
  }

  .grid--skeleton {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    padding: 14px;
  }
}
</style>

<script setup>
/**
 * 详细记录模式：一行一条照片记录
 * 支持表头排序（与工具栏排序联动）、行内下载 / 查看。
 */
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { usePhotoStore } from '@/stores/usePhotoStore'
import { useToast } from '@/composables/useToast'
import { downloadPhoto } from '@/utils/download'

defineProps({
  photos: { type: Array, required: true }
})

const { state, setQuery, openViewer } = usePhotoStore()
const toast = useToast()

const downloadingId = ref('')

/** 列定义：sortKey 为空表示该列不可排序 */
const COLUMNS = [
  { key: 'thumb', label: '预览', width: '72px', sortKey: '' },
  { key: 'name', label: '文件名 / 标题', width: 'auto', sortKey: 'fileName' },
  { key: 'album', label: '相册', width: '120px', sortKey: '' },
  { key: 'tags', label: '标签', width: '160px', sortKey: '' },
  { key: 'resolution', label: '尺寸', width: '110px', sortKey: 'width' },
  { key: 'size', label: '大小', width: '92px', sortKey: 'size' },
  { key: 'takenAt', label: '拍摄时间', width: '150px', sortKey: 'takenAt' },
  { key: 'author', label: '上传者', width: '96px', sortKey: '' },
  { key: 'actions', label: '操作', width: '104px', sortKey: '' }
]

function handleSort(column) {
  if (!column.sortKey) return
  const sameField = state.query.sort === column.sortKey
  setQuery({
    sort: column.sortKey,
    order: sameField && state.query.order === 'desc' ? 'asc' : 'desc'
  })
}

function sortIndicator(column) {
  if (state.query.sort !== column.sortKey) return ''
  return state.query.order === 'desc' ? '↓' : '↑'
}

async function handleDownload(photo, event) {
  event?.stopPropagation()
  downloadingId.value = photo.id
  try {
    await downloadPhoto(photo)
    toast.success(`已开始下载：${photo.downloadName}`)
  } catch (error) {
    toast.error(`下载失败：${error?.message || '未知错误'}`)
  } finally {
    downloadingId.value = ''
  }
}
</script>

<template>
  <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th
            v-for="column in COLUMNS"
            :key="column.key"
            :style="{ width: column.width }"
            :class="[
              `col-${column.key}`,
              { 'is-sortable': !!column.sortKey, 'is-sorted': state.query.sort === column.sortKey }
            ]"
            @click="handleSort(column)"
          >
            <span class="th-inner">
              {{ column.label }}
              <em v-if="sortIndicator(column)" class="th-sort">{{ sortIndicator(column) }}</em>
            </span>
          </th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="(photo, index) in photos"
          :key="photo.id"
          tabindex="0"
          @click="openViewer(index)"
          @keydown.enter.prevent="openViewer(index)"
        >
          <td class="col-thumb">
            <div class="thumb">
              <img
                v-if="photo.urls.thumb"
                :src="photo.urls.thumb"
                :alt="photo.displayName"
                loading="lazy"
                decoding="async"
              />
              <AppIcon v-else name="image" :size="16" />
            </div>
          </td>

          <td class="col-name">
            <p class="name" :title="photo.fileName">{{ photo.fileName }}</p>
            <p class="title" :title="photo.displayName">{{ photo.displayName }}</p>
          </td>

          <td class="col-album">
            <span v-if="photo.album" class="chip">
              <AppIcon name="folder" :size="12" />
              {{ photo.album.name }}
            </span>
            <span v-else class="muted">—</span>
          </td>

          <td class="col-tags">
            <span v-for="tag in photo.tags.slice(0, 3)" :key="tag" class="chip chip--tag">{{ tag }}</span>
            <span v-if="photo.tags.length > 3" class="muted">+{{ photo.tags.length - 3 }}</span>
            <span v-if="!photo.tags.length" class="muted">—</span>
          </td>

          <td class="col-resolution num">{{ photo.resolution || '—' }}</td>
          <td class="col-size num">{{ photo.sizeText || '—' }}</td>
          <td class="col-takenAt">{{ photo.shotAtText || '—' }}</td>

          <td class="col-author">
            <span class="author">
              <AppIcon name="user" :size="13" />
              {{ photo.author?.name || '—' }}
            </span>
          </td>

          <td class="col-actions">
            <button type="button" class="btn btn--sm" title="查看大图" @click.stop="openViewer(index)">
              <AppIcon name="zoomIn" :size="14" />
            </button>
            <button
              type="button"
              class="btn btn--sm"
              title="下载照片"
              :disabled="downloadingId === photo.id"
              @click.stop="handleDownload(photo, $event)"
            >
              <AppIcon :name="downloadingId === photo.id ? 'spinner' : 'download'" :size="14" :class="{ 'is-spinning': downloadingId === photo.id }" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  margin: 16px 24px 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: auto;
  max-height: calc(100vh - 260px);
}

.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 0 12px;
  height: 40px;
  text-align: left;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--surface-sunken);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  user-select: none;
}

thead th.is-sortable {
  cursor: pointer;
}

thead th.is-sortable:hover {
  color: var(--text);
}

thead th.is-sorted {
  color: var(--brand);
}

.th-inner {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.th-sort {
  font-style: normal;
  font-size: 11px;
}

tbody tr {
  cursor: pointer;
  transition: background 0.14s ease;
}

tbody tr:nth-child(even) {
  background: var(--row-alt);
}

tbody tr:hover {
  background: var(--brand-soft);
}

tbody tr:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

tbody td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

tbody tr:last-child td {
  border-bottom: none;
}

.num {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-muted);
}

.thumb {
  display: grid;
  place-items: center;
  width: 48px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-subtle);
  color: var(--text-muted);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.col-name .name {
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text);
}

.col-name .title {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip--tag {
  margin-right: 4px;
}

.author {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-actions {
  white-space: nowrap;
}

.col-actions .btn {
  padding: 0 8px;
  margin-right: 4px;
}

.is-spinning {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 900px) {
  .table-wrap {
    margin: 12px 14px;
  }

  .col-album,
  .col-author {
    display: none;
  }
}
</style>

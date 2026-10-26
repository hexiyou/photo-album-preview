<script setup>
/**
 * 单张照片卡片（缩略图网格单元）
 */
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import features from '@/config/album.config'
import { useToast } from '@/composables/useToast'
import { downloadPhoto } from '@/utils/download'

const props = defineProps({
  photo: { type: Object, required: true },
  index: { type: Number, default: 0 },
  selected: { type: Boolean, default: false }
})

const emit = defineEmits(['open', 'toggle-select'])

const toast = useToast()
const loaded = ref(false)
const failed = ref(false)
const downloading = ref(false)

async function handleDownload(event) {
  event.stopPropagation()
  downloading.value = true
  try {
    await downloadPhoto(props.photo)
    toast.success(`已开始下载：${props.photo.downloadName}`)
  } catch (error) {
    toast.error(`下载失败：${error?.message || '未知错误'}`)
  } finally {
    downloading.value = false
  }
}

function handleOpen() {
  emit('open', props.index)
}

function handleSelect(event) {
  event.stopPropagation()
  emit('toggle-select', props.photo.id)
}
</script>

<template>
  <article
    class="card"
    :class="{ 'is-selected': selected }"
    role="button"
    tabindex="0"
    :aria-label="`查看 ${photo.displayName}`"
    @click="handleOpen"
    @keydown.enter.prevent="handleOpen"
    @keydown.space.prevent="handleOpen"
  >
    <!-- 缩略图统一 4:3 裁剪，保证网格行高一致；完整比例在详情/大图里看 -->
    <div class="card__media">
      <!-- 加载占位：用主色调做底色，图片到位后淡入 -->
      <div class="card__placeholder" :style="{ background: photo.dominantColor }" />

      <img
        v-if="photo.urls.thumb"
        class="card__img"
        :class="{ 'is-loaded': loaded }"
        :src="photo.urls.thumb"
        :alt="photo.displayName"
        loading="lazy"
        decoding="async"
        draggable="false"
        @load="loaded = true"
        @error="failed = true"
      />

      <div v-if="failed" class="card__failed">
        <AppIcon name="alert" :size="20" />
        <span>缩略图加载失败</span>
      </div>

      <span v-if="photo.orientation === 'portrait'" class="card__badge">竖幅</span>

      <label v-if="features.selection" class="card__check" @click.stop>
        <input type="checkbox" :checked="selected" @change="handleSelect" />
      </label>

      <div class="card__overlay">
        <div class="card__overlay-info">
          <p class="card__name" :title="photo.displayName">{{ photo.displayName }}</p>
          <p class="card__meta">
            <span v-if="photo.resolution">{{ photo.resolution }}</span>
            <span v-if="photo.sizeText"> · {{ photo.sizeText }}</span>
          </p>
        </div>

        <div class="card__actions">
          <button type="button" class="icon-btn" title="查看大图" @click.stop="handleOpen">
            <AppIcon name="zoomIn" :size="16" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="下载照片"
            :disabled="downloading"
            @click.stop="handleDownload"
          >
            <AppIcon :name="downloading ? 'spinner' : 'download'" :size="16" :class="{ 'is-spinning': downloading }" />
          </button>
        </div>
      </div>
    </div>

    <footer class="card__footer">
      <p class="card__title" :title="photo.displayName">{{ photo.displayName }}</p>
      <p class="card__sub">
        <AppIcon name="calendar" :size="12" />
        {{ photo.shotAtText || '未知拍摄时间' }}
      </p>
    </footer>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  animation: fadeIn 0.24s ease both;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: var(--border-strong);
}

.card.is-selected {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.card__media {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--surface-sunken);
}

.card__placeholder {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  filter: saturate(0.6);
}

.card__img {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.32s ease, transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.card:hover .card__img {
  transform: scale(1.03);
}

.card__img.is-loaded {
  opacity: 1;
}

.card__failed {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--bg-subtle);
  color: var(--text-muted);
  font-size: 12px;
}

.card__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(16, 20, 28, 0.6);
  color: #fff;
  font-size: 11px;
  backdrop-filter: blur(4px);
}

.card__check {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
}

.card__check input {
  margin: 0;
  cursor: pointer;
  accent-color: var(--brand);
}

.card__overlay {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  padding: 28px 10px 10px;
  background: linear-gradient(to top, var(--scrim), transparent);
  color: #fff;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.card:hover .card__overlay,
.card:focus-within .card__overlay {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.card__overlay-info {
  min-width: 0;
}

.card__name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__meta {
  margin: 2px 0 0;
  font-size: 11.5px;
  opacity: 0.82;
  font-variant-numeric: tabular-nums;
}

.card__actions {
  display: flex;
  gap: 6px;
  flex: none;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  transition: background 0.16s ease;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.32);
}

.icon-btn:disabled {
  opacity: 0.6;
}

.card__footer {
  padding: 9px 12px 11px;
  border-top: 1px solid var(--border);
}

.card__title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__sub {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
}

.is-spinning {
  animation: spin 0.8s linear infinite;
}
</style>

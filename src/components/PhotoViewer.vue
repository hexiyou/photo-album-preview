<script setup>
/**
 * 大图查看器（Lightbox）
 * ---------------------------------------------------------------------------
 * 能力：
 *   · 上一张 / 下一张（按钮、键盘 ← →、鼠标滚轮侧键可选）
 *   · 缩放：滚轮以光标为锚点、按钮、双击在 1x ↔ 2.5x 间切换
 *   · 拖拽平移（仅在放大后可拖，边界自动收敛）
 *   · 旋转 90°（左 / 右）、水平翻转、垂直翻转、一键复位
 *   · 下载原图（带进度）
 *   · 元信息面板 / 底部缩略图导航条
 *   · 相邻图片预加载，切换无白屏
 *
 * 所有几何运算在 utils/viewer-transform.js 里，组件只管交互与渲染。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import VideoPlayer from './VideoPlayer.vue'
import features from '@/config/album.config'
import { useToast } from '@/composables/useToast'
import { downloadPhoto } from '@/utils/download'
import { formatBytes, formatDate, formatDuration, formatFNumber } from '@/utils/format'
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampOffset,
  computeFitScale,
  createViewerTransform,
  measureVisualBox,
  resetViewerTransform,
  rotateViewerTransform,
  transformToCss,
  zoomByStep,
  zoomViewerAt
} from '@/utils/viewer-transform'

const props = defineProps({
  photos: { type: Array, required: true },
  index: { type: Number, required: true },
  open: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'update:index'])

const toast = useToast()

const transform = reactive(createViewerTransform())
const stageEl = ref(null)
const imageEl = ref(null)
const filmstripEl = ref(null)

const container = reactive({ width: 0, height: 0 })
const natural = reactive({ width: 0, height: 0 })

const imageState = ref('loading') // loading | loaded | error
const showInfo = ref(features.metaPanel)
const showFilmstrip = ref(features.filmstrip)

const downloading = ref(false)
const downloadPercent = ref(0)

const photo = computed(() => props.photos[props.index] ?? null)
const total = computed(() => props.photos.length)
const zoomText = computed(() => `${Math.round(transform.scale * 100)}%`)

/** 当前是否是视频：查看器里所有分支都以此为准 */
const isVideo = computed(() => photo.value?.isVideo === true)

/** 播放器实例，视频模式下由它接管键盘 */
const playerRef = ref(null)

/**
 * 播放器拿到真实时长后回写到媒体对象上。
 * 数据层没给时长时（例如扫目录时没装 ffmpeg），列表与表格也能因此补上时长。
 */
function onPlayerMeta({ duration }) {
  const media = photo.value
  if (!media || !Number.isFinite(duration) || duration <= 0) return

  if (!media.video) {
    // 极端情况：识别成了图片，但用户打开的其实是视频
    return
  }

  if (!media.video.duration) {
    media.video.duration = duration
    media.video.durationText = formatDuration(duration)
  }
}

/* -------------------------------------------------------------------------- */
/* 尺寸计算                                                                    */
/* -------------------------------------------------------------------------- */

const sourceSize = computed(() => ({
  width: natural.width || photo.value?.width || 1200,
  height: natural.height || photo.value?.height || 800
}))

const fitScale = computed(() =>
  computeFitScale(
    sourceSize.value.width,
    sourceSize.value.height,
    container.width,
    container.height,
    transform.rotate
  )
)

const baseSize = computed(() => ({
  width: sourceSize.value.width * fitScale.value,
  height: sourceSize.value.height * fitScale.value
}))

const visualBox = computed(() =>
  measureVisualBox({
    naturalWidth: sourceSize.value.width,
    naturalHeight: sourceSize.value.height,
    fitScale: fitScale.value,
    scale: transform.scale,
    rotate: transform.rotate
  })
)

const imageStyle = computed(() => ({
  width: `${baseSize.value.width}px`,
  height: `${baseSize.value.height}px`,
  ...transformToCss(transform)
}))

function syncContainerSize() {
  if (!stageEl.value) return
  const rect = stageEl.value.getBoundingClientRect()
  container.width = rect.width
  container.height = rect.height
  clampNow()
}

function clampNow() {
  clampOffset(transform, visualBox.value, container)
}

let resizeObserver = null

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && stageEl.value) {
    resizeObserver = new ResizeObserver(() => syncContainerSize())
    resizeObserver.observe(stageEl.value)
  }
  window.addEventListener('resize', syncContainerSize)
  window.addEventListener('keydown', handleKeydown)
  syncContainerSize()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', syncContainerSize)
  window.removeEventListener('keydown', handleKeydown)
})

/* -------------------------------------------------------------------------- */
/* 切换图片                                                                    */
/* -------------------------------------------------------------------------- */

watch(
  () => props.index,
  () => {
    resetViewerTransform(transform)
    imageState.value = 'loading'
    natural.width = 0
    natural.height = 0
    nextTick(() => {
      syncContainerSize()
      scrollFilmstripToActive()
    })
    preloadNeighbors()
  }
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetViewerTransform(transform)
      imageState.value = 'loading'
      nextTick(() => {
        syncContainerSize()
        scrollFilmstripToActive()
      })
      preloadNeighbors()
    }
  },
  { immediate: true }
)

function preloadNeighbors() {
  const neighbors = [-1, 1, 2]
  neighbors.forEach((offset) => {
    const target = props.photos[(props.index + offset + props.photos.length) % props.photos.length]
    // 视频一律不预加载：列表只显示 poster，<video> 在真正打开时才创建
    if (!target || target.isVideo || !target.urls?.regular) return
    const img = new Image()
    img.decoding = 'async'
    img.src = target.urls.regular
  })
}

function goTo(index) {
  if (index < 0 || index >= total.value || index === props.index) return
  emit('update:index', index)
}

function step(delta) {
  if (!total.value) return
  goTo((props.index + delta + total.value) % total.value)
}

function onImageLoad(event) {
  imageState.value = 'loaded'
  natural.width = event.target.naturalWidth || 0
  natural.height = event.target.naturalHeight || 0
  nextTick(clampNow)
}

function onImageError() {
  imageState.value = 'error'
}

function retryImage() {
  if (!photo.value?.urls?.full) return
  imageState.value = 'loading'
  const src = photo.value.urls.full
  const img = new Image()
  img.onload = () => {
    natural.width = img.naturalWidth
    natural.height = img.naturalHeight
    imageState.value = 'loaded'
  }
  img.onerror = () => {
    imageState.value = 'error'
  }
  img.src = `${src}${src.includes('?') ? '&' : '?'}_r=${Date.now()}`
}

/* -------------------------------------------------------------------------- */
/* 缩放 / 旋转 / 翻转                                                          */
/* -------------------------------------------------------------------------- */

function anchorFromEvent(event) {
  const rect = stageEl.value?.getBoundingClientRect()
  if (!rect) return { px: 0, py: 0 }
  return {
    px: event.clientX - (rect.left + rect.width / 2),
    py: event.clientY - (rect.top + rect.height / 2)
  }
}

function onWheel(event) {
  if (isVideo.value) return
  if (imageState.value !== 'loaded') return
  event.preventDefault()
  zoomByStep(transform, event.deltaY < 0 ? 1 : -1, anchorFromEvent(event))
  clampNow()
}

function zoomIn() {
  zoomByStep(transform, 1)
  clampNow()
}

function zoomOut() {
  zoomByStep(transform, -1)
  clampNow()
}

function zoomTo(scale) {
  zoomViewerAt(transform, scale)
  clampNow()
}

function onDoubleClick(event) {
  if (isVideo.value) return
  if (transform.scale > 1.001) {
    resetFit()
    return
  }
  zoomViewerAt(transform, 2.5, anchorFromEvent(event))
  clampNow()
}

function resetFit() {
  resetViewerTransform(transform)
}

function rotate(delta) {
  rotateViewerTransform(transform, delta)
  nextTick(() => {
    syncContainerSize()
    clampNow()
  })
}

function toggleFlipH() {
  transform.flipH = !transform.flipH
}

function toggleFlipV() {
  transform.flipV = !transform.flipV
}

/* -------------------------------------------------------------------------- */
/* 拖拽平移                                                                    */
/* -------------------------------------------------------------------------- */

const dragging = reactive({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })

function onPointerDown(event) {
  if (isVideo.value) return
  if (imageState.value !== 'loaded') return
  if (event.button !== undefined && event.button !== 0) return
  dragging.active = true
  dragging.startX = event.clientX
  dragging.startY = event.clientY
  dragging.originX = transform.offsetX
  dragging.originY = transform.offsetY
  stageEl.value?.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event) {
  if (!dragging.active) return
  transform.offsetX = dragging.originX + (event.clientX - dragging.startX)
  transform.offsetY = dragging.originY + (event.clientY - dragging.startY)
  clampNow()
}

function onPointerUp(event) {
  if (!dragging.active) return
  dragging.active = false
  stageEl.value?.releasePointerCapture?.(event.pointerId)
}

/* -------------------------------------------------------------------------- */
/* 下载                                                                        */
/* -------------------------------------------------------------------------- */

let downloadAbort = null

async function handleDownload() {
  if (!photo.value || downloading.value) return
  downloading.value = true
  downloadPercent.value = 0
  downloadAbort = new AbortController()

  try {
    await downloadPhoto(photo.value, {
      signal: downloadAbort.signal,
      onProgress: (percent) => {
        downloadPercent.value = percent
      }
    })
    toast.success(`已保存：${photo.value.downloadName}`)
  } catch (error) {
    toast.error(`下载失败：${error?.message || '未知错误'}`)
  } finally {
    downloading.value = false
    downloadPercent.value = 0
    downloadAbort = null
  }
}

/* -------------------------------------------------------------------------- */
/* 键盘                                                                        */
/* -------------------------------------------------------------------------- */

function handleKeydown(event) {
  if (!props.open || !photo.value) return

  // 输入框内不拦截
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  // 视频模式：←/→ 让位给快退快进，切换媒体改用 PageUp / PageDown
  if (isVideo.value) {
    const player = playerRef.value
    const videoHandlers = {
      Escape: () => emit('close'),
      ' ': () => player?.togglePlay(),
      ArrowLeft: () => player?.seekBy(-5),
      ArrowRight: () => player?.seekBy(5),
      PageUp: () => step(-1),
      PageDown: () => step(1),
      m: () => player?.toggleMute(),
      f: () => player?.toggleFullscreen(),
      i: () => (showInfo.value = !showInfo.value),
      d: () => handleDownload()
    }

    const handler = videoHandlers[event.key]
    if (handler) {
      event.preventDefault()
      handler()
    }
    return
  }

  const handlers = {
    Escape: () => emit('close'),
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
    PageUp: () => step(-1),
    PageDown: () => step(1),
    ArrowUp: () => zoomIn(),
    ArrowDown: () => zoomOut(),
    '+': () => zoomIn(),
    '=': () => zoomIn(),
    '-': () => zoomOut(),
    0: () => resetFit(),
    i: () => (showInfo.value = !showInfo.value),
    d: () => handleDownload(),
    r: () => rotate(90)
  }

  const handler = handlers[event.key]
  if (handler) {
    event.preventDefault()
    handler()
  }
}

/* -------------------------------------------------------------------------- */
/* 底部缩略图条                                                                */
/* -------------------------------------------------------------------------- */

function scrollFilmstripToActive() {
  nextTick(() => {
    const item = filmstripEl.value?.querySelector('.filmstrip__item.is-active')
    if (item && filmstripEl.value) {
      const containerRect = filmstripEl.value.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      const delta = itemRect.left - containerRect.left - (containerRect.width - itemRect.width) / 2
      filmstripEl.value.scrollBy({ left: delta, behavior: 'smooth' })
    }
  })
}

/* -------------------------------------------------------------------------- */
/* 元信息                                                                      */
/* -------------------------------------------------------------------------- */

function audioText(video) {
  if (!video) return '—'
  if (video.hasAudio === null || video.hasAudio === undefined) return '未知'
  return video.hasAudio ? `有（${video.audioCodec ? video.audioCodec.toUpperCase() : '未知编码'}）` : '无音轨'
}

const metaGroups = computed(() => {
  const p = photo.value
  if (!p) return []

  // 共用的两块，图片与视频只是中间那组不同
  const fileItems = [
    { label: '文件名', value: p.fileName },
    { label: '标题', value: p.title || '—' },
    { label: '描述', value: p.description || '—' },
    { label: '格式', value: p.mimeType },
    { label: '体积', value: p.sizeText || '—' }
  ]

  const orgItems = [
    { label: '相册', value: p.album?.name || '—' },
    { label: '上传者', value: p.author?.name || '—' },
    { label: '地点', value: p.location?.name || '—' },
    { label: '标签', value: p.tags?.length ? p.tags.join('、') : '—' }
  ]

  if (p.isVideo) {
    return [
      {
        title: '文件信息',
        items: [
          ...fileItems,
          { label: '分辨率', value: p.resolution || '—' },
          { label: '时长', value: p.video?.durationText || '—' }
        ]
      },
      {
        title: '视频信息',
        items: [
          { label: '编码', value: p.video?.codec ? p.video.codec.toUpperCase() : '—' },
          { label: '码率', value: p.video?.bitrate ? `${Math.round(p.video.bitrate / 1000)} kbps` : '—' },
          { label: '帧率', value: p.video?.frameRate ? `${p.video.frameRate} fps` : '—' },
          { label: '音轨', value: audioText(p.video) },
          { label: '旋转', value: p.video?.rotation ? `容器标记 ${p.video.rotation}°` : '无' },
          { label: '缩略图', value: p.video?.thumbReady ? '已生成' : '未生成，仅显示图标' }
        ]
      },
      { title: '组织信息', items: orgItems }
    ]
  }

  return [
    {
      title: '文件信息',
      items: [
        ...fileItems,
        { label: '尺寸', value: p.resolution || '—' },
        { label: '像素', value: p.megapixel || '—' }
      ]
    },
    {
      title: '拍摄信息',
      items: [
        { label: '拍摄时间', value: p.takenAt ? formatDate(p.takenAt, 'YYYY-MM-DD HH:mm') : '—' },
        { label: '上传时间', value: p.createdAt ? formatDate(p.createdAt, 'YYYY-MM-DD HH:mm') : '—' },
        { label: '相机', value: p.exif?.camera || '—' },
        { label: '镜头', value: p.exif?.lens || '—' },
        { label: '焦距', value: p.exif?.focalLength || '—' },
        { label: '光圈', value: formatFNumber(p.exif?.fNumber) || '—' },
        { label: 'ISO', value: p.exif?.iso ? `ISO ${p.exif.iso}` : '—' }
      ]
    },
    { title: '组织信息', items: orgItems }
  ]
})
</script>

<template>
  <Teleport to="body">
    <Transition name="viewer">
      <div v-if="open && photo" class="viewer" role="dialog" aria-modal="true" :aria-label="`查看 ${photo.displayName}`">
        <!-- 顶栏 -->
        <header class="viewer__bar">
          <div class="viewer__bar-left">
            <div class="viewer__title">
              <p class="viewer__name" :title="photo.displayName">{{ photo.displayName }}</p>
              <p class="viewer__counter">
                {{ index + 1 }} / {{ total }}
                <span v-if="photo.resolution"> · {{ photo.resolution }}</span>
                <span v-if="isVideo && photo.video?.durationText"> · {{ photo.video.durationText }}</span>
              </p>
            </div>
          </div>

          <div class="viewer__bar-right">
            <button
              v-if="features.download"
              type="button"
              class="tool"
              :class="{ 'is-busy': downloading }"
              :title="downloading ? `下载中 ${downloadPercent}%` : isVideo ? '下载视频（D）' : '下载原图（D）'"
              @click="handleDownload"
            >
              <AppIcon :name="downloading ? 'spinner' : 'download'" :size="17" :class="{ 'is-spinning': downloading }" />
              <span v-if="downloading" class="tool__text">{{ downloadPercent }}%</span>
            </button>

            <button
              v-if="features.metaPanel"
              type="button"
              class="tool"
              :class="{ 'is-active': showInfo }"
              title="照片信息（I）"
              @click="showInfo = !showInfo"
            >
              <AppIcon name="info" :size="17" />
            </button>

            <button
              v-if="features.filmstrip"
              type="button"
              class="tool"
              :class="{ 'is-active': showFilmstrip }"
              title="缩略图导航"
              @click="showFilmstrip = !showFilmstrip"
            >
              <AppIcon name="film" :size="17" />
            </button>

            <button type="button" class="tool tool--close" title="关闭（Esc）" @click="emit('close')">
              <AppIcon name="close" :size="19" />
            </button>
          </div>
        </header>

        <!-- 主舞台 -->
        <div class="viewer__body">
          <button
            v-if="total > 1"
            type="button"
            class="nav nav--prev"
            title="上一张（←）"
            @click="step(-1)"
          >
            <AppIcon name="chevronLeft" :size="22" />
          </button>

          <div
            ref="stageEl"
            class="stage"
            :class="{ 'is-grabbing': dragging.active, 'is-grabbable': transform.scale > 1.001, 'is-video': isVideo }"
            @wheel="onWheel"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @dblclick="onDoubleClick"
          >
            <!-- 视频：整个播放器按 id 重建，切换时上一个会被彻底释放 -->
            <template v-if="isVideo">
              <VideoPlayer
                v-if="features.video"
                ref="playerRef"
                :key="photo.id"
                :media="photo"
                @meta="onPlayerMeta"
              />
              <div v-else class="stage__status">
                <AppIcon name="video" :size="26" />
                <p>视频播放已关闭</p>
              </div>
            </template>

            <template v-else>
              <img
                v-if="photo.urls.full || photo.urls.regular"
                v-show="imageState === 'loaded'"
                ref="imageEl"
                class="stage__img"
                :src="photo.urls.full || photo.urls.regular"
                :alt="photo.displayName"
                :style="imageStyle"
                draggable="false"
                @load="onImageLoad"
                @error="onImageError"
              />

              <div v-if="imageState === 'loading'" class="stage__status">
                <AppIcon name="spinner" :size="22" class="is-spinning" />
                <p>正在加载大图…</p>
              </div>

              <div v-else-if="imageState === 'error'" class="stage__status stage__status--error">
                <AppIcon name="alert" :size="24" />
                <p>大图加载失败</p>
                <button type="button" class="btn btn--sm" @click="retryImage">重新加载</button>
              </div>
            </template>
          </div>

          <button
            v-if="total > 1"
            type="button"
            class="nav nav--next"
            title="下一张（→）"
            @click="step(1)"
          >
            <AppIcon name="chevronRight" :size="22" />
          </button>

          <!-- 元信息面板 -->
          <Transition name="panel">
            <aside v-if="showInfo" class="panel">
              <div v-for="group in metaGroups" :key="group.title" class="panel__group">
                <h4 class="panel__title">{{ group.title }}</h4>
                <dl class="panel__list">
                  <div v-for="item in group.items" :key="item.label" class="panel__row">
                    <dt>{{ item.label }}</dt>
                    <dd :title="String(item.value)">{{ item.value }}</dd>
                  </div>
                </dl>
              </div>
            </aside>
          </Transition>
        </div>

        <!-- 底部工具条 -->
        <footer class="viewer__tools">
          <!-- 图片：缩放 / 旋转 / 翻转 -->
          <div v-if="!isVideo" class="tools">
            <button type="button" class="tool" title="缩小（- / ↓）" :disabled="transform.scale <= ZOOM_MIN" @click="zoomOut">
              <AppIcon name="zoomOut" :size="17" />
            </button>
            <span class="tools__zoom">{{ zoomText }}</span>
            <button type="button" class="tool" title="放大（+ / ↑）" :disabled="transform.scale >= ZOOM_MAX" @click="zoomIn">
              <AppIcon name="zoomIn" :size="17" />
            </button>

            <span class="tools__divider" />

            <button type="button" class="tool" title="向左旋转 90°（R）" @click="rotate(-90)">
              <AppIcon name="rotateLeft" :size="17" />
            </button>
            <button type="button" class="tool" title="向右旋转 90°" @click="rotate(90)">
              <AppIcon name="rotateRight" :size="17" />
            </button>

            <span class="tools__divider" />

            <button type="button" class="tool" :class="{ 'is-active': transform.flipH }" title="水平翻转" @click="toggleFlipH">
              <AppIcon name="flipH" :size="17" />
            </button>
            <button type="button" class="tool" :class="{ 'is-active': transform.flipV }" title="垂直翻转" @click="toggleFlipV">
              <AppIcon name="flipV" :size="17" />
            </button>

            <span class="tools__divider" />

            <button type="button" class="tool" title="复位（0）" @click="resetFit">
              <AppIcon name="fit" :size="17" />
            </button>
          </div>

          <!-- 视频：播放控制都在播放器里，这里只留快捷键提示 -->
          <div v-else class="tools tools--video">
            <span class="tools__hint">
              <kbd>空格</kbd> 播放 / 暂停
              <kbd>← →</kbd> 快退快进 5 秒
              <kbd>PageUp / PageDown</kbd> 上一个 / 下一个
              <kbd>F</kbd> 全屏
              <kbd>M</kbd> 静音
            </span>
          </div>

          <Transition name="panel">
            <div v-if="showFilmstrip && total > 1" ref="filmstripEl" class="filmstrip">
              <button
                v-for="(item, i) in photos"
                :key="item.id"
                type="button"
                class="filmstrip__item"
                :class="{ 'is-active': i === index }"
                :title="item.displayName"
                @click="goTo(i)"
              >
                <img
                  v-if="item.urls.thumb"
                  :src="item.urls.thumb"
                  :alt="item.displayName"
                  loading="lazy"
                  decoding="async"
                />
                <span v-else class="filmstrip__placeholder">
                  <AppIcon :name="item.isVideo ? 'video' : 'image'" :size="15" />
                </span>
                <span v-if="item.isVideo && item.video?.durationText" class="filmstrip__duration">
                  {{ item.video.durationText }}
                </span>
              </button>
            </div>
          </Transition>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: rgba(14, 17, 23, 0.96);
  color: #f2f4f7;
  user-select: none;
}

/* 顶栏 -------------------------------------------------------------------- */
.viewer__bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex: none;
}

.viewer__name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  max-width: 46vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer__counter {
  margin: 1px 0 0;
  font-size: 12px;
  color: rgba(242, 244, 247, 0.6);
  font-variant-numeric: tabular-nums;
}

.viewer__bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.tool {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  min-width: 34px;
  padding: 0 8px;
  justify-content: center;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: rgba(242, 244, 247, 0.82);
  font-size: 12.5px;
  transition: background 0.16s ease, color 0.16s ease;
}

.tool:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tool.is-active {
  background: rgba(45, 100, 242, 0.24);
  color: #93b4ff;
}

.tool.is-busy {
  background: rgba(45, 100, 242, 0.18);
  color: #b9caff;
}

.tool--close:hover {
  background: rgba(220, 59, 70, 0.22);
  color: #ff9ba1;
}

.tool__text {
  font-variant-numeric: tabular-nums;
}

/* 主体 -------------------------------------------------------------------- */
.viewer__body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.stage {
  position: relative;
  flex: 1;
  min-width: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  touch-action: none;
  cursor: zoom-in;
}

.stage.is-grabbable {
  cursor: grab;
}

.stage.is-grabbing {
  cursor: grabbing;
}

/* 视频由播放器自己处理点击，不需要图片那套光标暗示 */
.stage.is-video {
  cursor: default;
}

.stage__img {
  display: block;
  max-width: none;
  transform-origin: center center;
  will-change: transform;
  -webkit-user-drag: none;
}

.stage__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: rgba(242, 244, 247, 0.66);
  font-size: 13px;
}

.stage__status p {
  margin: 0;
}

.stage__status--error {
  color: #ff9ba1;
}

.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  display: grid;
  place-items: center;
  width: 44px;
  height: 76px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(242, 244, 247, 0.75);
  transition: background 0.16s ease, color 0.16s ease;
}

.nav:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.nav--prev {
  left: 12px;
}

.nav--next {
  right: 12px;
}

/* 信息面板 ---------------------------------------------------------------- */
.panel {
  width: 300px;
  flex: none;
  padding: 16px 18px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  overflow-y: auto;
}

.panel__group + .panel__group {
  margin-top: 18px;
}

.panel__title {
  margin: 0 0 8px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(242, 244, 247, 0.45);
}

.panel__list {
  margin: 0;
}

.panel__row {
  display: flex;
  gap: 12px;
  padding: 5px 0;
  font-size: 12.5px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.07);
}

.panel__row:last-child {
  border-bottom: none;
}

.panel__row dt {
  flex: none;
  width: 68px;
  color: rgba(242, 244, 247, 0.5);
}

.panel__row dd {
  margin: 0;
  flex: 1;
  min-width: 0;
  word-break: break-all;
  color: rgba(242, 244, 247, 0.92);
}

/* 底部工具条 -------------------------------------------------------------- */
.viewer__tools {
  flex: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 14px 10px;
}

.tools {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex-wrap: wrap;
}

.tools__zoom {
  min-width: 52px;
  text-align: center;
  font-size: 12.5px;
  color: rgba(242, 244, 247, 0.7);
  font-variant-numeric: tabular-nums;
}

.tools__divider {
  width: 1px;
  height: 18px;
  margin: 0 8px;
  background: rgba(255, 255, 255, 0.12);
}

.tools--video {
  min-height: 34px;
}

.tools__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 11.5px;
  color: rgba(242, 244, 247, 0.5);
}

.tools__hint kbd {
  padding: 1px 5px;
  margin-left: 8px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  font-family: var(--mono);
  font-size: 10.5px;
  color: rgba(242, 244, 247, 0.82);
}

/* 缩略图条 ---------------------------------------------------------------- */
.filmstrip {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding: 6px 2px 2px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.filmstrip__item {
  position: relative;
  flex: none;
  width: 72px;
  height: 50px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 7px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  opacity: 0.55;
  transition: opacity 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.filmstrip__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.filmstrip__placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: rgba(242, 244, 247, 0.42);
}

.filmstrip__duration {
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 0 3px;
  border-radius: 3px;
  background: rgba(12, 16, 24, 0.8);
  color: #fff;
  font-size: 10px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.filmstrip__item:hover {
  opacity: 0.85;
  transform: translateY(-2px);
}

.filmstrip__item.is-active {
  border-color: #5b86ff;
  opacity: 1;
}

/* 动画 -------------------------------------------------------------------- */
.viewer-enter-active,
.viewer-leave-active {
  transition: opacity 0.2s ease;
}

.viewer-enter-from,
.viewer-leave-to {
  opacity: 0;
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.is-spinning {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 860px) {
  .panel {
    display: none;
  }

  .nav {
    width: 38px;
    height: 64px;
  }
}
</style>

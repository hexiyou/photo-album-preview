<script setup>
/**
 * 视频播放器（H.264 MP4）
 * ---------------------------------------------------------------------------
 * 能力：播放暂停 / 进度条点击与拖动 / 快退快进 5 秒 / 音量 / 倍速 / 画中画 / 全屏
 *
 * 三条重要约束：
 *   1. **点击才加载**：列表页只用 poster，<video> 在进入查看器时才创建；
 *   2. **切换即释放**：外部用 :key="media.id" 让播放器整体重建，
 *      卸载时 useMediaPlayer 会 pause + 移除 src，不会多路解码同时占内存；
 *   3. **时长双通道**：数据层给了就用数据层的，没给就从 loadedmetadata 拿并回传。
 */
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { PLAYBACK_RATES, useMediaPlayer } from '@/composables/useMediaPlayer'

const props = defineProps({
  media: { type: Object, required: true },
  autoplay: { type: Boolean, default: true }
})

const emit = defineEmits(['meta'])

const videoEl = ref(null)
const trackEl = ref(null)

const player = useMediaPlayer(videoEl)
const {
  state,
  progress,
  currentTimeText,
  durationText,
  autoPlayBlocked,
  togglePlay,
  seekToRatio,
  seekBy,
  setVolume,
  toggleMute,
  setRate,
  cycleRate,
  toggleFullscreen,
  togglePictureInPicture,
  presetDuration
} = player

const dragging = ref(false)
const dragRatio = ref(0)
const canPiP = ref(false)

/** 数据层已知时长时先顶上，避免进度条从 0 跳变 */
watch(
  () => props.media?.video?.duration,
  (value) => {
    if (value) presetDuration(value)
  },
  { immediate: true }
)

onMounted(() => {
  canPiP.value = Boolean(document.pictureInPictureEnabled)
})

const hasSource = computed(() => Boolean(props.media?.playUrl))
const shownRatio = computed(() => (dragging.value ? dragRatio.value : progress.value))
const rateText = computed(() => `${state.rate}x`)
const volumeIcon = computed(() => (state.muted || state.volume === 0 ? 'volumeMute' : 'volume'))

function ratioFromEvent(event) {
  const rect = trackEl.value?.getBoundingClientRect()
  if (!rect || !rect.width) return 0
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

function onTrackDown(event) {
  if (!state.duration) return
  dragging.value = true
  dragRatio.value = ratioFromEvent(event)
  player.beginScrub()
  trackEl.value?.setPointerCapture?.(event.pointerId)
}

function onTrackMove(event) {
  if (!dragging.value) return
  dragRatio.value = ratioFromEvent(event)
}

function onTrackUp(event) {
  if (!dragging.value) return
  dragging.value = false
  trackEl.value?.releasePointerCapture?.(event.pointerId)
  seekToRatio(dragRatio.value)
  player.endScrub()
}

function onVolumeInput(event) {
  setVolume(Number(event.target.value) / 100)
}

function onMeta() {
  const actual = videoEl.value?.duration
  const duration = Number.isFinite(actual) && actual > 0 ? actual : state.duration
  emit('meta', { duration })
  if (props.autoplay) player.play()
}

// 供查看器在视频模式下接管键盘
defineExpose({ togglePlay, seekBy, toggleMute, toggleFullscreen, state })
</script>

<template>
  <div class="vplayer">
    <template v-if="hasSource">
      <video
        ref="videoEl"
        class="vplayer__video"
        :src="media.playUrl"
        :poster="media.urls.poster || ''"
        preload="metadata"
        playsinline
        @click="togglePlay"
        @loadedmetadata="onMeta"
      ></video>

      <button
        v-if="!state.playing && !state.error"
        type="button"
        class="vplayer__big"
        title="播放 / 暂停（空格）"
        @click="togglePlay"
      >
        <AppIcon name="play" :size="30" filled />
      </button>

      <div v-if="state.waiting && !state.error" class="vplayer__waiting">
        <AppIcon name="spinner" :size="26" class="is-spinning" />
      </div>

      <div v-if="state.error" class="vplayer__error">
        <AppIcon name="alert" :size="26" />
        <p>{{ state.error }}</p>
        <p v-if="media?.video && !media.video.supported" class="vplayer__error-hint">
          当前仅支持 H.264 编码的 MP4
        </p>
      </div>

      <div v-if="!state.error" class="vplayer__bar">
        <div
          ref="trackEl"
          class="track"
          @pointerdown="onTrackDown"
          @pointermove="onTrackMove"
          @pointerup="onTrackUp"
          @pointercancel="onTrackUp"
        >
          <div class="track__rail">
            <div class="track__buffer" :style="{ width: `${state.buffered * 100}%` }" />
            <div class="track__played" :style="{ width: `${shownRatio * 100}%` }" />
          </div>
          <div class="track__thumb" :style="{ left: `${shownRatio * 100}%` }" />
        </div>

        <div class="controls">
          <button type="button" class="ctl" :title="state.playing ? '暂停（空格）' : '播放（空格）'" @click="togglePlay">
            <AppIcon :name="state.playing ? 'pause' : 'play'" :size="17" :filled="!state.playing" />
          </button>

          <button type="button" class="ctl" title="后退 5 秒（←）" @click="seekBy(-5)">
            <AppIcon name="rewind" :size="16" :filled="true" />
          </button>

          <button type="button" class="ctl" title="前进 5 秒（→）" @click="seekBy(5)">
            <AppIcon name="forward" :size="16" :filled="true" />
          </button>

          <span class="time">
            <b>{{ currentTimeText || '00:00' }}</b> / {{ durationText || '00:00' }}
          </span>

          <span v-if="autoPlayBlocked" class="hint">已静音播放</span>

          <span class="spacer" />

          <div class="volume">
            <button type="button" class="ctl" :title="state.muted ? '取消静音（M）' : '静音（M）'" @click="toggleMute">
              <AppIcon :name="volumeIcon" :size="17" />
            </button>
            <input
              class="volume__slider"
              type="range"
              min="0"
              max="100"
              :value="state.muted ? 0 : Math.round(state.volume * 100)"
              aria-label="音量"
              @input="onVolumeInput"
            />
          </div>

          <button type="button" class="ctl ctl--text" title="播放速度" @click="cycleRate">
            {{ rateText }}
          </button>

          <button v-if="canPiP" type="button" class="ctl" title="画中画" @click="togglePictureInPicture">
            <AppIcon name="pip" :size="17" />
          </button>

          <button type="button" class="ctl" title="全屏（F）" @click="toggleFullscreen">
            <AppIcon name="fullscreen" :size="17" />
          </button>
        </div>
      </div>
    </template>

    <!-- 没有播放源：演示数据未生成（无 ffmpeg 时的预期形态） -->
    <div v-else class="vplayer__empty">
      <AppIcon name="video" :size="34" />
      <p>{{ media?.displayName }}</p>
      <small>该视频没有可用的播放源</small>
      <small v-if="media?.video?.duration">时长 {{ media.video.durationText }}</small>
    </div>
  </div>
</template>

<style scoped>
.vplayer {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.vplayer__video {
  display: block;
  max-width: 100%;
  max-height: 100%;
  background: #000;
  cursor: pointer;
}

/* 中央播放按钮 -------------------------------------------------------- */
.vplayer__big {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border: none;
  border-radius: 50%;
  background: rgba(12, 16, 24, 0.55);
  color: #fff;
  backdrop-filter: blur(4px);
  transition: background 0.16s ease, transform 0.16s ease;
}

.vplayer__big:hover {
  background: rgba(12, 16, 24, 0.75);
  transform: translate(-50%, -50%) scale(1.06);
}

.vplayer__waiting {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.8);
}

.vplayer__error,
.vplayer__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: rgba(242, 244, 247, 0.72);
  text-align: center;
}

.vplayer__error p,
.vplayer__empty p {
  margin: 0;
  font-size: 13.5px;
}

.vplayer__error-hint,
.vplayer__empty small {
  font-size: 12px;
  color: rgba(242, 244, 247, 0.5);
}

.vplayer__empty {
  gap: 6px;
  color: rgba(242, 244, 247, 0.62);
}

/* 控制条 -------------------------------------------------------------- */
.vplayer__bar {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 26px 16px 12px;
  background: linear-gradient(to top, rgba(10, 13, 18, 0.82), rgba(10, 13, 18, 0));
}

.track {
  position: relative;
  height: 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.track__rail {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  overflow: hidden;
  transition: height 0.14s ease;
}

.track:hover .track__rail {
  height: 6px;
}

.track__buffer {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(255, 255, 255, 0.28);
}

.track__played {
  position: absolute;
  inset: 0 auto 0 0;
  background: #4c7dff;
}

.track__thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border-radius: 50%;
  background: #fff;
  transform: translateY(-50%) scale(0);
  transition: transform 0.14s ease;
  pointer-events: none;
}

.track:hover .track__thumb {
  transform: translateY(-50%) scale(1);
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.spacer {
  flex: 1;
}

.ctl {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(242, 244, 247, 0.86);
  transition: background 0.16s ease, color 0.16s ease;
}

.ctl:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.ctl--text {
  width: auto;
  min-width: 38px;
  padding: 0 8px;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.time {
  margin: 0 8px;
  font-size: 12.5px;
  color: rgba(242, 244, 247, 0.62);
  font-variant-numeric: tabular-nums;
}

.time b {
  font-weight: 500;
  color: rgba(242, 244, 247, 0.94);
}

.hint {
  font-size: 11.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(242, 244, 247, 0.78);
}

.volume {
  display: flex;
  align-items: center;
  gap: 6px;
}

.volume__slider {
  width: 0;
  opacity: 0;
  height: 4px;
  appearance: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  transition: width 0.18s ease, opacity 0.18s ease;
  cursor: pointer;
}

.volume:hover .volume__slider,
.volume:focus-within .volume__slider {
  width: 74px;
  opacity: 1;
}

.volume__slider::-webkit-slider-thumb {
  appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
}

.volume__slider::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border: none;
  border-radius: 50%;
  background: #fff;
}

.is-spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

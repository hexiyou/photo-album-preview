/**
 * 视频播放器状态机
 * ---------------------------------------------------------------------------
 * 只负责"状态 + 操作"，不碰 DOM 结构，方便后续替换播放器实现。
 *
 * 生命周期的关键点：**切换媒体时必须彻底释放上一个 <video>**。
 * 组件侧用 :key="media.id" 让切换时整个播放器重建，
 * 这里的 unbind() 会 pause + 清空 src，避免多路解码同时占用内存。
 */

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { formatDuration } from '@/utils/format'

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * @param {import('vue').Ref<HTMLVideoElement|null>} videoRef 组件里的 <video> ref
 */
export function useMediaPlayer(videoRef) {
  const state = reactive({
    /** 元信息已加载（才能拿到 duration） */
    ready: false,
    playing: false,
    currentTime: 0,
    /** 服务端/容器给的时长；为 0 时表示尚未拿到 */
    duration: 0,
    /** 输入框内提示用的缓冲进度（0~1） */
    buffered: 0,
    volume: 1,
    muted: false,
    rate: 1,
    /** 缓冲中（网络慢时的转圈提示） */
    waiting: false,
    seeking: false,
    error: null,
    fullscreen: false,
    pip: false
  })

  /** 进度条是否处于拖动中：拖动时不要被 timeupdate 抢回位置 */
  const scrubbing = ref(false)
  const autoPlayBlocked = ref(false)

  let el = null
  const listeners = []
  /** 数据层预设的时长：元素挂载时会先 unbind 再 bind，用它把时长补回来 */
  let desiredDuration = 0

  const progress = computed(() => {
    if (!state.duration || !Number.isFinite(state.duration)) return 0
    return clamp(state.currentTime / state.duration, 0, 1)
  })

  const currentTimeText = computed(() => formatDuration(state.currentTime))
  const durationText = computed(() => formatDuration(state.duration))
  const remainingText = computed(() => formatDuration(Math.max(0, state.duration - state.currentTime)))
  const volumePercent = computed(() => Math.round((state.muted ? 0 : state.volume) * 100))

  function on(target, event, handler) {
    target.addEventListener(event, handler)
    listeners.push([target, event, handler])
  }

  function syncBuffered(target) {
    const { buffered } = target
    if (!buffered || !buffered.length || !target.duration) {
      state.buffered = 0
      return
    }
    state.buffered = clamp(buffered.end(buffered.length - 1) / target.duration, 0, 1)
  }

  function bind(target) {
    el = target
    // 挂载时会先走一次 unbind（清掉 state），这里把预设时长补回去，
    // 否则进度条会先闪一下 00:00 再跳到真实时长
    if (desiredDuration > 0) state.duration = desiredDuration

    on(target, 'loadedmetadata', () => {
      if (Number.isFinite(target.duration) && target.duration > 0) state.duration = target.duration
      state.ready = true
      state.volume = target.volume
      state.muted = target.muted
      state.rate = target.playbackRate
    })

    on(target, 'timeupdate', () => {
      if (!scrubbing.value) state.currentTime = target.currentTime
    })

    on(target, 'progress', () => syncBuffered(target))
    on(target, 'play', () => {
      state.playing = true
      autoPlayBlocked.value = false
    })
    on(target, 'pause', () => {
      state.playing = false
    })
    on(target, 'ended', () => {
      state.playing = false
    })
    on(target, 'waiting', () => {
      state.waiting = true
    })
    on(target, 'playing', () => {
      state.waiting = false
    })
    on(target, 'seeking', () => {
      state.seeking = true
    })
    on(target, 'seeked', () => {
      state.seeking = false
      state.currentTime = target.currentTime
      syncBuffered(target)
    })
    on(target, 'volumechange', () => {
      state.volume = target.volume
      state.muted = target.muted
    })
    on(target, 'ratechange', () => {
      state.rate = target.playbackRate
    })
    on(target, 'error', () => {
      const code = target.error?.code
      state.error =
        code === 4
          ? '该视频格式浏览器无法播放（目前仅支持 H.264 MP4）'
          : code === 2
            ? '网络错误，视频加载中断'
            : '视频加载失败'
      state.playing = false
    })
  }

  function unbind() {
    for (const [target, event, handler] of listeners) target.removeEventListener(event, handler)
    listeners.length = 0

    if (el) {
      try {
        el.pause()
        // 关键：断开 src 才会真正释放解码资源
        el.removeAttribute('src')
        el.load()
      } catch {
        /* 元素已销毁，忽略 */
      }
      el = null
    }

    state.ready = false
    state.playing = false
    state.currentTime = 0
    state.duration = 0
    state.buffered = 0
    state.waiting = false
    state.seeking = false
    state.error = null
    scrubbing.value = false
  }

  watch(videoRef, (target) => {
    unbind()
    if (target) bind(target)
  })

  onBeforeUnmount(unbind)

  /* ------------------------------------------------------------------ */
  /* 操作                                                                */
  /* ------------------------------------------------------------------ */

  function play() {
    if (!el) return
    const task = el.play()
    // 浏览器可能因"未经交互的带声播放"拒绝，此时退化为静音播放
    if (task && typeof task.catch === 'function') {
      task.catch(() => {
        el.muted = true
        autoPlayBlocked.value = true
        el.play().catch(() => {
          autoPlayBlocked.value = true
        })
      })
    }
  }

  function pause() {
    el?.pause()
  }

  function togglePlay() {
    if (!el) return
    if (el.paused) play()
    else pause()
  }

  function seek(time) {
    if (!el || !Number.isFinite(state.duration)) return
    const next = clamp(Number(time) || 0, 0, state.duration)
    el.currentTime = next
    state.currentTime = next
  }

  function seekBy(delta) {
    seek(state.currentTime + delta)
  }

  /** 进度条点击 / 拖动：ratio 为 0~1 */
  function seekToRatio(ratio) {
    if (!Number.isFinite(state.duration)) return
    seek(clamp(ratio, 0, 1) * state.duration)
  }

  function beginScrub() {
    scrubbing.value = true
  }

  function endScrub() {
    scrubbing.value = false
  }

  function setVolume(value) {
    if (!el) return
    const next = clamp(Number(value) || 0, 0, 1)
    el.volume = next
    if (next > 0 && el.muted) el.muted = false
  }

  function toggleMute() {
    if (!el) return
    el.muted = !el.muted
    if (!el.muted && el.volume === 0) el.volume = 0.6
  }

  function setRate(rate) {
    if (!el) return
    el.playbackRate = Number(rate) || 1
  }

  function cycleRate() {
    const index = PLAYBACK_RATES.indexOf(state.rate)
    const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1
    setRate(next)
  }

  async function toggleFullscreen() {
    if (!el) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await el.requestFullscreen?.()
    } catch {
      /* 用户拒绝或不支持，忽略 */
    }
  }

  async function togglePictureInPicture() {
    if (!el || !document.pictureInPictureEnabled) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await el.requestPictureInPicture?.()
    } catch {
      /* 不支持或被拒绝，忽略 */
    }
  }

  /** 供外部（查看器）在数据层已知时长时预设，避免进度条初始跳动 */
  function presetDuration(seconds) {
    const value = Number(seconds)
    if (!Number.isFinite(value) || value <= 0) return
    desiredDuration = value
    state.duration = value
  }

  return {
    state,
    scrubbing,
    autoPlayBlocked,
    progress,
    currentTimeText,
    durationText,
    remainingText,
    volumePercent,
    play,
    pause,
    togglePlay,
    seek,
    seekBy,
    seekToRatio,
    beginScrub,
    endScrub,
    setVolume,
    toggleMute,
    setRate,
    cycleRate,
    toggleFullscreen,
    togglePictureInPicture,
    presetDuration
  }
}

export default useMediaPlayer

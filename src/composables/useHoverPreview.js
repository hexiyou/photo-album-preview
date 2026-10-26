/**
 * 卡片悬停静音预览（hover preview）
 * ---------------------------------------------------------------------------
 * 鼠标停在视频卡片上 400ms 后，就地静音循环播放一小段；移开立即停。
 *
 * 三条硬约束（都是为了让这个功能不至于变成流量黑洞）：
 *
 * 1. **400ms 延迟**：鼠标划过一整片卡片时不会每个都去拉视频数据，
 *    只有真正"停住"了才开始加载。
 * 2. **全局单例**：同一时刻只允许一个卡片持有预览。切到另一张卡片时，
 *    上一张会被强制释放（模块级 activeRelease 就是这把锁）。
 * 3. **移开即彻底释放**：pause() → removeAttribute('src') → load()。
 *    只 v-if 移除元素是不够的，解码线程与网络请求会继续跑，
 *    必须走这三步才会真正断掉。
 *
 * 另外：触屏设备不触发（pointerType === 'mouse' 才生效），
 * 因为触屏上"悬停"是一次点击的前摇，没有停留语义。
 */

import { ref, watch, onBeforeUnmount } from 'vue'

const HOVER_DELAY = 400
const STORAGE_KEY = 'album.hoverPreview'

function readPref() {
  if (typeof localStorage === 'undefined') return true
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return true
  return raw !== '0' && raw !== 'false'
}

/** 全局开关：卡片悬停时是否静音自动播放（偏好存 localStorage） */
export const hoverPreviewEnabled = ref(readPref())

export function setHoverPreviewEnabled(next) {
  hoverPreviewEnabled.value = !!next
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch (error) {
    /* 隐私模式下 localStorage 不可写，忽略即可，不影响本次会话 */
  }
}

/** 当前持有预览的卡片的释放函数（全局单例锁） */
let activeRelease = null

/** 视频能否参与悬停预览 */
export function canHoverPreview(media) {
  return !!(
    media &&
    media.isVideo &&
    media.playUrl &&
    media.video &&
    media.video.supported !== false
  )
}

export function useHoverPreview(mediaRef) {
  /** 是否正在预览（v-if 控制 <video> 的挂载与卸载） */
  const previewing = ref(false)
  const videoRef = ref(null)
  /** 加载失败时静默退回缩略图，不打扰用户 */
  const previewFailed = ref(false)

  let timer = 0
  let el = null

  function release() {
    if (timer) {
      clearTimeout(timer)
      timer = 0
    }

    if (el) {
      try {
        el.pause()
      } catch (error) {
        /* 已卸载的媒体元素 pause 会抛错，忽略 */
      }
      // 摘掉 src 再 load()，才能真正释放解码资源与挂起的网络请求
      el.removeAttribute('src')
      try {
        el.load()
      } catch (error) {
        /* 同上 */
      }
      el = null
    }

    previewing.value = false
    previewFailed.value = false
    if (activeRelease === release) activeRelease = null
  }

  /** 鼠标进入：起 400ms 计时器 */
  function arm() {
    if (!hoverPreviewEnabled.value) return
    if (timer || previewing.value) return
    if (!canHoverPreview(mediaRef.value)) return

    timer = setTimeout(() => {
      timer = 0
      // 抢占：万一上一张卡片的 leave 没来得及触发，先把它停掉
      if (activeRelease && activeRelease !== release) activeRelease()
      activeRelease = release
      previewing.value = true
    }, HOVER_DELAY)
  }

  /** 鼠标离开：计时未到就取消，已开始播就彻底释放 */
  function disarm() {
    if (timer) {
      clearTimeout(timer)
      timer = 0
      return
    }
    if (previewing.value) release()
  }

  /** 供外部强制停止（例如点击卡片打开查看器时） */
  function stop() {
    release()
  }

  // <video> 挂载后立刻静音起播；卸载时 el 会被置空
  watch(videoRef, (node) => {
    el = node || null
    if (!node) return

    node.muted = true
    node.volume = 0
    // 自动播放被策略拦截时静默吞掉，画面退回缩略图即可
    const promise = node.play()
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        previewFailed.value = true
      })
    }
  })

  onBeforeUnmount(release)

  return { previewing, previewFailed, videoRef, arm, disarm, stop }
}

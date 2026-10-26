/**
 * 进度条预览（scrub preview）
 * ---------------------------------------------------------------------------
 * 鼠标在进度条上移动时，显示"那一刻的画面"。两条通路，自动择优：
 *
 *   雪碧图 ready      → 只挪 background-position，**零请求**
 *   其它（生成中/无 ffmpeg）→ 用一个隐藏 video 实时 seek 到那个时间点取画面
 *
 * 雪碧图是**按需生成**的：打开查看器时才问服务端要，服务端没有就后台现做。
 * 这期间前端先拿实时取帧顶着，隔 2.5 秒再问一次，最多重试 3 次。
 * 用户层面的感受是：刚打开时拖动稍微依赖网络，几秒后起一个块麻将瞬切。
 *
 * 整个模块失败不影响播放 —— 最坏情况退化为"拖动时只看时间数字"。
 */

import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { photoApi } from '@/api/photoApi'

const RETRY_DELAY = 2500
const MAX_RETRY = 3

export function useScrubPreview(mediaRef) {
  /** 雪碧图布局元数据；null 表示尚未拿到 */
  const sprite = shallowRef(null)
  /** idle → loading → ready / unavailable / generating */
  const phase = ref('idle')

  let retryTimer = 0
  let retries = 0

  function stopRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = 0
    }
  }

  async function load() {
    const media = mediaRef.value
    if (!media?.id || media.kind !== 'video') {
      phase.value = 'unavailable'
      return
    }
    if (phase.value === 'ready' || phase.value === 'loading') return

    phase.value = 'loading'

    const result = await photoApi.fetchSprite(media.id)

    if (result?.state === 'ready' && result.sprite) {
      sprite.value = result.sprite
      phase.value = 'ready'
      return
    }

    // 服务端正在后台拼图：这不是失败，过两秒还能捞到
    if (result?.state === 'generating' && retries < MAX_RETRY) {
      retries += 1
      stopRetry()
      retryTimer = setTimeout(load, RETRY_DELAY)
      return
    }

    phase.value = 'unavailable'
  }

  onBeforeUnmount(stopRetry)

  return { sprite, phase, load }
}

/**
 * 由雪碧图算出某一时刻该显示哪一格
 * @returns {null | {index:number, x:number, y:number, width:number, height:number}}
 */
export function spriteFrameAt(target, time) {
  if (!target || !Number.isFinite(time)) return null

  const { cols, rows, count, interval, cellWidth, cellHeight, image } = target
  if (!cols || !cellWidth || !cellHeight || !interval) return null

  const index = Math.min(Math.max(0, count - 1), Math.floor(Math.max(0, time) / interval))
  const col = index % cols
  const row = Math.min(Math.max(0, rows - 1), Math.floor(index / cols))

  return {
    index,
    x: col * cellWidth,
    y: row * cellHeight,
    width: cellWidth,
    height: cellHeight,
    image
  }
}

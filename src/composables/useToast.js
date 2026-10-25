/**
 * 轻量 Toast（全局单例）
 * 用于下载成功 / 失败、复制成功等短反馈。
 */

import { reactive } from 'vue'

let seed = 0

const state = reactive({ items: [] })

function push({ type = 'info', message = '', duration = 2600 }) {
  const id = (seed += 1)
  state.items.push({ id, type, message })

  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
  return id
}

function dismiss(id) {
  const index = state.items.findIndex((item) => item.id === id)
  if (index >= 0) state.items.splice(index, 1)
}

export function useToast() {
  return {
    items: state.items,
    success: (message, duration) => push({ type: 'success', message, duration }),
    error: (message, duration) => push({ type: 'error', message, duration: duration ?? 4000 }),
    info: (message, duration) => push({ type: 'info', message, duration }),
    dismiss
  }
}

export default useToast

/**
 * 剪贴板上传：Ctrl+V 直接把剪贴板里的图片传上去。
 *
 * 之所以绑在**主窗口**而不是"上传按钮里再弹一个子窗口"：
 * 最常见的动作是"截图 → 切到相册 → Ctrl+V"，少一次点击就少一次中断。
 * 代价是要自己排除输入框 —— 在搜索框里粘贴文字时绝不能当成上传，
 * 所以下面第一步就是判断焦点在不在可输入元素上。
 */

import { onBeforeUnmount, onMounted } from 'vue'

/** 这些元素里发生的粘贴是给输入框用的 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTypingTarget(node) {
  if (!node) return false
  // 只关心 isContentEditable 为真的情况。
  // input / textarea 的 isContentEditable 同样是布尔值 false，
  // 若写成"是布尔值就直接返回"，input 会被判成"不可编辑"而漏过，
  // 结果就是在搜索框里粘贴也会触发上传。
  if (node.isContentEditable) return true
  return EDITABLE_TAGS.has(String(node.tagName || '').toUpperCase())
}

/**
 * 这次粘贴是不是"给输入框的"。
 *
 * 两个都查：event.target 通常是焦点元素，但合成事件或某些浏览器下可能不是，
 * 而 activeElement 才是"用户此刻正在往哪儿输入"的可靠依据。
 * 只要有一个落在可输入元素上，就认为这次粘贴不属于上传。
 */
function belongsToInput(event) {
  return isTypingTarget(event?.target) || isTypingTarget(document.activeElement)
}

/** 剪贴板里的文件通常叫 image.png，重命名为可读的中文名 */
function renameClipboardFile(file, fallbackExt) {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`
  const ext = (fallbackExt || 'png').replace('jpeg', 'jpg')
  const name = `粘贴图片-${stamp}.${ext}`

  try {
    return new File([file], name, { type: file.type, lastModified: now.getTime() })
  } catch {
    // 极老环境不支持 File 构造器时退回原始文件，只是名字难看些
    return file
  }
}

function extensionOf(mimeType) {
  const raw = String(mimeType || '')
  const ext = raw.split('/')[1] || ''
  return ext.split(';')[0] || ''
}

/**
 * @param {{onFiles: (files: File[]) => void, enabled?: import('vue').Ref<boolean>}} options
 */
export function usePasteUpload({ onFiles, enabled } = {}) {
  function handlePaste(event) {
    if (enabled && enabled.value === false) return
    // 焦点在输入框里：这次粘贴属于输入框，不是我们的
    if (belongsToInput(event)) return

    const items = event.clipboardData?.items
    if (!items || !items.length) return

    const files = []
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue
      const type = String(item.type || '')
      // 只收图片与视频，剪贴板里的文本 / HTML 一律不理
      if (!type.startsWith('image/') && !type.startsWith('video/')) continue

      const file = item.getAsFile?.()
      if (!file) continue

      files.push(renameClipboardFile(file, extensionOf(type)))
    }

    if (!files.length) return

    // 确实收到了图片，才拦截默认行为（否则会破坏正常的文本粘贴）
    event.preventDefault()
    onFiles(files)
  }

  onMounted(() => {
    document.addEventListener('paste', handlePaste)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('paste', handlePaste)
  })

  return { handlePaste }
}

export default usePasteUpload

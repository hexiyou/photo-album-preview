/**
 * 确认 / 输入弹窗的状态机
 * ---------------------------------------------------------------------------
 * 把弹窗调用写成 await 形式，业务代码读起来就是顺序流程：
 *
 *   const ok = await confirm({ title: '删除文件', tone: 'danger' })
 *   if (!ok) return
 *
 * 组件侧只需要渲染一次 <PromptDialog v-bind="dialogProps" … />，
 * 用哪个组件调 confirm / prompt 都会复用同一个弹窗实例。
 */
import { computed, ref } from 'vue'

const EMPTY = {
  title: '',
  message: '',
  withInput: false,
  label: '',
  value: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消',
  tone: 'default',
  loading: false,
  validate: null
}

export function useDialog() {
  const open = ref(false)
  const options = ref({ ...EMPTY })
  let resolver = null

  function settle(result) {
    open.value = false
    if (resolver) {
      resolver(result)
      resolver = null
    }
  }

  /** @returns {Promise<boolean>} */
  function confirm(overrides = {}) {
    options.value = { ...EMPTY, ...overrides, withInput: false }
    open.value = true
    return new Promise((resolve) => {
      resolver = resolve
    })
  }

  /** @returns {Promise<string|null>} */
  function prompt(overrides = {}) {
    options.value = { ...EMPTY, ...overrides, withInput: true }
    open.value = true
    return new Promise((resolve) => {
      resolver = resolve
    })
  }

  function onConfirm(text) {
    settle(options.value.withInput ? String(text ?? '') : true)
  }

  function onCancel() {
    settle(options.value.withInput ? null : false)
  }

  const dialogProps = computed(() => options.value)

  return { open, dialogProps, confirm, prompt, onConfirm, onCancel }
}

export default useDialog

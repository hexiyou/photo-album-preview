<script setup>
/**
 * 通用确认 / 输入弹窗
 * ---------------------------------------------------------------------------
 * 一个组件覆盖两种形态：
 *   · withInput=false → 纯确认（删除前的二次确认）
 *   · withInput=true  → 带输入框（重命名要填新文件名）
 *
 * 之所以不直接用 window.confirm / window.prompt：
 * 原生弹窗无法跟随主题、不可定制按钮文案，而且在删除这类高危操作上
 * 文案提示太弱。统一走这个组件，暗色模式下也能看清。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  /** 是否显示输入框 */
  withInput: { type: Boolean, default: false },
  label: { type: String, default: '' },
  value: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  /** 输入框的校验函数，返回错误文案或空串 */
  validate: { type: Function, default: null },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  /** default | danger：danger 时确认按钮为红色 */
  tone: { type: String, default: 'default' },
  /** 确认中的加载态（按钮置灰 + 文案由调用方给） */
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel', 'update:open'])

const draft = ref('')
const error = ref('')
const inputEl = ref(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      document.removeEventListener('keydown', onDocumentKeydown, true)
      return
    }

    // 捕获阶段抢先处理 Esc：否则会穿透到查看器，把整个大图也一起关掉
    document.addEventListener('keydown', onDocumentKeydown, true)

    draft.value = props.value ?? ''
    error.value = ''
    await nextTick()
    if (props.withInput) {
      inputEl.value?.focus()
      // 选中主文件名部分：改的是名字，扩展名要留着
      const node = inputEl.value
      if (node && typeof node.setSelectionRange === 'function') {
        const dot = draft.value.lastIndexOf('.')
        node.setSelectionRange(0, dot > 0 ? dot : draft.value.length)
      }
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown, true)
})

function close() {
  emit('update:open', false)
  emit('cancel')
}

function submit() {
  if (props.loading) return

  if (props.withInput) {
    const text = String(draft.value || '').trim()
    const message = typeof props.validate === 'function' ? props.validate(text) || '' : ''
    if (message) {
      error.value = message
      inputEl.value?.focus()
      return
    }
    if (!text) {
      error.value = '不能为空'
      return
    }
    emit('confirm', text)
    return
  }

  emit('confirm', '')
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog" role="dialog" aria-modal="true" @click.self="close">
        <div class="dialog__panel">
          <h3 class="dialog__title">{{ title }}</h3>
          <p v-if="message" class="dialog__message">{{ message }}</p>

          <label v-if="withInput" class="dialog__field">
            <span>{{ label }}</span>
            <input
              ref="inputEl"
              v-model="draft"
              class="dialog__input"
              :class="{ 'is-error': error }"
              type="text"
              :placeholder="placeholder"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="submit"
            />
            <span v-if="error" class="dialog__error">{{ error }}</span>
          </label>

          <div class="dialog__actions">
            <button type="button" class="btn btn--sm btn--ghost" :disabled="loading" @click="close">
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="btn btn--sm"
              :class="tone === 'danger' ? 'btn--danger' : 'btn--primary'"
              :disabled="loading"
              @click="submit"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--scrim);
  backdrop-filter: blur(2px);
}

.dialog__panel {
  width: 100%;
  max-width: 420px;
  padding: 22px 24px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.dialog__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.dialog__message {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-line;
}

.dialog__field {
  display: block;
  margin-bottom: 14px;
}

.dialog__field > span {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.dialog__input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  outline: none;
}

.dialog__input:focus {
  border-color: var(--brand);
  background: var(--surface);
}

.dialog__input.is-error {
  border-color: var(--danger);
}

.dialog__error {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--danger);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.18s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .dialog__panel {
  transition: transform 0.18s ease;
}

.dialog-enter-from .dialog__panel,
.dialog-leave-to .dialog__panel {
  transform: translateY(8px) scale(0.98);
}
</style>

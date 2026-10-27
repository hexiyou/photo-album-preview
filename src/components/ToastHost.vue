<script setup>
/** 全局轻提示 */
import AppIcon from './AppIcon.vue'
import { useToast } from '@/composables/useToast'

const { items, dismiss } = useToast()

const ICONS = {
  success: 'check',
  error: 'alert',
  info: 'info'
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toasts">
      <div v-for="item in items" :key="item.id" class="toast" :class="`toast--${item.type}`">
        <AppIcon :name="ICONS[item.type] || 'info'" :size="15" />
        <span class="toast__text">{{ item.message }}</span>
        <button type="button" class="toast__close" @click="dismiss(item.id)">
          <AppIcon name="close" :size="13" />
        </button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  max-width: 380px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  pointer-events: auto;
}

.toast--success {
  border-color: rgba(31, 157, 99, 0.35);
  color: var(--success);
}

.toast--error {
  border-color: rgba(220, 59, 70, 0.35);
  color: var(--danger);
}

.toast--info {
  color: var(--text-secondary);
}

.toast__text {
  flex: 1;
  min-width: 0;
  color: var(--text);
  word-break: break-word;
}

.toast__close {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
}

.toast__close:hover {
  background: var(--bg-subtle);
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>

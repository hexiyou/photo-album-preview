<script setup>
/**
 * 明 / 暗主题切换
 * 偏好写入 localStorage（见 composables/useTheme.js），刷新后自动恢复；
 * 未手动选择过时跟随系统偏好。
 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useTheme } from '@/composables/useTheme'

const { theme, preference, isDark, toggleTheme } = useTheme()

const title = computed(() => (isDark.value ? '切换到亮色主题' : '切换到暗色主题'))
const hint = computed(() => (preference.value === 'system' ? '（当前跟随系统）' : ''))
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="`${title}${hint}`"
    :aria-label="title"
    @click="toggleTheme()"
  >
    <Transition name="theme-icon" mode="out-in">
      <AppIcon :key="theme" :name="isDark ? 'sun' : 'moon'" :size="17" />
    </Transition>
    <span class="theme-toggle__text">{{ isDark ? '暗色' : '亮色' }}</span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12.5px;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.theme-toggle:hover {
  background: var(--brand-soft);
  border-color: var(--brand);
  color: var(--brand);
}

.theme-toggle__text {
  line-height: 1;
}

/* 图标切换时的小旋转，让"换肤"有反馈 */
.theme-icon-enter-active,
.theme-icon-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.theme-icon-enter-from {
  opacity: 0;
  transform: rotate(-45deg) scale(0.8);
}

.theme-icon-leave-to {
  opacity: 0;
  transform: rotate(45deg) scale(0.8);
}

@media (max-width: 620px) {
  .theme-toggle__text {
    display: none;
  }

  .theme-toggle {
    padding: 0;
    width: 30px;
    justify-content: center;
  }
}
</style>

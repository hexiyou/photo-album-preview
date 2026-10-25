<script setup>
/**
 * 状态占位组件：加载骨架 / 空结果 / 错误
 */
import AppIcon from './AppIcon.vue'

const props = defineProps({
  type: { type: String, default: 'empty' }, // empty | error | offline
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: { type: String, default: 'image' },
  actionText: { type: String, default: '' }
})

const emit = defineEmits(['action'])
</script>

<template>
  <div class="state">
    <div class="state__icon" :class="`state__icon--${type}`">
      <AppIcon :name="icon" :size="26" :stroke-width="1.5" />
    </div>
    <h3 class="state__title">{{ title }}</h3>
    <p v-if="description" class="state__desc">{{ description }}</p>
    <button v-if="actionText" type="button" class="btn" @click="emit('action')">
      {{ actionText }}
    </button>
    <slot />
  </div>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 72px 24px;
  text-align: center;
}

.state__icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-subtle);
  color: var(--text-muted);
  margin-bottom: 4px;
}

.state__icon--error {
  background: rgba(220, 59, 70, 0.1);
  color: var(--danger);
}

.state__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.state__desc {
  max-width: 420px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>

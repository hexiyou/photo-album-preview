<script setup>
/** 分页控件 */
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
  totalPages: { type: Number, required: true }
})

const emit = defineEmits(['change'])

const rangeText = computed(() => {
  if (!props.total) return '0 条'
  const start = (props.page - 1) * props.pageSize + 1
  const end = Math.min(props.page * props.pageSize, props.total)
  return `${start}-${end} / 共 ${props.total} 条`
})

/** 生成中间页码（最多 7 个），两端固定 */
const pages = computed(() => {
  const total = props.totalPages
  const current = props.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const result = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)

  if (left > 2) result.push('…')
  for (let i = left; i <= right; i += 1) result.push(i)
  if (right < total - 1) result.push('…')

  result.push(total)
  return result
})

const go = (page) => {
  if (page === '…' || page === props.page) return
  emit('change', page)
}
</script>

<template>
  <div class="pager">
    <span class="pager__range">{{ rangeText }}</span>

    <div class="pager__pages">
      <button type="button" class="btn btn--icon btn--sm" :disabled="page <= 1" title="上一页" @click="go(page - 1)">
        <AppIcon name="chevronLeft" :size="16" />
      </button>

      <template v-for="(item, index) in pages" :key="`${item}-${index}`">
        <span v-if="item === '…'" class="pager__ellipsis">…</span>
        <button
          v-else
          type="button"
          class="btn btn--sm pager__num"
          :class="{ 'is-active': item === page }"
          @click="go(item)"
        >
          {{ item }}
        </button>
      </template>

      <button type="button" class="btn btn--icon btn--sm" :disabled="page >= totalPages" title="下一页" @click="go(page + 1)">
        <AppIcon name="chevronRight" :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 4px 4px;
}

.pager__range {
  color: var(--text-muted);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.pager__pages {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pager__num {
  min-width: 32px;
  padding: 0 8px;
  font-variant-numeric: tabular-nums;
}

.pager__num.is-active {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--text-inverse);
}

.pager__ellipsis {
  padding: 0 2px;
  color: var(--text-muted);
}
</style>

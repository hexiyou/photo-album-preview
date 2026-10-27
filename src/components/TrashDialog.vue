<script setup>
/**
 * 回收站
 * ---------------------------------------------------------------------------
 * 删除默认只是把文件搬到回收站，所以这里给出"找回"的入口：
 * 列出被删的文件、它们原来在哪，选中后一键还原回去。
 *
 * 只调契约里的两个接口（API.md §5.15）：GET /trash 与 POST /trash/restore。
 * 后端不实现时 listTrash 返回 null，工具栏连入口都不会显示。
 */
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { photoApi } from '@/api/photoApi'
import { useToast } from '@/composables/useToast'

const props = defineProps({
  open: { type: Boolean, default: false }
})

const emit = defineEmits(['update:open', 'restored'])

const toast = useToast()
const items = ref([])
const trashDir = ref('')
const loading = ref(false)
const restoring = ref(false)
const selected = ref([])

watch(
  () => props.open,
  (open) => {
    if (open) load()
    else selected.value = []
  }
)

async function load() {
  loading.value = true
  try {
    const data = await photoApi.listTrash()
    items.value = data?.list ?? []
    trashDir.value = data?.dir || ''
  } catch (error) {
    toast.error(`读取回收站失败：${error?.message || '未知错误'}`)
    items.value = []
  } finally {
    loading.value = false
  }
}

const restorableItems = ref([])
watch(items, (list) => {
  restorableItems.value = list.filter((item) => item.restorable)
})

function toggle(item) {
  if (!item.restorable) return
  const index = selected.value.indexOf(item.id)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push(item.id)
}

function toggleAll() {
  selected.value = selected.value.length === restorableItems.value.length ? [] : restorableItems.value.map((item) => item.id)
}

async function restore() {
  if (!selected.value.length || restoring.value) return
  restoring.value = true
  try {
    const result = await photoApi.restoreFromTrash(selected.value)
    const count = Number(result?.restored ?? 0)
    if (count) {
      toast.success(count > 1 ? `已还原 ${count} 个文件` : '已还原')
      emit('restored')
    }
    ;(result?.failed ?? []).forEach((item) => toast.error(`${item.message || '还原失败'}`))
    selected.value = []
    await load()
  } catch (error) {
    toast.error(`还原失败：${error?.message || '未知错误'}`)
  } finally {
    restoring.value = false
  }
}

function formatSize(bytes) {
  const value = Number(bytes || 0)
  if (!value) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(text) {
  if (!text) return '—'
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString('zh-CN', { hour12: false })
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="trash" role="dialog" aria-modal="true" @click.self="close">
        <div class="trash__panel">
          <header class="trash__head">
            <h3 class="trash__title">回收站</h3>
            <button type="button" class="btn btn--icon" title="关闭" @click="close">
              <AppIcon name="close" :size="16" />
            </button>
          </header>

          <p class="trash__hint">
            删除的文件先放在这里，还原会送回原来的目录。<br />
            <span v-if="trashDir" class="trash__dir">{{ trashDir }}</span>
          </p>

          <div v-if="loading" class="trash__state">加载中…</div>

          <div v-else-if="!items.length" class="trash__state">回收站是空的</div>

          <template v-else>
            <div class="trash__body">
              <div v-for="item in items" :key="item.id" class="trash__item" :class="{ 'is-disabled': !item.restorable }">
                <label class="trash__check">
                  <input
                    type="checkbox"
                    :checked="selected.includes(item.id)"
                    :disabled="!item.restorable"
                    @change="toggle(item)"
                  />
                </label>

                <div class="trash__info">
                  <div class="trash__name" :title="item.fileName">{{ item.fileName }}</div>
                  <div class="trash__meta">
                    <span>{{ formatSize(item.size) }}</span>
                    <span>·</span>
                    <span>删除于 {{ formatTime(item.trashedAt) }}</span>
                  </div>
                  <div class="trash__path" :title="item.originalPath || '未知'">
                    原位置：{{ item.originalPath || '（无记录）' }}
                  </div>
                  <div v-if="!item.restorable" class="trash__reason">
                    <AppIcon name="alert" :size="13" />
                    {{ item.reason || '无法自动还原' }}
                  </div>
                </div>
              </div>
            </div>

            <footer class="trash__foot">
              <label v-if="restorableItems.length" class="trash__all">
                <input
                  type="checkbox"
                  :checked="selected.length === restorableItems.length && restorableItems.length > 0"
                  @change="toggleAll"
                />
                全选可还原（{{ restorableItems.length }}）
              </label>

              <div class="trash__actions">
                <button type="button" class="btn btn--sm btn--ghost" @click="close">关闭</button>
                <button
                  type="button"
                  class="btn btn--sm btn--primary"
                  :disabled="!selected.length || restoring"
                  @click="restore"
                >
                  {{ restoring ? '还原中…' : selected.length > 1 ? `还原 ${selected.length} 个` : '还原' }}
                </button>
              </div>
            </footer>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.trash {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--scrim);
  backdrop-filter: blur(2px);
}

.trash__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 620px;
  max-height: 78vh;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.trash__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 8px;
}

.trash__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.trash__hint {
  margin: 0 18px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.trash__dir {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}

.trash__state {
  padding: 36px 18px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.trash__body {
  flex: 1;
  overflow-y: auto;
  padding: 0 18px 8px;
}

.trash__item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
}

.trash__item.is-disabled {
  opacity: 0.6;
}

.trash__check {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.trash__info {
  min-width: 0;
  flex: 1;
}

.trash__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash__meta {
  display: flex;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}

.trash__path {
  margin-top: 4px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash__reason {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--warning);
}

.trash__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}

.trash__all {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.trash__actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.18s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>

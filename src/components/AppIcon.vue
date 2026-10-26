<script setup>
/**
 * 统一图标组件
 * 所有图标为 24×24 线性风格（stroke），通过 name 引用，避免各处散落 SVG。
 */
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
  strokeWidth: { type: [Number, String], default: 1.8 }
})

const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M12 4v11"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  rotateLeft: '<path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5 8.5 8.5 0 0 0-6.3 2.8L3 8.5"/><path d="M3 4v4.5h4.5"/>',
  rotateRight: '<path d="M20.5 12a8.5 8.5 0 1 1-8.5-8.5 8.5 8.5 0 0 1 6.3 2.8L21 8.5"/><path d="M21 4v4.5h-4.5"/>',
  flipH: '<path d="M12 4v16"/><path d="M10 6.5 3.5 12l6.5 5.5z"/><path d="M14 6.5 20.5 12 14 17.5z"/>',
  flipV: '<path d="M4 12h16"/><path d="M6.5 10 12 3.5 17.5 10z"/><path d="M6.5 14 12 20.5 17.5 14z"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/><path d="M11 8.5v5"/><path d="M8.5 11h5"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/><path d="M8.5 11h5"/>',
  fit: '<path d="M8 3H5.5A2.5 2.5 0 0 0 3 5.5V8"/><path d="M21 8V5.5A2.5 2.5 0 0 0 18.5 3H16"/><path d="M16 21h2.5a2.5 2.5 0 0 0 2.5-2.5V16"/><path d="M3 16v2.5A2.5 2.5 0 0 0 5.5 21H8"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/><path d="M3 12a9 9 0 1 0 2.6 6.4"/><path d="M8 20v-5H3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 16.5v-5"/><path d="M12 8h.01"/>',
  image: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 16.5-4.5-4.5L4.5 21"/>',
  alert: '<path d="m21 18.5-8-13.5a1.8 1.8 0 0 0-3 0l-8 13.5A1.8 1.8 0 0 0 3.7 21h16.6a1.8 1.8 0 0 0 1.7-2.5Z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>',
  check: '<path d="m20 6.5-11 11-5-5"/>',
  film: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><path d="M7.5 3.5v17"/><path d="M16.5 3.5v17"/><path d="M3 12h18"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-7.6a2 2 0 0 1-1.6-.9L9.2 3.6A1.8 1.8 0 0 0 7.6 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  tag: '<path d="M20.6 13.4 12.5 21.5a1.6 1.6 0 0 1-2.3 0L2.9 14.2a1.6 1.6 0 0 1 0-2.3L11 3.8a1.6 1.6 0 0 1 1.1-.5h7.3a1.6 1.6 0 0 1 1.6 1.6v7.3a1.6 1.6 0 0 1-.4 1.2Z"/><circle cx="8" cy="8" r="1.4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.4"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10.5h17"/>',
  camera: '<path d="M4 8.5h2.8L8.6 6h6.8l1.8 2.5H20a1.6 1.6 0 0 1 1.6 1.6v8.4A1.6 1.6 0 0 1 20 20.5H4a1.6 1.6 0 0 1-1.6-1.6v-8.4A1.6 1.6 0 0 1 4 8.5Z"/><circle cx="12" cy="13.5" r="3.4"/>',
  edit: '<path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z"/>',
  trash: '<path d="M3.5 6h17"/><path d="M8.5 6V4.5A1.5 1.5 0 0 1 10 3h4a1.5 1.5 0 0 1 1.5 1.5V6"/><path d="M18.5 6v14a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  pin: '<path d="M12 21.5s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10.5" r="2.6"/>',
  sortAsc: '<path d="M7 9.5 4 6l-3 3.5"/><path d="M4 6v14"/><path d="M11 6h10"/><path d="M11 12h7"/><path d="M11 18h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="m5.2 5.2 1.4 1.4"/><path d="m17.4 17.4 1.4 1.4"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="m5.2 18.8 1.4-1.4"/><path d="m17.4 6.6 1.4-1.4"/>',
  moon: '<path d="M20.8 13.2A8.5 8.5 0 1 1 10.8 3.2a7 7 0 0 0 10 10Z"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="12.5" rx="2.2"/><path d="M8.5 20.5h7"/><path d="M12 16.5v4"/>',
  spinner: '<circle cx="12" cy="12" r="8.5" opacity="0.25"/><path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5"/>'
}

const path = computed(() => PATHS[props.name] || PATHS.image)
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="path"
  />
</template>

<style scoped>
.app-icon {
  display: block;
  flex: none;
}

:deep(circle),
:deep(path),
:deep(rect) {
  vector-effect: non-scaling-stroke;
}
</style>

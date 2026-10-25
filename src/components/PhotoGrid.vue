<script setup>
/**
 * 缩略图网格视图
 * 自适应列宽（220 ~ 1fr），宽屏自动扩展到 6 列以上。
 */
import PhotoCard from './PhotoCard.vue'
import { usePhotoStore } from '@/stores/usePhotoStore'

const { state, openViewer, toggleSelect } = usePhotoStore()

defineProps({
  photos: { type: Array, required: true }
})
</script>

<template>
  <div class="grid">
    <PhotoCard
      v-for="(photo, index) in photos"
      :key="photo.id"
      :photo="photo"
      :index="index"
      :selected="state.selectedIds.includes(photo.id)"
      @open="openViewer"
      @toggle-select="toggleSelect"
    />
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(216px, 1fr));
  gap: 16px;
  padding: 18px 24px 8px;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
    padding: 14px 14px 4px;
  }
}
</style>

<template>
  <div class="content-wrapper content-page">
    <SavedPlans @view-plan="$emit('view-plan')" />
  </div>
</template>

<script setup>
import SavedPlans from '../components/SavedPlans.vue';

defineEmits(['view-plan']);
</script>

<style scoped>
.content-wrapper {
  padding: 24px;
  height: calc(100vh - var(--header-height));
  overflow-y: auto;
}

.content-page {
  max-width: 1400px;
  margin: 0 auto;
}
</style>

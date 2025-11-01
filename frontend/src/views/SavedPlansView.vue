<template>
  <div class="saved-plans-view full-width">
    <div class="saved-plans-background">
      <div class="saved-plans-content">
        <SavedPlans @view-plan="$emit('view-plan')" />
      </div>
    </div>
  </div>
</template>

<script setup>
import SavedPlans from '../components/SavedPlans.vue';

defineEmits(['view-plan']);
</script>

<style scoped>
.saved-plans-view {
  width: 100%;
  min-height: calc(100vh - var(--header-height));
}

.saved-plans-background {
  width: 100%;
  min-height: calc(100vh - var(--header-height));
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.03) 0%, rgba(168, 237, 234, 0.05) 100%);
  padding: 24px 0;
}

.saved-plans-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
}

@media (max-width: 768px) {
  .saved-plans-content {
    padding: 0 16px;
  }
}
</style>

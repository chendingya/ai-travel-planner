<template>
  <div class="content-wrapper content-page">
    <Home @start-plan="$emit('start-plan')" />
  </div>
</template>

<script setup>
import Home from '../components/Home.vue';

defineEmits(['start-plan']);
</script>

<style scoped>
.content-wrapper {
  padding: 0;
  min-height: calc(100vh - var(--header-height));
  overflow-y: auto;
}

.content-page {
  width: 100%;
}
</style>

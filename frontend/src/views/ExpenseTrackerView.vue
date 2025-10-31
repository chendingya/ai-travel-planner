<template>
  <div class="content-wrapper content-page">
    <ExpenseTracker />
  </div>
</template>

<script setup>
import ExpenseTracker from '../components/ExpenseTracker.vue';
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

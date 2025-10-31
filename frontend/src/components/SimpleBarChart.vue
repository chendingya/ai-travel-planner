<template>
  <div class="simple-bar-chart">
    <div class="bars">
      <div v-for="(d, i) in data" :key="i" class="bar-item">
        <div class="bar" :style="{ height: (max>0 ? d.value/max*100 : 0) + '%' }"></div>
        <div class="label">{{ d.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, toRefs } from 'vue'
const props = defineProps({
  data: { type: Array, default: () => [] }
})
const { data } = toRefs(props)
const max = computed(() => Math.max(0, ...data.value.map(d => d.value || 0)))
</script>

<style scoped>
.simple-bar-chart .bars {
  display: flex;
  gap: 12px;
  align-items: end;
  height: 160px;
}
.bar-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.bar {
  width: 36px;
  background: linear-gradient(180deg,#1890ff,#096dd9);
  border-radius: 4px 4px 0 0;
  transition: height .3s ease;
}
.label {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}
</style>

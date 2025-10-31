<template>
  <div class="simple-pie-chart">
    <div v-if="!validData || validData.length === 0 || total === 0" class="empty-state">
      <p style="color: #999; text-align: center; padding: 40px;">暂无预算数据</p>
    </div>
    <div v-else class="chart-content">
      <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="pie-svg">
        <g :transform="`translate(${size/2}, ${size/2})`">
          <path
            v-for="(segment, i) in segments"
            :key="i"
            :d="segment.path"
            :fill="colors[i % colors.length]"
            stroke="#fff"
            stroke-width="2"
            class="pie-segment"
          >
            <title>{{ segment.name }}: ¥{{ segment.value }} ({{ segment.percentage }}%)</title>
          </path>
        </g>
      </svg>
      <div class="legend">
        <div 
          v-for="(item, i) in validData" 
          :key="i" 
          class="legend-item"
        >
          <span class="legend-color" :style="{ backgroundColor: colors[i % colors.length] }"></span>
          <span class="legend-label">{{ item.name }}</span>
          <span class="legend-value">¥{{ item.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  size: { type: Number, default: 200 }
})

const colors = [
  '#1890ff', // 蓝色 - 交通
  '#52c41a', // 绿色 - 住宿
  '#faad14', // 橙色 - 餐饮
  '#f5222d', // 红色 - 景点
  '#722ed1', // 紫色 - 购物
  '#13c2c2', // 青色 - 其他
]

const validData = computed(() => {
  return props.data.filter(item => item.value > 0)
})

const total = computed(() => {
  return validData.value.reduce((sum, item) => sum + (item.value || 0), 0)
})

const segments = computed(() => {
  if (total.value === 0) return []
  
  let currentAngle = -Math.PI / 2 // 从12点钟方向开始
  const radius = props.size / 2 - 10
  
  return validData.value.map((item, i) => {
    const percentage = ((item.value / total.value) * 100).toFixed(1)
    const angle = (item.value / total.value) * 2 * Math.PI
    const endAngle = currentAngle + angle
    
    // 计算路径
    const x1 = radius * Math.cos(currentAngle)
    const y1 = radius * Math.sin(currentAngle)
    const x2 = radius * Math.cos(endAngle)
    const y2 = radius * Math.sin(endAngle)
    
    const largeArc = angle > Math.PI ? 1 : 0
    
    const path = [
      `M 0 0`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `Z`
    ].join(' ')
    
    currentAngle = endAngle
    
    return {
      path,
      name: item.name,
      value: item.value,
      percentage
    }
  })
})
</script>

<style scoped>
.simple-pie-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 20px 0;
  min-height: 100px;
}

.chart-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;
}

.pie-svg {
  display: block;
}

.pie-segment {
  cursor: pointer;
  transition: opacity 0.3s ease;
}

.pie-segment:hover {
  opacity: 0.8;
}

.legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 400px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-label {
  flex: 1;
  color: var(--text-primary);
}

.legend-value {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>

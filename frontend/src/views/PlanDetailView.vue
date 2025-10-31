<template>
  <div class="content-wrapper">
    <t-row :gutter="24">
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="plan-detail-section">
          <t-card class="plan-detail-card book-left" :bordered="false">
            <PlanDetail 
              @fly-to="handleFlyTo"
              @back-to-planner="$emit('back-to-planner')"
            />
          </t-card>
        </div>
      </t-col>
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="map-section">
          <t-card class="map-card book-right" :bordered="false">
            <MapView :locations="store.locations" ref="mapViewRef" />
          </t-card>
        </div>
      </t-col>
    </t-row>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import PlanDetail from '../components/PlanDetail.vue';
import MapView from '../components/MapView.vue';
import { usePlannerStore } from '../stores/planner';

const store = usePlannerStore();
const mapViewRef = ref(null);

defineEmits(['fly-to', 'back-to-planner']);

// 监听 fly-to 事件并转发给 MapView
const handleFlyTo = (coords) => {
  if (mapViewRef.value) {
    mapViewRef.value.flyTo(coords);
  }
};

// 组件挂载时确保地图初始化
onMounted(() => {
  // 确保地图能正确显示
  if (mapViewRef.value) {
    setTimeout(() => {
      if (mapViewRef.value && mapViewRef.value.map) {
        mapViewRef.value.map.resize();
      }
    }, 100);
  }
});
</script>

<style scoped>
.content-wrapper {
  padding: 24px;
  min-height: calc(100vh - var(--header-height));
  background: transparent;
}

.plan-detail-section, .map-section {
  min-height: 600px;
}

/* 全局 t-card 圆角设置 - 书本翻页效果 */
.plan-detail-section :deep(.t-card),
.map-section :deep(.t-card) {
  border-radius: 24px !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08) !important;
  overflow: visible !important;
}

/* 左页圆角 */
.book-left :deep(.t-card) {
  border-top-right-radius: 8px !important;
  border-bottom-right-radius: 8px !important;
  box-shadow: 
    8px 0 16px rgba(0, 0, 0, 0.08),
    0 4px 24px rgba(0, 0, 0, 0.06) !important;
  position: relative;
}

.book-left :deep(.t-card)::after {
  content: '';
  position: absolute;
  right: 0;
  top: 5%;
  bottom: 5%;
  width: 2px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(102, 126, 234, 0.1) 10%,
    rgba(102, 126, 234, 0.2) 50%,
    rgba(102, 126, 234, 0.1) 90%,
    transparent
  );
  z-index: 1;
  pointer-events: none;
}

/* 右页圆角 */
.book-right :deep(.t-card) {
  border-top-left-radius: 8px !important;
  border-bottom-left-radius: 8px !important;
  box-shadow: 
    -8px 0 16px rgba(0, 0, 0, 0.08),
    0 4px 24px rgba(0, 0, 0, 0.06) !important;
  position: relative;
}

.book-right :deep(.t-card)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5%;
  bottom: 5%;
  width: 2px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(102, 126, 234, 0.1) 10%,
    rgba(102, 126, 234, 0.2) 50%,
    rgba(102, 126, 234, 0.1) 90%,
    transparent
  );
  z-index: 1;
  pointer-events: none;
}

/* 移除 t-card 内部的默认 padding，让组件自己控制 */
.plan-detail-card :deep(.t-card__body) {
  padding: 0 !important;
  overflow: visible !important;
}

/* 地图卡片特殊处理 - 固定高度 */
.map-card :deep(.t-card__body) {
  padding: 0 !important;
  overflow: hidden !important;
  height: calc(100vh - var(--header-height) - 48px);
  min-height: 600px;
}

.map-section :deep(#map-container) {
  height: 100%;
  border-radius: 0;
  overflow: hidden;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .plan-detail-section, .map-section {
    min-height: 400px;
  }

  .book-left :deep(.t-card),
  .book-right :deep(.t-card) {
    border-radius: 20px !important;
    margin-bottom: 24px;
  }

  .book-left :deep(.t-card)::after,
  .book-right :deep(.t-card)::before {
    display: none;
  }

  .map-card :deep(.t-card__body) {
    height: 400px;
    min-height: 400px;
  }
}
</style>

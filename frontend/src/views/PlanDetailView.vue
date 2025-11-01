<template>
  <div class="content-wrapper">
    <!-- 全局路线告警 -->
    <t-alert
      v-if="routeAlert.show"
      theme="warning"
      :message="routeAlert.message"
      close
      @close="routeAlert.show = false"
      style="margin-bottom: 12px;"
    />
    <t-row :gutter="24">
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="plan-detail-section">
          <!-- 移除外层 t-card 包裹，避免左侧头部与内容之间的间隔出现贯穿边界/阴影 -->
          <div class="plan-detail-card">
            <PlanDetail 
              @fly-to="handleFlyTo"
              @back-to-planner="$emit('back-to-planner')"
              @header-offset="onHeaderOffset"
            />
          </div>
        </div>
      </t-col>
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="map-section">
          <div class="map-card-offset" :style="{ marginTop: mapTopOffset + 'px' }">
            <t-card class="map-card book-right" :bordered="false">
              <MapView 
                :locations="store.locations" 
                :destination="store.form.destination"
                :dailyItinerary="store.plan?.daily_itinerary || []"
                ref="mapViewRef"
                @route-failed-places="onRouteFailedPlaces"
              />
            </t-card>
          </div>
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
const mapTopOffset = ref(0);
const routeAlert = ref({ show: false, message: '' });

defineEmits(['fly-to', 'back-to-planner']);

// 监听 fly-to 事件并转发给 MapView
const handleFlyTo = (coords) => {
  if (mapViewRef.value) {
    mapViewRef.value.flyTo(coords);
  }
};

// 接收左侧头部高度，用于右侧地图与 t-collapse 顶部对齐
const onHeaderOffset = (offset) => {
  mapTopOffset.value = offset || 0;
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

  // 进入详情页时，根据存储的计划重建按“天+时间”顺序的地图点
  rebuildLocationsFromPlan();
});

const onRouteFailedPlaces = (list) => {
  if (list && list.length) {
    const sample = list.slice(0, 3).join('、');
    const more = list.length > 3 ? ` 等 ${list.length} 个` : '';
    routeAlert.value = {
      show: true,
      message: `以下地点未能定位：${sample}${more}。已临时从路线排除，请在左侧“编辑行程”中修正地点名称后重试。`
    };
  }
};

// 监听计划变化，自动重建 locations 并同步地图
watch(() => store.plan, () => {
  rebuildLocationsFromPlan();
}, { deep: true });

// 根据存储的计划，按天/时间生成顺序化的 locations
const parseTimeToMinutes = (t) => {
  if (!t || typeof t !== 'string') return Number.POSITIVE_INFINITY;
  const m1 = t.match(/^(\d{1,2}):(\d{2})/);
  if (m1) return parseInt(m1[1]) * 60 + parseInt(m1[2]);
  const m2 = t.match(/^(\d{1,2})[点时](\d{1,2})?分?/);
  if (m2) return parseInt(m2[1]) * 60 + (m2[2] ? parseInt(m2[2]) : 0);
  return Number.POSITIVE_INFINITY;
};

// 去除这里的远程地理编码，统一由 MapView 使用 AMap.Geocoder 进行本地定位

const rebuildLocationsFromPlan = async () => {
  const plan = store.plan;
  const form = store.form || {};
  if (!plan || !plan.daily_itinerary || plan.daily_itinerary.length === 0) return;

  const ordered = [];
  let seq = 1;
  for (const day of plan.daily_itinerary) {
    // 对当天活动按时间排序（无时间的放后面，保持原序）
    const withIndex = (day.activities || []).map((a, idx) => ({ a, idx }));
    withIndex.sort((x, y) => {
      const tx = parseTimeToMinutes(x.a.time);
      const ty = parseTimeToMinutes(y.a.time);
      if (tx === ty) return x.idx - y.idx;
      return tx - ty;
    });

    for (const { a } of withIndex) {
      if (!a || !a.description) continue;
      // 均不直接使用坐标，交由地图组件后期定位
      ordered.push({ name: a.description, coords: null, order: seq++ });
    }
  }

  if (ordered.length > 0) {
    store.setLocations(ordered);
  }
};
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

/* 仅右侧地图卡片保留 t-card 圆角与阴影效果 */
.map-section :deep(.t-card) {
  border-radius: 24px !important;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08) !important;
  overflow: visible !important;
}

/* 删除左侧书页装饰，避免贯穿式边界 */

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

/* 左侧 PlanDetail 容器基础样式（不产生边框与阴影） */
.plan-detail-card {
  padding: 0;
  background: transparent;
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

  .book-right :deep(.t-card) {
    border-radius: 20px !important;
    margin-bottom: 24px;
  }

  .book-right :deep(.t-card)::before {
    display: none;
  }

  .map-card :deep(.t-card__body) {
    height: 400px;
    min-height: 400px;
  }
}
</style>

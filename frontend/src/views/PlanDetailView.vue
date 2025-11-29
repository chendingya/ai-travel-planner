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
    <t-row :gutter="24" class="plan-detail-row">
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="plan-detail-section">
          <!-- 移除外层 t-card 包裹，避免左侧头部与内容之间的间隔出现贯穿边界/阴影 -->
          <div class="plan-detail-card">
            <PlanDetail 
              ref="planDetailRef"
              @fly-to="handleFlyTo"
              @back-to-planner="$emit('back-to-planner')"
              @header-offset="onHeaderOffset"
              @select-day="onSelectDay"
              @edit-mode-change="onEditModeChange"
              @plan-draft-change="onPlanDraftChange"
            />
          </div>
        </div>
      </t-col>
      <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
        <div class="map-section">
          <!-- 灵境·文创工坊卡片 -->
          <div class="actions-card">
            <div class="actions-header">
              <h3 class="actions-title">
                <t-icon name="lightbulb" />
                灵境 · 文创工坊
              </h3>
            </div>
            <div class="actions-buttons">
              <GlassButton 
                icon="sound"
                @click="handleGeneratePlaylist"
                size="sm"
                theme="dark"
              >
                听见·山河
              </GlassButton>
              <GlassButton 
                icon="image"
                @click="handleGenerateQuickNote"
                size="sm"
                theme="dark"
              >
                拾光·绘影
              </GlassButton>
              <GlassButton 
                icon="palette"
                @click="handleGeneratePostcard"
                size="sm"
                theme="dark"
              >
                尺素·锦书
              </GlassButton>
              <GlassButton 
                icon="edit"
                @click="handleGenerateShare"
                size="sm"
                theme="dark"
              >
                妙笔·云章
              </GlassButton>
            </div>
          </div>
          
          <!-- 模态框 -->
          <ShareContentModal 
            :visible="showShareModal"
            :destination="store.form?.destination || ''"
            :duration="store.form?.duration || 1"
            :daily-itinerary="store.plan?.daily_itinerary || []"
            @update:visible="showShareModal = $event"
          />
          <PlaylistModal 
            :visible="showPlaylistModal"
            :destination="store.form?.destination || ''"
            :duration="store.form?.duration || 1"
            :dailyItinerary="store.plan?.daily_itinerary || []"
            @update:visible="showPlaylistModal = $event"
          />

          <div class="map-card-offset" :style="{ marginTop: '16px' }">
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

          <t-card v-if="showAccommodationCard" class="accommodation-card" :bordered="false">
            <h4 class="section-title">
              <t-icon name="home" />
              住宿安排
            </h4>
            <template v-if="isEditing">
              <t-list :split="false">
                <t-list-item
                  v-for="item in dailyHotels"
                  :key="item.index"
                  class="hotel-item hotel-item-edit"
                >
                  <div class="hotel-edit-content">
                    <div class="hotel-edit-header">
                      <span class="hotel-edit-day">第 {{ item.dayNumber }} 天</span>
                      <span v-if="item.theme" class="hotel-edit-theme">· {{ item.theme }}</span>
                    </div>
                    <div class="hotel-edit-grid">
                      <t-input v-model="item.hotel.name" placeholder="酒店名称" size="small" />
                      <t-input v-model="item.hotel.city" placeholder="城市" size="small" />
                      <t-input v-model="item.hotel.district" placeholder="区/县" size="small" />
                      <t-input v-model="item.hotel.address" placeholder="地址" size="small" />
                      <t-input v-model="item.hotel.price_range" placeholder="价格范围 (可选)" size="small" />
                      <t-input v-model="item.hotel.contact" placeholder="联系方式 (可选)" size="small" />
                    </div>
                    <t-textarea
                      v-model="item.hotel.notes"
                      placeholder="备注（例如：靠近景点/交通便利）"
                      :autosize="{ minRows: 2, maxRows: 4 }"
                      size="small"
                      class="hotel-edit-notes"
                    />
                  </div>
                </t-list-item>
              </t-list>
            </template>
            <template v-else>
              <t-list :split="false">
                <t-list-item v-for="(hotel, index) in accommodationSummary" :key="index" class="hotel-item">
                  <div class="hotel-content">
                    <div class="hotel-name">{{ hotel.name || fallbackHotelName }}</div>
                    <div class="hotel-meta" v-if="hotelRangeLabel(hotel)">{{ hotelRangeLabel(hotel) }}</div>
                    <div class="hotel-meta" v-if="hotelMeta(hotel)">{{ hotelMeta(hotel) }}</div>
                    <div class="hotel-notes" v-if="hotel.notes">{{ hotel.notes }}</div>
                  </div>
                </t-list-item>
              </t-list>
            </template>
          </t-card>

          <!-- 旅行提示卡片：移动到地图卡片下方显示 -->
          <t-card v-if="store.plan?.tips && store.plan.tips.length" class="tips-card" :bordered="false">
            <h4 class="section-title">
              <t-icon name="lightbulb" />
              旅行提示
            </h4>
            <t-list :split="false">
              <t-list-item v-for="(tip, index) in store.plan.tips" :key="index">
                <t-icon name="check-circle" class="tip-icon" />
                {{ tip }}
              </t-list-item>
            </t-list>
          </t-card>
        </div>
      </t-col>
    </t-row>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PlanDetail from '../components/PlanDetail.vue';
import MapView from '../components/MapView.vue';
import GlassButton from '../components/GlassButton.vue';
import ShareContentModal from '../components/ShareContentModal.vue';
import PlaylistModal from '../components/PlaylistModal.vue';
import { usePlannerStore } from '../stores/planner';

const store = usePlannerStore();
const route = useRoute();
const router = useRouter();
const planDetailRef = ref(null);
const mapViewRef = ref(null);
const mapTopOffset = ref(0);
const routeAlert = ref({ show: false, message: '' });
const isEditing = ref(false);
const draftPlan = ref(store.plan);
const showShareModal = ref(false);
const showPlaylistModal = ref(false);

const fallbackHotelName = computed(() => {
  const d = (store.form?.destination || '').toString().trim();
  return d ? `${d} 酒店` : '住宿地点';
});

const activePlan = computed(() => draftPlan.value || store.plan);

watch(() => store.plan, (newPlan) => {
  if (!isEditing.value) {
    draftPlan.value = newPlan;
  }
}, { deep: true });

const onPlanDraftChange = (value) => {
  draftPlan.value = value;
};

const onEditModeChange = (value) => {
  isEditing.value = value;
  if (!value) {
    draftPlan.value = store.plan;
  }
};

const ensureHotel = (dayIndex) => {
  const plan = activePlan.value;
  if (!plan || !Array.isArray(plan.daily_itinerary)) return null;
  if (!plan.daily_itinerary[dayIndex]) return null;
  if (!plan.daily_itinerary[dayIndex].hotel || typeof plan.daily_itinerary[dayIndex].hotel !== 'object') {
    plan.daily_itinerary[dayIndex].hotel = {
      name: '',
      city: '',
      district: '',
      address: '',
      notes: '',
      price_range: '',
      contact: '',
      coords: null
    };
  }
  return plan.daily_itinerary[dayIndex].hotel;
};

const dailyHotels = computed(() => {
  const plan = activePlan.value;
  if (!plan || !Array.isArray(plan.daily_itinerary)) return [];

  return plan.daily_itinerary.map((day, idx) => {
    let hotel = day?.hotel && typeof day.hotel === 'object' ? day.hotel : null;
    if (isEditing.value) {
      hotel = ensureHotel(idx);
    }
    return {
      index: idx,
      dayNumber: day?.day || idx + 1,
      theme: day?.theme || '',
      hotel
    };
  });
});

const hasHotelContent = (hotel) => {
  if (!hotel || typeof hotel !== 'object') return false;
  return Boolean(
    hotel.name ||
    hotel.city ||
    hotel.district ||
    hotel.address ||
    hotel.notes ||
    hotel.price_range ||
    hotel.contact
  );
};

const accommodationSummary = computed(() => {
  const plan = activePlan.value;
  if (!plan) return [];
  if (Array.isArray(plan.accommodation) && plan.accommodation.length) {
    return plan.accommodation;
  }
  return dailyHotels.value
    .filter(item => hasHotelContent(item.hotel))
    .map(item => ({
      ...item.hotel,
      days: item.hotel?.days || `D${item.dayNumber}`
    }));
});

const showAccommodationCard = computed(() => {
  return isEditing.value ? dailyHotels.value.length > 0 : accommodationSummary.value.length > 0;
});

const hotelRangeLabel = (hotel) => {
  if (!hotel) return '';
  const range = hotel.days || hotel.day_range || hotel.dayRange || '';
  return range ? `适用：${range}` : '';
};

const hotelMeta = (hotel) => {
  if (!hotel) return '';
  const location = [hotel.city, hotel.district].filter(Boolean).join(' · ');
  const address = hotel.address || '';
  const extras = [hotel.price_range, hotel.contact].filter(Boolean).join(' | ');
  return [location, address, extras].filter(Boolean).join(' | ');
};

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

// 来自左侧：用户切换折叠的“第N天”，地图切换到对应天数
const onSelectDay = (day) => {
  if (mapViewRef.value && typeof mapViewRef.value.switchDay === 'function') {
    mapViewRef.value.switchDay(day);
  }
};

// 监听计划变化，自动重建 locations 并同步地图
watch(() => store.plan, () => {
  rebuildLocationsFromPlan();
}, { deep: true });

// 处理编辑按钮点击
const handleToggleEdit = () => {
  if (planDetailRef.value) {
    planDetailRef.value.toggleEdit();
  }
};



// 处理生成AI速记卡片
const handleGenerateQuickNote = () => {
  // 跳转到速记卡片页面
  router.push({ name: 'QuickNote' });
};

// 处理生成旅游明信片
const handleGeneratePostcard = () => {
  // 跳转到电子手账页面
  router.push({ name: 'Handbook' });
};

// 处理生成 BGM 歌单
const handleGeneratePlaylist = () => {
  router.push({ name: 'Playlist' });
};

// 处理生成分享文案
const handleGenerateShare = () => {
  router.push({ name: 'ShareContent' });
};

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
      if (!a) continue;
      const name = a.location || a.description || a.originalDescription;
      if (!name) continue;
      const geocodeQuery = [a.location, a.district, a.city, a.address]
        .filter(Boolean)
        .join(' ');
      // 均不直接使用坐标，交由地图组件后期定位
      ordered.push({
        name,
        coords: a.coords || null,
        order: seq++,
        geocodeQuery: geocodeQuery || name
      });
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

.plan-detail-row {
  align-items: stretch;
}

.map-section {
  position: sticky;
  top: 24px;
  height: fit-content;
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

/* 操作卡片样式 */
.actions-card {
  background: linear-gradient(135deg, var(--td-brand-color-8) 0%, var(--td-brand-color-6) 30%, var(--td-brand-color-4) 70%, var(--td-brand-color-2) 100%);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: none;
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 128px; /* 最小高度 */
  padding: 24px;
  box-sizing: border-box;
}

.actions-card:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

.actions-header {
  margin-bottom: 20px; /* 与左侧卡片标题和按钮间距一致 (title margin-bottom 8px + actions margin-top 12px) */
}

.actions-title {
  font-size: 28px;
  font-weight: 600;
  color: white;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.actions-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin: 4px 0 0 0;
  font-style: italic;
  letter-spacing: 2px;
}

.actions-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  flex-wrap: wrap;
}

/* 地图卡片特殊处理 - 固定高度 */
.map-card :deep(.t-card__body) {
  padding: 0 !important;
  overflow: hidden !important;
  height: calc(100vh - var(--header-height) - 48px - 120px);
  min-height: 500px;
}

.map-section :deep(#map-container) {
  height: 100%;
  border-radius: 0;
  overflow: hidden;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 旅行提示卡片放在地图卡片下方，间距与全局卡片一致 */
.accommodation-card {
  margin-top: 16px;
}

.accommodation-card :deep(.t-list) {
  background: transparent;
}

.accommodation-card :deep(.t-list-item) {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  border-radius: 12px;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.accommodation-card :deep(.hotel-item-edit) {
  flex-direction: column;
}

.accommodation-card :deep(.t-list-item:last-child) {
  margin-bottom: 0;
}

.hotel-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hotel-edit-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.hotel-edit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.hotel-edit-day {
  font-size: 15px;
}

.hotel-edit-theme {
  font-size: 14px;
  color: var(--text-secondary);
}

.hotel-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.hotel-edit-notes {
  margin-top: 4px;
}

.hotel-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.hotel-meta {
  font-size: 13px;
  color: var(--text-secondary);
}

.hotel-notes {
  font-size: 13px;
  color: var(--text-primary);
}

.tips-card {
  margin-top: 16px;
}

.tips-card :deep(.t-list) {
  background: transparent;
}

.tips-card :deep(.t-list-item) {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  border-radius: 12px;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tips-card :deep(.t-list-item:last-child) {
  margin-bottom: 0;
}

.tip-icon {
  color: #faad14;
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
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

<template>
  <div id="app">
    <!-- 顶部导航栏 - 知乎风格 -->
    <t-header class="app-header">
      <div class="header-container">
        <div class="header-left">
          <h1 class="logo">
            <span class="logo-icon">✈️</span>
            AI 旅行规划师
          </h1>
        </div>
        
        <div class="header-menu">
          <t-menu 
            mode="horizontal" 
            :value="view"
            @change="handleMenuChange"
            theme="light"
          >
            <t-menu-item value="planner">
              <template #icon>
                <t-icon name="compass" />
              </template>
              智能规划
            </t-menu-item>
            <t-menu-item value="saved">
              <template #icon>
                <t-icon name="bookmark" />
              </template>
              我的计划
            </t-menu-item>
            <t-menu-item value="expense">
              <template #icon>
                <t-icon name="chart-bar" />
              </template>
              费用统计
            </t-menu-item>
          </t-menu>
        </div>

        <div class="header-right">
          <Auth />
        </div>
      </div>
    </t-header>

    <!-- 主内容区 -->
    <div class="app-container">
      <transition name="fade" mode="out-in">
        <!-- 规划页面 - 只显示表单 -->
        <div v-if="view === 'planner'" class="content-wrapper content-page" key="planner">
          <div class="planner-page">
            <Planner 
              @locations-updated="updateLocations" 
              @fly-to="flyTo"
              @plan-generated="handlePlanGenerated" 
            />
          </div>
        </div>

        <!-- 方案详情页 -->
        <div v-else-if="view === 'plan-detail'" class="content-wrapper" key="plan-detail">
          <t-row :gutter="24">
            <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
              <div class="plan-detail-section">
                <PlanDetail 
                  @fly-to="flyTo"
                  @back-to-planner="handleBackToPlanner"
                />
              </div>
            </t-col>
            <t-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
              <div class="map-section">
                <MapView :locations="store.locations" ref="mapView" />
              </div>
            </t-col>
          </t-row>
        </div>

        <!-- 已保存计划 -->
        <div v-else-if="view === 'saved'" class="content-wrapper content-page" key="saved">
          <SavedPlans @view-plan="handleViewSavedPlan" />
        </div>

        <!-- 费用统计 -->
        <div v-else-if="view === 'expense'" class="content-wrapper content-page" key="expense">
          <ExpenseTracker />
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Auth from './components/Auth.vue';
import Planner from './components/Planner.vue';
import PlanDetail from './components/PlanDetail.vue';
import MapView from './components/MapView.vue';
import SavedPlans from './components/SavedPlans.vue';
import ExpenseTracker from './components/ExpenseTracker.vue';
import { usePlannerStore } from './stores/planner';

const view = ref('planner');
const mapView = ref(null);
const store = usePlannerStore();
store.initFromStorage();

const handleMenuChange = (value) => {
  view.value = value;
};

const updateLocations = (newLocations) => {
  store.setLocations(newLocations)
};

const flyTo = (coords) => {
  if (mapView.value) {
    mapView.value.flyTo(coords);
  }
};

const handlePlanGenerated = () => {
  // 方案生成成功后，跳转到方案详情页
  view.value = 'plan-detail';
};

const handleBackToPlanner = () => {
  // 返回规划页面
  view.value = 'planner';
};

const handleViewSavedPlan = () => {
  // 从已保存计划查看详情，跳转到方案详情页
  view.value = 'plan-detail';
};
</script>

<style scoped>
#app {
  min-height: 100vh;
  background-color: var(--bg-color);
  display: flex;
  flex-direction: column;
}

.app-header {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: #ffffff;
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  z-index: 1000;
  padding: 0 24px;
  flex-shrink: 0;
}

.header-container {
  max-width: 1440px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  flex-shrink: 0;
}

.logo {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.logo-icon {
  font-size: 24px;
}

.header-menu {
  flex: 1;
  margin: 0 40px;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.header-menu :deep(.t-default-menu) {
  height: 100% !important;
  width: 100% !important;
  max-width: 100% !important;
  background: transparent !important;
  border: none !important;
  flex: 1;
}

.header-menu :deep(.t-default-menu__inner) {
  height: 100% !important;
  border-bottom: none !important;
  display: flex !important;
  align-items: stretch !important;
}

.header-menu :deep(.t-menu) {
  border-bottom: none !important;
  background: transparent !important;
  height: 100% !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: stretch !important;
  padding: 0 !important;
  margin: 0 !important;
}

.header-menu :deep(.t-menu--scroll) {
  overflow: visible !important;
  width: 100% !important;
  display: flex !important;
  align-items: stretch !important;
}

.header-menu :deep(.t-menu__operations) {
  display: none !important;
}

.header-menu :deep(.t-menu__item) {
  font-size: 15px;
  padding: 0 24px !important;
  height: 100% !important;
  min-height: var(--header-height) !important;
  max-height: var(--header-height) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-bottom: 3px solid transparent !important;
  transition: all 0.3s ease;
  white-space: nowrap;
  gap: 8px !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.header-menu :deep(.t-menu__item .t-icon) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 18px;
  margin: 0 !important;
  flex-shrink: 0;
}

.header-menu :deep(.t-menu__item:hover) {
  color: #0084ff !important;
  background: rgba(0, 132, 255, 0.04) !important;
  border-bottom-color: rgba(0, 132, 255, 0.3) !important;
}

.header-menu :deep(.t-menu__item.t-is-active) {
  color: #0084ff !important;
  border-bottom-color: #0084ff !important;
  background: transparent !important;
  font-weight: 500;
  position: relative;
}

.header-menu :deep(.t-menu__item.t-is-active::after) {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, #0084ff 20%, #0084ff 80%, transparent) !important;
  z-index: 10;
}

.header-menu :deep(.t-menu__content) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1.5 !important;
  vertical-align: middle;
  margin: 0 !important;
  padding: 0 !important;
}

.header-right {
  flex-shrink: 0;
}

.app-container {
  padding: 24px;
  max-width: 1440px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
  flex: 1;
}

.content-wrapper {
  animation: fadeIn 0.3s ease-in-out;
  height: 100%;
}

.content-wrapper :deep(.t-row) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  margin-left: -12px !important;
  margin-right: -12px !important;
}

.content-wrapper :deep(.t-col) {
  padding-left: 12px !important;
  padding-right: 12px !important;
}

/* 中等及以上屏幕：每列占50% */
@media (min-width: 992px) {
  .content-wrapper :deep(.t-col-6) {
    flex: 0 0 50% !important;
    max-width: 50% !important;
  }
}

/* 小屏幕：每列占100% */
@media (max-width: 991px) {
  .content-wrapper :deep(.t-col) {
    flex: 0 0 100% !important;
    max-width: 100% !important;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.planner-section,
.map-section,
.plan-detail-section {
  min-height: calc(100vh - var(--header-height) - 48px);
  background: var(--card-bg);
  border-radius: 0;
  box-shadow: none;
  overflow-y: auto;
  border: 1px solid var(--border-color);
}

.planner-section,
.plan-detail-section {
  padding: 32px;
}

.map-section {
  position: sticky;
  top: calc(var(--header-height) + 24px);
  height: calc(100vh - var(--header-height) - 48px);
}

.content-page {
  background: var(--card-bg);
  border-radius: 0;
  box-shadow: none;
  border: 1px solid var(--border-color);
  min-height: auto;
}

.planner-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 48px 32px;
  min-height: calc(100vh - var(--header-height) - 48px);
}

@media (max-width: 768px) {
  .planner-page {
    padding: 24px 16px;
  }
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .app-container {
    padding: 16px;
  }
  
  .header-menu {
    margin: 0 20px;
  }
}

@media (max-width: 768px) {
  .app-header {
    padding: 0 16px;
  }
  
  .header-container {
    flex-wrap: wrap;
  }
  
  .header-menu {
    order: 3;
    width: 100%;
    margin: 0;
  }
  
  .header-menu :deep(.t-menu__item) {
    font-size: 13px;
    padding: 0 12px;
  }
  
  .logo {
    font-size: 16px;
  }
  
  .logo-icon {
    font-size: 20px;
  }
  
  .planner-section,
  .map-section {
    height: auto;
    min-height: 400px;
    margin-bottom: 16px;
  }
  
  .map-section {
    position: relative;
    top: 0;
  }
}
</style>
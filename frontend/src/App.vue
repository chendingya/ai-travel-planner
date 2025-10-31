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
            :value="currentRoute"
            theme="light"
          >
            <t-menu-item value="/" @click="handleNavigate('/')">
              <template #icon>
                <t-icon name="home" />
              </template>
              首页
            </t-menu-item>
            <t-menu-item value="/planner" @click="handleNavigate('/planner')">
              <template #icon>
                <t-icon name="compass" />
              </template>
              智能规划
            </t-menu-item>
            <t-menu-item value="/saved" @click="handleNavigate('/saved')">
              <template #icon>
                <t-icon name="bookmark" />
              </template>
              我的计划
            </t-menu-item>
            <t-menu-item value="/expense" @click="handleNavigate('/expense')">
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
        <router-view
          :class="{ 'no-padding': currentRoute === '/' }"
          @locations-updated="updateLocations"
          @fly-to="flyTo"
          @plan-generated="handlePlanGenerated"
          @back-to-planner="handleBackToPlanner"
          @view-plan="handleViewSavedPlan"
          @start-plan="handleStartPlan"
        />
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import Auth from './components/Auth.vue';
import MapView from './components/MapView.vue';
import { usePlannerStore } from './stores/planner';

const router = useRouter();
const route = useRoute();
const mapView = ref(null);
const store = usePlannerStore();
store.initFromStorage();

const currentRoute = computed(() => route.path);

const handleNavigate = (path) => {
  router.push(path);
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
  router.push('/plan-detail');
};

const handleBackToPlanner = () => {
  // 返回规划页面
  router.push('/planner');
};

const handleViewSavedPlan = () => {
  // 从已保存计划查看详情，跳转到方案详情页
  router.push('/plan-detail');
};

const handleStartPlan = () => {
  // 从首页点击"开始规划"，跳转到智能规划页面
  router.push('/planner');
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
  width: 100%;
  flex: 1;
}

.app-container > * {
  padding: 24px;
  max-width: 1440px;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}

.app-container .no-padding {
  padding: 0 !important;
  max-width: 100% !important;
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

.intro-section {
  background: var(--card-bg);
  border-radius: 0;
  box-shadow: none;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.intro-container {
  padding: 32px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.intro-header {
  text-align: center;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
}

.intro-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.intro-icon {
  font-size: 28px;
}

.intro-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
}

.intro-block {
  background: linear-gradient(135deg, #f6f9ff 0%, #ffffff 100%);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e3e8f7;
  flex: 1;
}

.tips-block {
  background: linear-gradient(135deg, #fffbf0 0%, #ffffff 100%);
  border-color: #ffe7ba;
}

.block-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-title .t-icon {
  color: #0084ff;
  font-size: 18px;
}

.block-content {
  color: var(--text-secondary);
  line-height: 1.8;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.step-item-simple {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
}

.step-item-simple:hover {
  background: #f0f5ff;
  transform: translateX(4px);
}

.step-num {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #0084ff, #00b8ff);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.tips-simple {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip-item-simple {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: white;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.6;
  transition: all 0.2s;
}

.tip-item-simple:hover {
  background: #fffbf0;
  transform: translateX(4px);
}

.tip-check {
  color: #52c41a;
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .app-container > * {
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
  .map-section,
  .intro-section {
    height: auto;
    min-height: 400px;
    margin-bottom: 16px;
  }
  
  .map-section,
  .intro-section {
    position: relative;
    top: 0;
  }
  
  .intro-container {
    padding: 24px 16px;
  }
  
  .intro-title {
    font-size: 20px;
  }
}
</style>
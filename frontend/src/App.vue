<template>
  <div id="app">
    <!-- 顶部导航栏 - 知乎风格 -->
    <t-header class="app-header">
      <div class="header-container">
        <div class="header-left">
          <h1 class="logo">
            <span class="logo-icon">✈️</span>
            拾光绘旅
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
          </t-menu>
        </div>

        <div class="header-right">
          <Auth />
        </div>
      </div>
    </t-header>

    <!-- 主内容区 -->
    <div class="app-container">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component
            :is="Component"
            :class="{ 'no-padding': currentRoute === '/' }"
            @locations-updated="updateLocations"
            @fly-to="flyTo"
            @plan-generated="handlePlanGenerated"
            @back-to-planner="handleBackToPlanner"
            @view-plan="handleViewSavedPlan"
            @start-plan="handleStartPlan"
          />
        </transition>
      </router-view>
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
  // 方案生成成功后，跳转到方案详情页，标记来源为planner
  router.push({ path: '/plan-detail', query: { from: 'planner' } });
};

const handleBackToPlanner = () => {
  // 返回规划页面
  router.push('/planner');
};

const handleViewSavedPlan = () => {
  // 从已保存计划查看详情，跳转到方案详情页，标记来源为saved
  router.push({ path: '/plan-detail', query: { from: 'saved' } });
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
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border-bottom: 1px solid var(--glass-border);
  box-shadow: none;
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
  align-items: center;
  justify-content: center;
}

.header-menu :deep(.t-default-menu) {
  height: auto !important;
  width: auto !important;
  max-width: 100% !important;
  background: transparent !important;
  border: none !important;
}

.header-menu :deep(.t-default-menu__inner) {
  height: auto !important;
  border-bottom: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
}

.header-menu :deep(.t-menu) {
  border-bottom: none !important;
  background: transparent !important;
  height: auto !important;
  width: auto !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  padding: 0 !important;
  margin: 0 !important;
  gap: 8px !important;
}

.header-menu :deep(.t-menu--scroll) {
  overflow: visible !important;
  width: auto !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

.header-menu :deep(.t-menu__operations) {
  display: none !important;
}

.header-menu :deep(.t-menu__item) {
  font-size: 15px;
  padding: 0 20px !important;
  height: 44px !important;
  min-height: 44px !important;
  max-height: 44px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border: none !important;
  border-radius: 50px !important;
  margin: 0 4px !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  gap: 8px !important;
  box-sizing: border-box !important;
  background: transparent !important;
  color: var(--text-primary) !important;
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
  background: rgba(0, 132, 255, 0.08) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
}

.header-menu :deep(.t-menu__item.t-is-active) {
  color: #0084ff !important;
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border: none !important;
  box-shadow: none !important;
  font-weight: 600;
  position: relative;
}

.header-menu :deep(.t-menu__item.t-is-active::after) {
  display: none;
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

.app-container .full-width {
  max-width: 100% !important;
  padding: 0 !important;
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
  background: transparent;
  border-radius: 0;
  border: none;
  box-shadow: none;
  overflow-y: auto;
  padding: 0;
}

.planner-section,
.plan-detail-section {
  transition: none;
}

.planner-section:hover,
.plan-detail-section:hover {
  box-shadow: none;
}

.map-section {
  position: sticky;
  top: calc(var(--header-height) + 24px);
  height: calc(100vh - var(--header-height) - 48px);
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.03) 0%, rgba(168, 237, 234, 0.05) 100%);
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  padding: 32px;
}

.content-page {
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.03) 0%, rgba(168, 237, 234, 0.05) 100%);
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  min-height: auto;
  padding: 32px;
}

.intro-section {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
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
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid rgba(227, 232, 247, 0.5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  flex: 1;
}

.tips-block {
  background: rgba(255, 251, 240, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(255, 231, 186, 0.5);
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
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
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
  padding: 12px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
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
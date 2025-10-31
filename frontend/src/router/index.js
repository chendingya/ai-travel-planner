import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import PlannerView from '../views/PlannerView.vue';
import PlanDetailView from '../views/PlanDetailView.vue';
import SavedPlansView from '../views/SavedPlansView.vue';
import ExpenseTrackerView from '../views/ExpenseTrackerView.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    meta: { title: '首页 - AI 旅行规划师' }
  },
  {
    path: '/planner',
    name: 'Planner',
    component: PlannerView,
    meta: { title: '智能规划 - AI 旅行规划师' }
  },
  {
    path: '/plan-detail',
    name: 'PlanDetail',
    component: PlanDetailView,
    meta: { title: '方案详情 - AI 旅行规划师' }
  },
  {
    path: '/saved',
    name: 'SavedPlans',
    component: SavedPlansView,
    meta: { title: '我的计划 - AI 旅行规划师' }
  },
  {
    path: '/expense',
    name: 'ExpenseTracker',
    component: ExpenseTrackerView,
    meta: { title: '费用统计 - AI 旅行规划师' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  }
});

// 设置页面标题
router.afterEach((to) => {
  document.title = to.meta.title || 'AI 旅行规划师';
});

export default router;

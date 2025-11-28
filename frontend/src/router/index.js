import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import PlannerView from '../views/PlannerView.vue';
import PlanDetailView from '../views/PlanDetailView.vue';
import SavedPlansView from '../views/SavedPlansView.vue';
import QuickNoteView from '../views/QuickNoteView.vue';
import HandbookView from '../views/HandbookView.vue';
import PlaylistView from '../views/PlaylistView.vue';
import ShareContentView from '../views/ShareContentView.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    meta: { title: '首页 - 拾光绘旅' }
  },
  {
    path: '/planner',
    name: 'Planner',
    component: PlannerView,
    meta: { title: '智能规划 - 拾光绘旅' }
  },
  {
    path: '/plan-detail',
    name: 'PlanDetail',
    component: PlanDetailView,
    meta: { title: '方案详情 - 拾光绘旅' }
  },
  {
    path: '/saved',
    name: 'SavedPlans',
    component: SavedPlansView,
    meta: { title: '我的计划 - 拾光绘旅' }
  },
  {
    path: '/quick-note',
    name: 'QuickNote',
    component: QuickNoteView,
    meta: { title: 'AI速记卡片 - 拾光绘旅' }
  },
  {
    path: '/postcard',
    name: 'Handbook',
    component: HandbookView,
    meta: { title: '尺素锦书 - 拾光绘旅' }
  },
  {
    path: '/playlist',
    name: 'Playlist',
    component: PlaylistView,
    meta: { title: '听见山河 - 拾光绘旅' }
  },
  {
    path: '/share-content',
    name: 'ShareContent',
    component: ShareContentView,
    meta: { title: '妙笔云章 - 拾光绘旅' }
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
  document.title = to.meta.title || '拾光绘旅';
});

export default router;

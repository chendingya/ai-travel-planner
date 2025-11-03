<template>
  <div class="saved-plans-container">
    <div class="page-header">
      <h2 class="page-title">
        <t-icon name="bookmark" size="24px" />
        我的旅行计划
      </h2>
      <t-button theme="primary" @click="fetchPlans" :loading="loading">
        <t-icon name="refresh" />
        刷新
      </t-button>
    </div>

    <div v-if="loading" class="loading-container">
      <t-loading size="large" text="加载中..." />
    </div>

    <t-empty v-else-if="!plans.length" description="暂无保存的计划">
      <template #image>
        <t-icon name="inbox" size="80px" style="color: var(--text-secondary)" />
      </template>
    </t-empty>

    <t-row v-else :gutter="16" class="plans-grid">
      <t-col
        v-for="plan in plans"
        :key="plan.id"
        :xs="12"
        :sm="6"
        :md="4"
        :lg="4"
        :xl="3"
      >
        <t-card
          :title="plan.destination"
          :bordered="true"
          hover-shadow
          class="plan-card"
          @click="viewPlan(plan)"
        >
          <template #actions>
            <t-button
              variant="text"
              theme="danger"
              @click.stop="confirmDelete(plan.id)"
            >
              <t-icon name="delete" />
              删除
            </t-button>
          </template>

          <div class="plan-info">
            <div class="info-item">
              <t-icon name="time" />
              <span>{{ plan.duration }} 天</span>
            </div>
            <div class="info-item">
              <t-icon name="money-circle" />
              <span>¥ {{ plan.budget.toLocaleString() }}</span>
            </div>
            <div class="info-item">
              <t-icon name="user" />
              <span>{{ plan.travelers }} 人</span>
            </div>
          </div>

          <div class="plan-preferences">
            <t-tag v-if="plan.preferences" theme="primary" variant="light" size="small">
              {{ plan.preferences.slice(0, 20) }}{{ plan.preferences.length > 20 ? '...' : '' }}
            </t-tag>
            <t-tag v-else theme="default" variant="light" size="small" class="placeholder-tag">
              无特殊偏好
            </t-tag>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <!-- 删除确认对话框 -->
    <t-dialog
      v-model:visible="showDeleteDialog"
      header="确认删除"
      :on-confirm="handleDelete"
      :on-cancel="() => showDeleteDialog = false"
    >
      <p>确定要删除这个旅行计划吗？此操作无法撤销。</p>
    </t-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';
import { usePlannerStore } from '../stores/planner';

const emit = defineEmits(['view-plan']);
const store = usePlannerStore();

const plans = ref([]);
const loading = ref(false);
const showDeleteDialog = ref(false);
const planToDelete = ref(null);

const fetchPlans = async () => {
  loading.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      MessagePlugin.warning('请先登录以查看保存的计划');
      plans.value = [];
      return;
    }

    const { data, error } = await supabase
      .from('plans')
      .select('id, user_id, destination, duration, budget, travelers, preferences, plan_details, created_at, updated_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    plans.value = data || [];
  } catch (error) {
    console.error('Error fetching plans:', error);
    MessagePlugin.error('获取计划列表失败');
  } finally {
    loading.value = false;
  }
};

const viewPlan = async (plan) => {
  // 为避免使用到旧缓存，进入详情前按 ID 强制拉取最新记录
  try {
    loading.value = true;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      MessagePlugin.warning('请先登录');
      return;
    }

    const { data: fresh, error } = await supabase
      .from('plans')
      .select('id, user_id, destination, duration, budget, travelers, preferences, plan_details, updated_at')
      .eq('id', plan.id)
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      console.warn('获取计划最新数据失败，使用本地列表项作为兜底', error);
    }

    const p = fresh || plan;

    // 将计划数据加载到 store，并保存计划 ID
    store.setForm({
      destination: p.destination,
      duration: p.duration,
      budget: p.budget,
      travelers: p.travelers,
      preferences: p.preferences || ''
    });

    // 解析计划详情（兼容字符串/JSONB）
    let planDetails = p.plan_details || {};
    if (typeof planDetails === 'string') {
      try { planDetails = JSON.parse(planDetails); } catch { planDetails = {}; }
    }
    store.setPlan(planDetails);

    // 如果有地图坐标信息，也加载到 store（仅已有坐标，地图组件会自行定位缺失点）
    if (planDetails.daily_itinerary) {
      const mapLocations = [];
      for (const day of planDetails.daily_itinerary) {
        if (day.activities) {
          for (const activity of day.activities) {
            if (!activity || !activity.coords) continue;
            const displayName = activity.location || activity.description || activity.originalDescription;
            const geocodeQuery = [activity.location, activity.district, activity.city, activity.address]
              .filter(Boolean)
              .join(' ');
            mapLocations.push({
              name: displayName,
              coords: activity.coords,
              order: mapLocations.length + 1,
              geocodeQuery: geocodeQuery || displayName
            });
          }
        }
      }
      store.setLocations(mapLocations);
    }

    // 将计划 ID 存储到 localStorage，供 PlanDetail 组件读取
    try {
      localStorage.setItem('current_plan_id', p.id);
    } catch (e) {
      console.warn('无法保存计划 ID 到 localStorage', e);
    }

    // 发射事件通知 App.vue 切换到方案详情页
    emit('view-plan');
  } finally {
    loading.value = false;
  }
};

const confirmDelete = (id) => {
  planToDelete.value = id;
  showDeleteDialog.value = true;
};

const handleDelete = async () => {
  try {
    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', planToDelete.value);

    if (error) throw error;

    plans.value = plans.value.filter((plan) => plan.id !== planToDelete.value);
    MessagePlugin.success('计划已删除');
    showDeleteDialog.value = false;
    planToDelete.value = null;
  } catch (error) {
    console.error('Error deleting plan:', error);
    MessagePlugin.error('删除计划失败');
  }
};

onMounted(fetchPlans);
</script>

<style scoped>
.saved-plans-container {
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding: 24px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-header:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.plans-grid {
  margin-top: 16px;
}

.plans-grid :deep(.t-col) {
  margin-bottom: 16px;
}

.plan-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.plan-card :deep(.t-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.plan-card:hover {
  transform: translateY(-6px) scale(1.02);
  box-shadow: var(--glass-shadow-hover);
  border-color: rgba(0, 132, 255, 0.4);
}

.plan-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  flex: 1;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.plan-preferences {
  margin-top: auto;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.placeholder-tag {
  opacity: 0.6;
}

/* 强制按钮对齐 - 本地兜底方案 */
.page-header :deep(.t-button__text),
.t-card__actions :deep(.t-button__text) {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  line-height: 1 !important;
}

.page-header :deep(.t-icon),
.t-card__actions :deep(.t-icon) {
  display: inline-flex !important;
  align-items: center !important;
  margin: 0 !important;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .page-title {
    font-size: 20px;
  }
}
</style>
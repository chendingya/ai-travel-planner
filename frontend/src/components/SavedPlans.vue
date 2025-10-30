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
        >
          <template #actions>
            <t-button
              variant="text"
              theme="default"
              @click="viewPlan(plan)"
            >
              <t-icon name="view" />
            </t-button>
            <t-button
              variant="text"
              theme="danger"
              @click="confirmDelete(plan.id)"
            >
              <t-icon name="delete" />
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

          <div v-if="plan.preferences" class="plan-preferences">
            <t-tag theme="primary" variant="light" size="small">
              {{ plan.preferences.slice(0, 20) }}{{ plan.preferences.length > 20 ? '...' : '' }}
            </t-tag>
          </div>
        </t-card>
      </t-col>
    </t-row>

    <!-- 查看计划详情对话框 -->
    <t-dialog
      v-model:visible="showDetailDialog"
      :header="`${selectedPlan?.destination} - 旅行计划`"
      width="800px"
      :footer="false"
    >
      <div v-if="selectedPlan" class="plan-detail">
        <div class="detail-header">
          <t-space>
            <t-tag theme="primary">{{ selectedPlan.duration }} 天</t-tag>
            <t-tag theme="success">¥ {{ selectedPlan.budget.toLocaleString() }}</t-tag>
            <t-tag theme="warning">{{ selectedPlan.travelers }} 人</t-tag>
          </t-space>
        </div>

        <t-divider />

        <div v-if="selectedPlan.preferences" class="detail-section">
          <h4>偏好需求</h4>
          <p>{{ selectedPlan.preferences }}</p>
        </div>

        <div v-if="selectedPlan.plan_details" class="detail-section">
          <h4>行程详情</h4>
          <t-collapse :default-value="['0']">
            <t-collapse-panel
              v-for="(day, index) in selectedPlan.plan_details.daily_itinerary"
              :key="index"
              :value="String(index)"
              :header="`第 ${index + 1} 天：${day.theme || '精彩行程'}`"
            >
              <t-timeline>
                <t-timeline-item
                  v-for="(activity, i) in day.activities"
                  :key="i"
                  :label="activity.time"
                >
                  {{ activity.description }}
                </t-timeline-item>
              </t-timeline>
            </t-collapse-panel>
          </t-collapse>
        </div>

        <ExpenseTracker :plan-id="selectedPlan.id" />
      </div>
    </t-dialog>

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
import ExpenseTracker from './ExpenseTracker.vue';

const plans = ref([]);
const loading = ref(false);
const selectedPlan = ref(null);
const showDetailDialog = ref(false);
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
      .select('*')
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

const viewPlan = (plan) => {
  selectedPlan.value = plan;
  showDetailDialog.value = true;
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
  padding: 32px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
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

.plan-card {
  height: 100%;
  transition: all 0.3s ease;
}

.plan-card:hover {
  transform: translateY(-4px);
}

.plan-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.plan-preferences {
  margin-top: 12px;
}

.plan-detail {
  padding: 16px 0;
}

.detail-header {
  margin-bottom: 16px;
}

.detail-section {
  margin: 24px 0;
}

.detail-section h4 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.detail-section p {
  color: var(--text-secondary);
  line-height: 1.6;
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
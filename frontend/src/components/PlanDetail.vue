<template>
  <div class="plan-detail-container">
    <div class="plan-detail-header">
      <div>
        <h2 class="plan-detail-title">
          <t-icon name="check-circle" />
          您的专属旅行方案
        </h2>
        <p class="plan-detail-subtitle">点击活动可在地图上定位</p>
      </div>
      <t-space>
        <t-button 
          theme="default" 
          variant="outline"
          @click="handleBackToPlanner"
        >
          <t-icon name="arrow-left" />
          重新规划
        </t-button>
        <t-button 
          theme="success" 
          variant="outline"
          @click="savePlan"
          :loading="saving"
        >
          <t-icon name="save" />
          保存方案
        </t-button>
      </t-space>
    </div>

    <div v-if="!plan" class="empty-state">
      <t-empty description="暂无方案数据">
        <template #image>
          <t-icon name="file" size="80px" style="color: var(--text-secondary)" />
        </template>
      </t-empty>
    </div>

    <div v-else class="plan-content">
      <!-- 日程安排 -->
      <t-collapse :default-value="['0']" class="plan-collapse">
        <t-collapse-panel 
          v-for="(day, index) in plan.daily_itinerary" 
          :key="index"
          :value="String(index)"
          :header="`第 ${index + 1} 天：${day.theme || '精彩行程'}`"
        >
          <t-timeline class="day-timeline">
            <t-timeline-item 
              v-for="(activity, i) in day.activities" 
              :key="i"
              :label="activity.time"
            >
              <div class="activity-item" @click="flyToLocation(activity.coords)">
                <div class="activity-content">{{ activity.description }}</div>
              </div>
            </t-timeline-item>
          </t-timeline>
        </t-collapse-panel>
      </t-collapse>

      <!-- 预算分解 -->
      <div v-if="plan.budget_breakdown" class="budget-section">
        <h4 class="section-title">
          <t-icon name="money-circle" />
          预算分解
        </h4>
        <div class="budget-grid-wrapper">
          <div v-if="plan.budget_breakdown.transportation" class="budget-col">
            <div class="budget-item">
              <div class="budget-icon">🚗</div>
              <div class="budget-label">交通</div>
              <div class="budget-value">¥{{ plan.budget_breakdown.transportation }}</div>
            </div>
          </div>
          <div v-if="plan.budget_breakdown.accommodation" class="budget-col">
            <div class="budget-item">
              <div class="budget-icon">🏨</div>
              <div class="budget-label">住宿</div>
              <div class="budget-value">¥{{ plan.budget_breakdown.accommodation }}</div>
            </div>
          </div>
          <div v-if="plan.budget_breakdown.meals" class="budget-col">
            <div class="budget-item">
              <div class="budget-icon">🍴</div>
              <div class="budget-label">餐饮</div>
              <div class="budget-value">¥{{ plan.budget_breakdown.meals }}</div>
            </div>
          </div>
          <div v-if="plan.budget_breakdown.attractions" class="budget-col">
            <div class="budget-item">
              <div class="budget-icon">🎭</div>
              <div class="budget-label">景点</div>
              <div class="budget-value">¥{{ plan.budget_breakdown.attractions }}</div>
            </div>
          </div>
          <div v-if="plan.budget_breakdown.shopping" class="budget-col">
            <div class="budget-item">
              <div class="budget-icon">🛍️</div>
              <div class="budget-label">购物</div>
              <div class="budget-value">¥{{ plan.budget_breakdown.shopping }}</div>
            </div>
          </div>
          <div v-if="plan.budget_breakdown.other" class="budget-col">
            <div class="budget-item">
              <div class="budget-icon">💡</div>
              <div class="budget-label">其他</div>
              <div class="budget-value">¥{{ plan.budget_breakdown.other }}</div>
            </div>
          </div>
        </div>
        <div class="budget-total">
          <span>总计</span>
          <span class="total-value">¥{{ calculateTotal(plan.budget_breakdown) }}</span>
        </div>
        <!-- 图表区域 -->
        <div class="budget-charts">
          <t-card title="预算分布图" style="margin-bottom: 16px;">
            <SimplePieChart :data="[
                { name: '交通', value: plan.budget_breakdown.transportation || 0 },
                { name: '住宿', value: plan.budget_breakdown.accommodation || 0 },
                { name: '餐饮', value: plan.budget_breakdown.meals || 0 },
                { name: '景点', value: plan.budget_breakdown.attractions || 0 },
                { name: '购物', value: plan.budget_breakdown.shopping || 0 },
                { name: '其他', value: plan.budget_breakdown.other || 0 }
              ]" />
          </t-card>
        </div>
      </div>

      <!-- 旅行提示 -->
      <div v-if="plan.tips && plan.tips.length > 0" class="tips-section">
        <h4 class="section-title">
          <t-icon name="lightbulb" />
          旅行提示
        </h4>
        <t-list :split="false">
          <t-list-item v-for="(tip, index) in plan.tips" :key="index">
            <t-icon name="check-circle" class="tip-icon" />
            {{ tip }}
          </t-list-item>
        </t-list>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';
import { usePlannerStore } from '../stores/planner';
import SimplePieChart from './SimplePieChart.vue';

const emit = defineEmits(['fly-to', 'back-to-planner']);
const store = usePlannerStore();

const plan = ref(null);
const saving = ref(false);
const form = ref({});

onMounted(() => {
  // 从store加载方案和表单数据
  plan.value = store.plan;
  form.value = store.form;
});

const flyToLocation = (coords) => {
  if (coords) {
    emit('fly-to', coords);
  }
};

const handleBackToPlanner = () => {
  emit('back-to-planner');
};

const calculateTotal = (budget) => {
  if (!budget) return 0;
  return Object.values(budget).reduce((sum, value) => sum + (value || 0), 0);
};

const savePlan = async () => {
  saving.value = true;
  try {
    // 获取用户信息
    let user = null;
    try {
      const userRes = await supabase.auth.getUser();
      if (userRes && userRes.data && userRes.data.user) user = userRes.data.user;
    } catch (e) {
      // ignore
    }
    if (!user) {
      try {
        const sess = await supabase.auth.getSession();
        if (sess && sess.data && sess.data.session && sess.data.session.user) user = sess.data.session.user;
      } catch (e) {
        // ignore
      }
    }

    if (!user) {
      MessagePlugin.warning('请先登录以保存您的方案');
      saving.value = false;
      return;
    }

    // 插入数据到 plans 表
    const payload = {
      user_id: user.id,
      destination: form.value.destination,
      duration: form.value.duration,
      budget: form.value.budget,
      travelers: form.value.travelers,
      preferences: form.value.preferences,
      plan_details: plan.value,
    };

    const { data: insertData, error } = await supabase.from('plans').insert([payload]);
    if (error) {
      console.error('Supabase insert error:', error);
      MessagePlugin.error(error.message || '保存方案失败，请确认您已登录');
      saving.value = false;
      return;
    }

    MessagePlugin.success('方案保存成功！');
  } catch (error) {
    console.error('Error saving plan:', error);
    MessagePlugin.error(error.message || '保存方案失败，请确认您已登录');
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.plan-detail-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.plan-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
}

.plan-detail-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.plan-detail-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.plan-content {
  flex: 1;
}

.plan-collapse {
  background: transparent;
  margin-bottom: 24px;
}

.day-timeline {
  padding: 12px 0;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
  position: relative;
}

.activity-item:hover {
  background-color: #f6f9ff;
  transform: translateX(4px);
}

.activity-item:hover::before {
  content: "📍";
  position: absolute;
  left: -4px;
  opacity: 0.6;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.activity-content {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

/* 预算分解 */
.budget-section {
  margin-top: 24px;
  padding: 20px;
  background: linear-gradient(135deg, #f6f9ff 0%, #f0f5ff 100%);
  border-radius: 8px;
  border: 1px solid #d6e4ff;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.budget-grid-wrapper {
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important;
  gap: 12px;
  margin-bottom: 16px;
  width: 100%;
}

.budget-col {
  width: 100%;
  min-width: 0;
}

.budget-item {
  background: white;
  padding: 16px;
  border-radius: 6px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
  height: 100%;
}

.budget-item:hover {
  box-shadow: 0 4px 12px rgba(0, 132, 255, 0.15);
  transform: translateY(-2px);
}

.budget-icon {
  font-size: 32px;
  margin-bottom: 8px;
  line-height: 1;
}

.budget-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.budget-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.budget-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: white;
  border-radius: 6px;
  font-weight: 600;
  font-size: 16px;
  box-shadow: 0 2px 8px rgba(0, 132, 255, 0.1);
}

.total-value {
  font-size: 24px;
  color: #0084ff;
}

.budget-charts {
  margin-top: 24px;
}

/* 旅行提示 */
.tips-section {
  margin-top: 24px;
  padding: 20px;
  background: linear-gradient(135deg, #fffbf0 0%, #fff7e6 100%);
  border-radius: 8px;
  border: 1px solid #ffe7ba;
}

.tips-section :deep(.t-list) {
  background: transparent;
}

.tips-section :deep(.t-list-item) {
  padding: 12px;
  background: white;
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.tips-section :deep(.t-list-item:last-child) {
  margin-bottom: 0;
}

.tip-icon {
  color: #faad14;
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

@media (max-width: 768px) {
  .plan-detail-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  
  .plan-detail-title {
    font-size: 20px;
  }
  
  .budget-grid-wrapper {
    grid-template-columns: 1fr !important;
  }
}
</style>

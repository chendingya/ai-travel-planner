<template>
  <div class="plan-detail-container">
    <div class="plan-detail-header" ref="headerRef">
      <div>
        <h2 class="plan-detail-title">
          <t-icon name="check-circle" />
          您的专属旅行方案
        </h2>
        <p class="plan-detail-subtitle">点击活动可在地图上定位</p>
      </div>
      <div class="header-actions">
        <GlassButton 
          v-if="showSaveButton"
          icon="save"
          @click="handleSavePlan"
          :loading="saving"
          size="sm"
        >
          保存计划
        </GlassButton>
        <GlassButton 
          icon="arrow-left"
          @click="handleBackToPlanner"
          size="sm"
        >
          重新规划
        </GlassButton>
      </div>
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
import { ref, onMounted, computed, nextTick, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { usePlannerStore } from '../stores/planner';
import { supabase } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';
import SimplePieChart from './SimplePieChart.vue';
import GlassButton from './GlassButton.vue';

const emit = defineEmits(['fly-to', 'back-to-planner', 'header-offset']);
const route = useRoute();
const store = usePlannerStore();

const plan = ref(null);
const form = ref({});
const saving = ref(false);
const headerRef = ref(null);

// 根据路由来源判断是否显示保存按钮
const showSaveButton = computed(() => {
  return route.query.from === 'planner';
});

onMounted(() => {
  // 从store加载方案和表单数据
  plan.value = store.plan;
  form.value = store.form;

  // 计算并上报头部高度用于右侧地图对齐
  const reportHeaderOffset = () => {
    if (!headerRef.value) return;
    const el = headerRef.value;
    const styles = window.getComputedStyle(el);
    const mb = parseFloat(styles.marginBottom || '0');
    const offset = el.offsetHeight + mb;
    emit('header-offset', offset);
  };

  nextTick(() => {
    reportHeaderOffset();
  });

  window.addEventListener('resize', reportHeaderOffset);

  // 清理监听
  onBeforeUnmount(() => {
    window.removeEventListener('resize', reportHeaderOffset);
  });
});

const flyToLocation = (coords) => {
  if (coords) {
    emit('fly-to', coords);
  }
};

const handleBackToPlanner = () => {
  emit('back-to-planner');
};

const handleSavePlan = async () => {
  if (!plan.value || !form.value) {
    MessagePlugin.warning('没有可保存的计划');
    return;
  }

  saving.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      MessagePlugin.warning('请先登录以保存计划');
      return;
    }

    const { error } = await supabase
      .from('plans')
      .insert([
        {
          user_id: session.user.id,
          destination: form.value.destination,
          duration: form.value.duration,
          budget: form.value.budget,
          travelers: form.value.travelers,
          preferences: form.value.preferences || '',
          plan_details: plan.value
        }
      ]);

    if (error) throw error;

    MessagePlugin.success('计划已保存！');
  } catch (error) {
    console.error('Error saving plan:', error);
    MessagePlugin.error('保存计划失败，请稍后再试');
  } finally {
    saving.value = false;
  }
};

const calculateTotal = (budget) => {
  if (!budget) return 0;
  return Object.values(budget).reduce((sum, value) => sum + (value || 0), 0);
};
</script>

<style scoped>
.plan-detail-container {
  width: 100%;
  overflow: visible;
  box-sizing: border-box;
  padding: 0;
  background: transparent;
}

.plan-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding: 24px;
  background: linear-gradient(135deg, var(--td-brand-color-8) 0%, var(--td-brand-color-6) 30%, var(--td-brand-color-4) 70%, var(--td-brand-color-2) 100%);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: none;
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.plan-detail-header:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.plan-detail-title {
  font-size: 28px;
  font-weight: 600;
  color: white;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.plan-detail-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.plan-content {
  margin-bottom: 0;
  padding-bottom: 0;
}

.plan-collapse {
  background: transparent;
  margin-bottom: 24px;
}

/* 玻璃态折叠面板 */
.plan-collapse :deep(.t-collapse-panel) {
  background: var(--glass-bg) !important;
  backdrop-filter: var(--glass-blur) !important;
  -webkit-backdrop-filter: var(--glass-blur) !important;
  border: none !important;
  border-radius: 16px !important;
  box-shadow: var(--glass-shadow) !important;
  margin-bottom: 16px !important;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.plan-collapse :deep(.t-collapse-panel:hover) {
  box-shadow: var(--glass-shadow-hover) !important;
  transform: translateY(-2px);
}

.plan-collapse :deep(.t-collapse-panel__header) {
  background: rgba(255, 255, 255, 0.4) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  font-weight: 600;
  padding: 16px 20px !important;
}

.plan-collapse :deep(.t-collapse-panel__body) {
  background: rgba(255, 255, 255, 0.2) !important;
}

/* 某些主题可能在 header/body 上使用伪元素绘制分割线，统一移除 */
.plan-collapse :deep(.t-collapse-panel__header::after),
.plan-collapse :deep(.t-collapse::after),
.plan-collapse :deep(.t-collapse::before) {
  display: none !important;
}

.day-timeline {
  padding: 12px 0;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  position: relative;
}

.activity-item:hover {
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 4px 16px rgba(0, 132, 255, 0.15);
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
  padding: 24px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: none;
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.budget-section:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
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
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 16px;
  border-radius: 16px;
  border: none;
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  height: 100%;
}

.budget-item:hover {
  box-shadow: 0 8px 24px rgba(0, 132, 255, 0.2);
  transform: translateY(-4px) scale(1.02);
  background: rgba(255, 255, 255, 0.8);
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
  padding: 20px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: none;
  border-radius: 16px;
  font-weight: 600;
  font-size: 16px;
  box-shadow: 0 4px 20px rgba(0, 132, 255, 0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.budget-total:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0, 132, 255, 0.25);
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
  margin-bottom: 0;
  padding: 24px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border-radius: 20px;
  border: none;
  box-shadow: 0 4px 20px rgba(250, 173, 20, 0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tips-section:hover {
  box-shadow: 0 8px 32px rgba(250, 173, 20, 0.25);
  transform: translateY(-2px);
}

.tips-section :deep(.t-list) {
  background: transparent;
}

.tips-section :deep(.t-list-item) {
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

.tips-section :deep(.t-list-item:hover) {
  background: rgba(255, 255, 255, 0.8);
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

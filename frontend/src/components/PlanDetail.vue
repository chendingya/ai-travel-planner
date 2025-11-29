<template>
  <div class="plan-detail-container">
    <div class="plan-detail-header" ref="headerRef">
      <div>
        <h2 class="plan-detail-title">
          <t-icon name="check-circle" />
          您的专属旅行方案
        </h2>
      </div>
      <div class="header-actions">
        <GlassButton 
          :icon="editMode ? 'check' : 'edit'"
          @click="toggleEdit"
          size="sm"
          theme="dark"
        >
          {{ editMode ? '完成编辑' : '编辑行程' }}
        </GlassButton>
        <GlassButton 
          v-if="showSaveButton"
          icon="save"
          @click="handleSavePlan"
          :loading="isSaving"
          size="sm"
          theme="dark"
        >
          保存计划
        </GlassButton>
        <GlassButton 
          icon="arrow-left"
          @click="handleBackToPlanner"
          size="sm"
          theme="dark"
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
      <t-collapse v-model:value="activePanels" class="plan-collapse" @change="onCollapseChange">
        <t-collapse-panel 
          v-for="(day, index) in plan.daily_itinerary" 
          :key="index"
          :value="String(index)"
          :header="`第 ${index + 1} 天：${day.theme || '精彩行程'}`"
        >
            <div v-if="editMode" class="hotel-edit-container">
              <div class="hotel-edit-title">
                <t-icon name="home" /> 当晚住宿
              </div>
              <div class="hotel-edit-grid">
                <t-input v-model="day.hotel.name" placeholder="酒店名称" size="small" />
                <t-input v-model="day.hotel.city" placeholder="城市" size="small" />
                <t-input v-model="day.hotel.district" placeholder="区/县" size="small" />
                <t-input v-model="day.hotel.address" placeholder="地址" size="small" />
                <t-input v-model="day.hotel.price_range" placeholder="价格范围 (可选)" size="small" />
                <t-input v-model="day.hotel.contact" placeholder="联系方式 (可选)" size="small" />
              </div>
              <t-textarea
                v-model="day.hotel.notes"
                placeholder="备注（例如：靠近景点/交通便利）"
                :autosize="{ minRows: 2, maxRows: 4 }"
                size="small"
              />
            </div>
          <t-timeline class="day-timeline">
            <!-- 起点：住宿地（仅展示模式） -->
            <t-timeline-item v-if="!editMode" :label="''">
              <div class="activity-item">
                <div class="activity-content">
                  出发：{{ hotelDisplay(startHotelInfo(index)) }}
                  <div class="activity-sub" v-if="hotelSubtitle(startHotelInfo(index))">{{ hotelSubtitle(startHotelInfo(index)) }}</div>
                </div>
              </div>
            </t-timeline-item>
            <t-timeline-item 
              v-for="(activity, i) in day.activities" 
              :key="i"
              :label="activity.time"
            >
              <div 
                class="activity-item" 
                :class="{ 'edit-mode': editMode }"
                @click="!editMode && handleActivityClick(activity)"
              >
                <template v-if="editMode">
                  <div class="activity-edit-row">
                    <t-input v-model="activity.time" placeholder="时间 如 09:00" size="small" style="width: 110px;" />
                    <t-input v-model="activity.description" placeholder="地点/描述" size="small" style="flex:1;" />
                    <div class="edit-actions">
                      <t-button size="small" variant="outline" @click.stop="moveActivity(index, i, -1)">上移</t-button>
                      <t-button size="small" variant="outline" @click.stop="moveActivity(index, i, 1)">下移</t-button>
                      <t-button theme="danger" variant="outline" size="small" @click.stop="removeActivity(index, i)">删除</t-button>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="activity-content">{{ activity.description }}</div>
                </template>
              </div>
            </t-timeline-item>
            <!-- 终点：住宿地（仅展示模式） -->
            <t-timeline-item v-if="!editMode" :label="''">
              <div class="activity-item">
                <div class="activity-content">
                  返回：{{ hotelDisplay(endHotelInfo(index)) }}
                  <div class="activity-sub" v-if="hotelSubtitle(endHotelInfo(index))">{{ hotelSubtitle(endHotelInfo(index)) }}</div>
                </div>
              </div>
            </t-timeline-item>
          </t-timeline>
          <div v-if="editMode" class="add-activity-row">
            <t-button size="small" theme="primary" variant="outline" @click.stop="addActivity(index)">添加活动</t-button>
          </div>
        </t-collapse-panel>
      </t-collapse>

      <!-- 预算分解 -->
      <div v-if="plan.budget_breakdown" class="budget-section">
        <h4 class="section-title">
          <t-icon name="money-circle" />
          预算分解
        </h4>
            <div class="budget-overview">
              <div class="budget-overview-item">
                <span class="budget-overview-label">计划总预算</span>
                <span v-if="!editMode" class="budget-overview-value">¥{{ formatCurrency(formBudget) }}</span>
                <t-input-number
                  v-else
                  v-model="formBudget"
                  :min="0"
                  :step="100"
                  size="small"
                />
              </div>
              <div class="budget-overview-item">
                <span class="budget-overview-label">分类合计</span>
                <span class="budget-overview-value">¥{{ formatCurrency(breakdownTotal) }}</span>
              </div>
            </div>
            <div v-if="hasBudgetGap" class="budget-gap">
              分类合计与总预算相差 ¥{{ formatCurrency(budgetDifferenceAbs) }}，请确认后再保存。
            </div>
        <template v-if="!editMode">
          <div class="budget-grid-wrapper">
            <div v-for="entry in budgetEntries" :key="entry.key" class="budget-col">
              <div class="budget-item">
                <t-icon :name="budgetIconName(entry.key)" class="budget-icon" />
                <div class="budget-label">{{ budgetLabelMap[entry.key] || entry.key }}</div>
                <div class="budget-value">¥{{ formatCurrency(entry.value) }}</div>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="budget-edit-grid">
            <div v-for="entry in budgetEntries" :key="entry.key" class="budget-edit-row">
              <span class="budget-edit-label">{{ budgetLabelMap[entry.key] || entry.key }}</span>
              <t-input-number v-model="plan.budget_breakdown[entry.key]" :min="0" size="small" />
              <t-button theme="danger" variant="text" size="small" @click="removeBudgetItem(entry.key)">
                删除
              </t-button>
            </div>
            <div class="budget-add-row">
              <t-input v-model="newBudgetKey" placeholder="新增类别，如门票" size="small" style="flex: 1;" />
              <t-input-number v-model="newBudgetValue" :min="0" size="small" style="width: 140px;" />
              <t-button theme="primary" variant="outline" size="small" @click="addBudgetItem">添加</t-button>
            </div>
          </div>
        </template>
        <div class="budget-total">
          <span>总计</span>
          <span class="total-value">¥{{ formatCurrency(breakdownTotal) }}</span>
        </div>
        <!-- 图表区域 -->
        <div class="budget-charts">
          <t-card title="预算分布图" style="margin-bottom: 16px;">
            <SimplePieChart :data="budgetDataForChart" />
          </t-card>
        </div>
      </div>

      <!-- 提示卡片迁移到右侧地图下方渲染（见 PlanDetailView.vue） -->
    </div>
  </div>
 </template>

<script setup>
import { ref, onMounted, computed, nextTick, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePlannerStore } from '../stores/planner';
import { supabase } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';
import SimplePieChart from './SimplePieChart.vue';
import GlassButton from './GlassButton.vue';

const emit = defineEmits(['fly-to', 'back-to-planner', 'header-offset', 'select-day', 'edit-mode-change', 'plan-draft-change', 'spot-click']);
const route = useRoute();
const store = usePlannerStore();

const plan = ref(null);
const form = ref({});
const saving = ref(false);
const headerRef = ref(null);
const editMode = ref(false);
const planId = ref(null); // 存储从数据库加载的计划ID

// 根据路由来源判断是否显示保存按钮
const showSaveButton = computed(() => {
  return route.query.from === 'planner';
});

// 暴露isSaving状态给父组件使用
const isSaving = ref(false);
const defaultHotelName = computed(() => {
  const d = (store.form?.destination || '').toString().trim();
  return d ? `${d} 酒店` : '住宿地点';
});

const getHotelForDay = (dayIndex) => {
  if (!plan.value || !Array.isArray(plan.value.daily_itinerary)) return null;
  const day = plan.value.daily_itinerary[dayIndex];
  if (!day) return null;
  const hotel = day.hotel;
  if (!hotel || typeof hotel !== 'object') return null;
  return hotel;
};

const hotelDisplay = (hotel) => {
  if (!hotel) return defaultHotelName.value;
  return hotel.name || defaultHotelName.value;
};

const hotelSubtitle = (hotel) => {
  if (!hotel) return '';
  const location = [hotel.city, hotel.district].filter(Boolean).join(' · ');
  const address = hotel.address && !hotel.address.includes(hotel.name) ? hotel.address : '';
  const parts = [location, address, hotel.notes].filter(Boolean);
  return parts.join(' | ');
};

const startHotelInfo = (dayIndex) => {
  const currentHotel = getHotelForDay(dayIndex);
  const prevHotel = dayIndex > 0 ? getHotelForDay(dayIndex - 1) : null;
  return currentHotel || prevHotel;
};

const endHotelInfo = (dayIndex) => {
  const totalDays = plan.value?.daily_itinerary?.length || 0;
  const nextHotel = dayIndex < totalDays - 1 ? getHotelForDay(dayIndex + 1) : null;
  const currentHotel = getHotelForDay(dayIndex);
  return nextHotel || currentHotel || startHotelInfo(dayIndex);
};

const budgetLabelMap = {
  transportation: '交通',
  accommodation: '住宿',
  meals: '餐饮',
  attractions: '景点',
  shopping: '购物',
  tickets: '门票',
  other: '其他'
};

const budgetOrder = Object.keys(budgetLabelMap);

const budgetIconMap = {
  transportation: 'explore',
  accommodation: 'home',
  meals: 'meat-pepper',
  attractions: 'map',
  tickets: 'ticket',
  shopping: 'shop',
  other: 'money'
};

const budgetIconName = (key) => budgetIconMap[key] || 'money-circle';

const budgetEntries = computed(() => {
  const breakdown = plan.value?.budget_breakdown || {};
  return Object.keys(breakdown)
    .map((key, index) => {
      const raw = breakdown[key];
      const numeric = Number(raw);
      return {
        key,
        value: Number.isFinite(numeric) && numeric >= 0 ? numeric : 0,
        originalIndex: index
      };
    })
    .sort((a, b) => {
      const aOrder = budgetOrder.indexOf(a.key);
      const bOrder = budgetOrder.indexOf(b.key);
      if (aOrder !== -1 || bOrder !== -1) {
        if (aOrder === -1) return 1;
        if (bOrder === -1) return -1;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      return a.originalIndex - b.originalIndex;
    })
    .map(({ key, value }) => ({ key, value }));
});

const budgetDataForChart = computed(() => {
  return budgetEntries.value.map(({ key, value }) => ({
    name: budgetLabelMap[key] || key,
    value
  }));
});

const breakdownTotal = computed(() => {
  return budgetEntries.value.reduce((sum, entry) => sum + entry.value, 0);
});

const formBudget = computed({
  get: () => {
    const raw = form.value?.budget;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    return breakdownTotal.value;
  },
  set: (val) => {
    const numeric = Number(val);
    if (!form.value) form.value = {};
    form.value.budget = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  }
});

const budgetDifference = computed(() => {
  return (formBudget.value || 0) - breakdownTotal.value;
});

const budgetDifferenceAbs = computed(() => Math.abs(budgetDifference.value));

const hasBudgetGap = computed(() => budgetDifferenceAbs.value > 0.5);

const addBudgetItem = () => {
  const key = newBudgetKey.value.trim();
  if (!key) {
    MessagePlugin.warning('请输入预算类别名称');
    return;
  }
  if (!plan.value) return;
  if (!plan.value.budget_breakdown) plan.value.budget_breakdown = {};
  if (Object.prototype.hasOwnProperty.call(plan.value.budget_breakdown, key)) {
    MessagePlugin.warning('该预算类别已存在');
    return;
  }
  plan.value.budget_breakdown[key] = Number(newBudgetValue.value) || 0;
  newBudgetKey.value = '';
  newBudgetValue.value = null;
};

const removeBudgetItem = (key) => {
  if (!plan.value?.budget_breakdown) return;
  delete plan.value.budget_breakdown[key];
};

const formatDayRanges = (days) => {
  if (!days || !days.length) return '';
  const sorted = Array.from(new Set(days)).sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    ranges.push([start, prev]);
    start = current;
    prev = current;
  }
  ranges.push([start, prev]);

  return ranges
    .map(([s, e]) => (s === e ? `D${s}` : `D${s}-D${e}`))
    .join(', ');
};

const rebuildAccommodation = (itinerary) => {
  if (!Array.isArray(itinerary)) return [];
  const map = new Map();

  itinerary.forEach((day, idx) => {
    const hotel = day?.hotel;
    if (!hotel || typeof hotel !== 'object') return;
    if (!hotel.name && !hotel.address) return;
    const key = [hotel.name || '', hotel.address || '', hotel.city || '', hotel.district || '']
      .join('|')
      .toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: hotel.name || '',
        city: hotel.city || '',
        district: hotel.district || '',
        address: hotel.address || '',
        notes: hotel.notes || hotel.why || '',
        price_range: hotel.price_range || '',
        contact: hotel.contact || hotel.phone || '',
        coords: Array.isArray(hotel.coords) ? hotel.coords : null,
        daysList: []
      });
    }
    const entry = map.get(key);
    entry.daysList.push(day.day || idx + 1);
    if (!entry.name && hotel.name) entry.name = hotel.name;
    if (!entry.city && hotel.city) entry.city = hotel.city;
    if (!entry.district && hotel.district) entry.district = hotel.district;
    if (!entry.address && hotel.address) entry.address = hotel.address;
    if (!entry.notes && (hotel.notes || hotel.why)) entry.notes = hotel.notes || hotel.why;
    if (!entry.price_range && hotel.price_range) entry.price_range = hotel.price_range;
    if (!entry.contact && (hotel.contact || hotel.phone)) entry.contact = hotel.contact || hotel.phone;
    if (!entry.coords && Array.isArray(hotel.coords)) entry.coords = hotel.coords;
  });

  const result = [];
  map.forEach((entry) => {
    const days = formatDayRanges(entry.daysList);
    delete entry.daysList;
    result.push({ ...entry, days });
  });
  return result;
};

const activePanels = ref(['0']); // 折叠面板当前展开的天
const newBudgetKey = ref('');
const newBudgetValue = ref(null);

onMounted(() => {
  // 从store加载方案和表单数据
  plan.value = JSON.parse(JSON.stringify(store.plan));
  emit('plan-draft-change', plan.value);
  form.value = store.form;
  
  // 如果是从 Planner 新生成的计划，清除旧的计划 ID
  if (route.query.from === 'planner') {
    try {
      localStorage.removeItem('current_plan_id');
      planId.value = null;
      console.log('🆕 新生成的计划，已清除旧的计划 ID');
    } catch (e) {
      console.warn('无法清除计划 ID', e);
    }
  } else {
    // 尝试从 localStorage 获取计划ID（从"我的计划"进入时）
    try {
      const savedPlanId = localStorage.getItem('current_plan_id');
      if (savedPlanId) {
        planId.value = savedPlanId;
        console.log('📝 加载已保存的计划 ID:', savedPlanId);
      }
    } catch (e) {
      console.warn('无法从 localStorage 读取计划 ID', e);
    }
  }

  // 监听 store.plan 变化,同步到本地
  watch(() => store.plan, (newPlan) => {
    if (newPlan && newPlan !== plan.value) {
      plan.value = JSON.parse(JSON.stringify(newPlan));
      console.log('📋 从 store 同步最新计划');
      emit('plan-draft-change', plan.value);
    }
  }, { deep: true });

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

  watch(plan, (newPlan) => {
    if (newPlan) {
      emit('plan-draft-change', newPlan);
    }
  }, { deep: true });

  watch(editMode, (val) => {
    emit('edit-mode-change', val);
    if (val) {
      ensureHotelsInitialized();
    }
  });

  const ensureHotelsInitialized = () => {
    if (!plan.value || !Array.isArray(plan.value.daily_itinerary)) return;
    plan.value.daily_itinerary.forEach((day, idx) => {
      const hotel = day?.hotel;
      if (!hotel || typeof hotel !== 'object') {
        plan.value.daily_itinerary[idx].hotel = {
          name: '',
          city: '',
          district: '',
          address: '',
          notes: '',
          price_range: '',
          contact: '',
          days: '',
          coords: null
        };
      }
    });
  };

const flyToLocation = (coords) => {
  if (coords) {
    emit('fly-to', coords);
  }
};

// 处理景点点击事件
const handleActivityClick = (activity) => {
  // 发送景点点击事件给父组件
  emit('spot-click', activity);
  
  // 同时触发地图定位
  if (activity.coords) {
    emit('fly-to', activity.coords);
  }
};

const handleBackToPlanner = () => {
  // 返回规划页面时清除计划 ID
  try {
    localStorage.removeItem('current_plan_id');
    planId.value = null;
  } catch (e) {
    console.warn('无法清除计划 ID', e);
  }
  emit('back-to-planner');
};

const handleSavePlan = async () => {
  if (!plan.value || !form.value) {
    MessagePlugin.warning('没有可保存的计划');
    return;
  }

  isSaving.value = true;
  saving.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      MessagePlugin.warning('请先登录以保存计划');
      return;
    }

    const planPayload = JSON.parse(JSON.stringify(plan.value));

    const insertPayload = {
      user_id: session.user.id,
      destination: form.value.destination,
      duration: form.value.duration,
      budget: form.value.budget,
      travelers: form.value.travelers,
      preferences: form.value.preferences || '',
      plan_details: planPayload
    };

    const { error } = await supabase
      .from('plans')
      .insert([insertPayload]);

    if (error) throw error;

    MessagePlugin.success('计划已保存！');
  } catch (error) {
    console.error('Error saving plan:', error);
    const message = error?.message || '';
    if (message.includes('Failed to fetch')) {
      MessagePlugin.error('保存计划失败：无法连接到云端，请检查网络或 Supabase 配置');
    } else {
      MessagePlugin.error('保存计划失败，请稍后再试');
    }
  } finally {
    saving.value = false;
    isSaving.value = false;
  }
};

const calculateTotal = (budget) => {
  if (!budget) return 0;
  return Object.values(budget).reduce((sum, value) => {
    const numeric = Number(value);
    return sum + (Number.isFinite(numeric) && numeric >= 0 ? numeric : 0);
  }, 0);
};

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
};

const toggleEdit = async () => {
  if (!editMode.value) {
    // 进入编辑模式
    editMode.value = true;
    MessagePlugin.info('已进入编辑模式：可修改时间/地点或添加/删除活动');
  } else {
    // 退出编辑模式，保存修改
    editMode.value = false;
    persistPlan();
    
    // 如果是从数据库加载的计划，同时更新数据库
    if (planId.value) {
      await updatePlanInDatabase();
    }
    
    MessagePlugin.success('已保存编辑并退出编辑模式');
  }
};

// 更新数据库中的计划
const updatePlanInDatabase = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('用户未登录，无法更新数据库');
      return;
    }

    const { error } = await supabase
      .from('plans')
      .update({
        plan_details: plan.value,
        updated_at: new Date().toISOString()
      })
      .eq('id', planId.value)
      .eq('user_id', session.user.id); // 确保只更新自己的计划

    if (error) {
      console.error('更新数据库失败:', error);
      MessagePlugin.warning('编辑已保存到本地，但同步到云端失败');
    } else {
      console.log('✅ 计划已同步到数据库');
    }
  } catch (error) {
    console.error('更新数据库出错:', error);
  }
};

const persistPlan = () => {
  try {
    // 去除空活动
    const p = plan.value;
    if (!p || !p.daily_itinerary) return;
    p.daily_itinerary.forEach(d => {
      d.activities = (d.activities || []).filter(a => a && (a.description || a.time));
    });
    if (p.budget_breakdown && typeof p.budget_breakdown === 'object') {
      Object.keys(p.budget_breakdown).forEach((key) => {
        const numeric = Number(p.budget_breakdown[key]);
        p.budget_breakdown[key] = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
      });
    }
    const totalBudgetNumber = Number(formBudget.value);
    if (Number.isFinite(totalBudgetNumber) && totalBudgetNumber >= 0) {
      p.total_budget = totalBudgetNumber;
    } else {
      delete p.total_budget;
    }
    p.accommodation = rebuildAccommodation(p.daily_itinerary);
    // 深拷贝以触发 store 更新
    store.setPlan(JSON.parse(JSON.stringify(p)));
    if (form.value) {
      const sanitizedForm = {
        ...form.value,
        budget: totalBudgetNumber >= 0 ? totalBudgetNumber : 0
      };
      store.setForm(sanitizedForm);
    }
    console.log('✅ 计划已保存到 store');
  } catch (e) {
    console.warn('Failed to persist plan', e);
  }
};

const addActivity = (dayIndex) => {
  const p = plan.value;
  if (!p || !p.daily_itinerary || !p.daily_itinerary[dayIndex]) return;
  p.daily_itinerary[dayIndex].activities = p.daily_itinerary[dayIndex].activities || [];
  p.daily_itinerary[dayIndex].activities.push({ time: '', description: '' });
  // 添加活动时不立即保存到 store,避免触发地图更新
  MessagePlugin.success('已添加活动,请填写后点击"完成编辑"保存');
};

const removeActivity = (dayIndex, actIndex) => {
  const p = plan.value;
  if (!p || !p.daily_itinerary || !p.daily_itinerary[dayIndex]) return;
  const list = p.daily_itinerary[dayIndex].activities || [];
  if (actIndex >= 0 && actIndex < list.length) {
    list.splice(actIndex, 1);
    // 删除活动时不立即保存到 store,避免触发地图更新
    MessagePlugin.success('已删除活动,请点击"完成编辑"保存');
  }
};

const moveActivity = (dayIndex, actIndex, dir) => {
  const p = plan.value;
  if (!p || !p.daily_itinerary || !p.daily_itinerary[dayIndex]) return;
  const list = p.daily_itinerary[dayIndex].activities || [];
  const target = actIndex + dir;
  if (target < 0 || target >= list.length) return;
  const tmp = list[actIndex];
  list[actIndex] = list[target];
  list[target] = tmp;
  // 移动活动时不立即保存到 store,避免触发地图更新
};

// 折叠面板切换 -> 同步右侧地图天数
const onCollapseChange = (vals) => {
  // vals 可能是数组（多开）或字符串（单开），此处统一成数组处理
  const arr = Array.isArray(vals) ? vals : (vals ? [vals] : []);
  activePanels.value = arr;
  // 选择最近一次用户操作的天：优先取最后一个展开的；若为空则不处理
  const v = arr.length ? arr[arr.length - 1] : null;
  if (v != null) {
    const day = parseInt(v, 10) + 1; // 地图使用从1开始
    if (!Number.isNaN(day)) emit('select-day', day);
  }
};

// 暴露方法给父组件调用
defineExpose({
  toggleEdit,
  handleSavePlan
});
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
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  margin-bottom: 16px; /* 与右侧卡片间距一致 */
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
  min-height: 128px; /* 最小高度 */
  box-sizing: border-box;
}

.plan-detail-header:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 12px; /* 与右侧卡片标题和按钮间距一致 */
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

.hotel-edit-container {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hotel-edit-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.hotel-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  position: relative;
}

/* 非编辑模式下才有指针和悬停效果 */
.activity-item:not(.edit-mode) {
  cursor: pointer;
}

.activity-item:not(.edit-mode):hover {
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 4px 16px rgba(0, 132, 255, 0.15);
  transform: translateX(4px);
}

.activity-item:not(.edit-mode):hover::before {
  content: "📍";
  position: absolute;
  left: -4px;
  opacity: 0.6;
  animation: pulse 1s ease-in-out infinite;
}

/* 编辑模式下的样式 */
.activity-item.edit-mode {
  cursor: default;
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

.activity-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.activity-edit-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.add-activity-row {
  padding: 8px 16px 0 16px;
}

.edit-actions {
  display: flex;
  gap: 6px;
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

.budget-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.budget-overview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.budget-overview-label {
  font-weight: 500;
  color: var(--text-secondary);
}

.budget-overview-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.budget-gap {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(250, 173, 20, 0.12);
  color: #d46b08;
  font-size: 13px;
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

.budget-edit-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.budget-edit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.6);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.budget-edit-label {
  min-width: 80px;
  font-weight: 500;
  color: var(--text-primary);
}

.budget-add-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.5);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.budget-icon {
  font-size: 32px;
  margin-bottom: 8px;
  line-height: 1;
  display: inline-flex;
  color: var(--text-primary);
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

/* 编辑输入框样式优化：移除内部蓝色强调框与阴影 */
.activity-edit-row :deep(.t-input),
.activity-edit-row :deep(.t-input__inner),
.activity-edit-row :deep(.t-input-number) {
  border-radius: 12px;
}

.activity-edit-row :deep(.t-input:focus),
.activity-edit-row :deep(.t-input__inner:focus),
.activity-edit-row :deep(.t-input__wrap:focus-within),
.activity-edit-row :deep(.t-input-number:focus-within),
.activity-edit-row :deep(.t-input.t-is-focused),
.activity-edit-row :deep(.t-input-number.t-is-focused) {
  box-shadow: none !important;
  outline: none !important;
}

/* 某些主题会在内部再画一层强调边框，统一移除 */
.activity-edit-row :deep(.t-input__inner) {
  box-shadow: none !important;
}

/* === 分享浮动按钮 === */
.share-button-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
}

.share-float-btn {
  width: 60px;
  height: 60px;
  border-radius: 50% !important;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
}

.share-float-btn:hover {
  box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
  transform: translateY(-4px);
  background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%);
}

.share-float-btn.playlist-btn {
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%);
  box-shadow: 0 4px 16px rgba(236, 72, 153, 0.3);
}

.share-float-btn.playlist-btn:hover {
  box-shadow: 0 8px 24px rgba(236, 72, 153, 0.4);
  background: linear-gradient(135deg, #f43f5e 0%, #fb7185 100%);
}

@media (max-width: 768px) {
  .share-button-container {
    bottom: 16px;
    right: 16px;
    gap: 8px;
  }

  .share-float-btn {
    width: 50px;
    height: 50px;
    font-size: 11px;
  }

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

<template>
  <div class="expense-tracker-container">
    <div class="page-header">
      <h2 class="page-title">
        <t-icon name="chart-bar" size="28px" />
        费用统计
      </h2>
      <t-button theme="primary" @click="showAddDialog = true">
        <t-icon name="add" />
        添加费用
      </t-button>
    </div>

    <div v-if="!planId" class="empty-state">
      <t-empty description="请先选择一个旅行计划">
        <template #image>
          <t-icon name="inbox" size="80px" style="color: var(--text-secondary)" />
        </template>
      </t-empty>
    </div>

    <div v-else-if="loading" class="loading-container">
      <t-loading size="large" text="加载中..." />
    </div>

    <div v-else class="content-wrapper">
      <!-- 费用统计卡片 -->
      <t-row :gutter="16" class="stats-row">
        <t-col :span="4">
          <t-card class="stat-card">
            <div class="stat-content">
              <div class="stat-label">总费用</div>
              <div class="stat-value primary">¥{{ totalExpenses.toLocaleString() }}</div>
            </div>
          </t-card>
        </t-col>
        <t-col :span="4">
          <t-card class="stat-card">
            <div class="stat-content">
              <div class="stat-label">项目数量</div>
              <div class="stat-value">{{ expenses.length }}</div>
            </div>
          </t-card>
        </t-col>
        <t-col :span="4">
          <t-card class="stat-card">
            <div class="stat-content">
              <div class="stat-label">平均费用</div>
              <div class="stat-value">¥{{ averageExpense.toLocaleString() }}</div>
            </div>
          </t-card>
        </t-col>
      </t-row>

      <!-- 费用列表 -->
      <t-card v-if="expenses.length > 0" class="expense-list-card">
        <template #header>
          <div class="card-header">
            <span class="card-title">费用明细</span>
          </div>
        </template>

        <t-table
          :data="expenses"
          :columns="columns"
          row-key="id"
          :pagination="pagination"
          stripe
          hover
        >
          <template #amount="{ row }">
            <span class="amount-text">¥{{ row.amount.toLocaleString() }}</span>
          </template>
          <template #created_at="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
          <template #operation="{ row }">
            <t-space>
              <t-button
                theme="danger"
                variant="text"
                size="small"
                @click="confirmDelete(row.id)"
              >
                <t-icon name="delete" />
                删除
              </t-button>
            </t-space>
          </template>
        </t-table>
      </t-card>

      <t-empty v-else description="暂无费用记录">
        <template #image>
          <t-icon name="file" size="80px" style="color: var(--text-secondary)" />
        </template>
      </t-empty>
    </div>

    <!-- 添加费用对话框 -->
    <t-dialog
      v-model:visible="showAddDialog"
      header="添加费用"
      :on-confirm="handleAddExpense"
      :confirm-btn="{ content: '添加', theme: 'primary', loading: submitting }"
    >
      <t-form ref="formRef" :data="form" :rules="formRules" label-align="left">
        <t-form-item label="费用描述" name="description">
          <t-input
            v-model="form.description"
            placeholder="例如：交通费、餐饮费等"
            clearable
          />
        </t-form-item>
        <t-form-item label="金额（元）" name="amount">
          <t-input-number
            v-model="form.amount"
            :min="0"
            :max="1000000"
            theme="normal"
            placeholder="请输入金额"
          />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 删除确认对话框 -->
    <t-dialog
      v-model:visible="showDeleteDialog"
      header="确认删除"
      :on-confirm="handleDelete"
      :on-cancel="() => showDeleteDialog = false"
    >
      <p>确定要删除这条费用记录吗？此操作无法撤销。</p>
    </t-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { supabase } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';

const props = defineProps({
  planId: {
    type: Number,
    default: null,
  },
});

const form = ref({
  description: '',
  amount: null,
});

const formRules = {
  description: [{ required: true, message: '请输入费用描述' }],
  amount: [{ required: true, message: '请输入金额' }],
};

const expenses = ref([]);
const loading = ref(false);
const showAddDialog = ref(false);
const showDeleteDialog = ref(false);
const expenseToDelete = ref(null);
const submitting = ref(false);
const formRef = ref(null);

const columns = [
  {
    colKey: 'description',
    title: '描述',
    width: 200,
  },
  {
    colKey: 'amount',
    title: '金额',
    width: 150,
  },
  {
    colKey: 'created_at',
    title: '创建时间',
    width: 180,
  },
  {
    colKey: 'operation',
    title: '操作',
    width: 120,
    fixed: 'right',
  },
];

const pagination = {
  defaultPageSize: 10,
  defaultCurrent: 1,
  pageSizeOptions: [10, 20, 50],
};

const totalExpenses = computed(() => {
  return expenses.value.reduce((total, expense) => total + expense.amount, 0);
});

const averageExpense = computed(() => {
  if (expenses.value.length === 0) return 0;
  return Math.round(totalExpenses.value / expenses.value.length);
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fetchExpenses = async () => {
  if (!props.planId) return;
  
  loading.value = true;
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('plan_id', props.planId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    expenses.value = data || [];
  } catch (error) {
    console.error('Error fetching expenses:', error);
    MessagePlugin.error('获取费用列表失败');
  } finally {
    loading.value = false;
  }
};

const handleAddExpense = async () => {
  const valid = await formRef.value?.validate();
  if (!valid) return;

  submitting.value = true;
  try {
    const { data, error } = await supabase
      .from('expenses')
      .insert([
        {
          plan_id: props.planId,
          description: form.value.description,
          amount: form.value.amount,
        },
      ])
      .select();
    
    if (error) throw error;
    
    expenses.value.unshift(data[0]);
    MessagePlugin.success('费用添加成功');
    showAddDialog.value = false;
    form.value = { description: '', amount: null };
  } catch (error) {
    console.error('Error adding expense:', error);
    MessagePlugin.error('添加费用失败');
  } finally {
    submitting.value = false;
  }
};

const confirmDelete = (id) => {
  expenseToDelete.value = id;
  showDeleteDialog.value = true;
};

const handleDelete = async () => {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseToDelete.value);
    
    if (error) throw error;
    
    expenses.value = expenses.value.filter((e) => e.id !== expenseToDelete.value);
    MessagePlugin.success('费用已删除');
    showDeleteDialog.value = false;
    expenseToDelete.value = null;
  } catch (error) {
    console.error('Error deleting expense:', error);
    MessagePlugin.error('删除费用失败');
  }
};

watch(() => props.planId, () => {
  if (props.planId) {
    fetchExpenses();
  }
});

onMounted(() => {
  if (props.planId) {
    fetchExpenses();
  }
});
</script>

<style scoped>
.expense-tracker-container {
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

.empty-state,
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.content-wrapper {
  margin-top: 24px;
}

.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.stat-card:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-4px);
  border-color: rgba(0, 132, 255, 0.3);
}

.stat-content {
  text-align: center;
  padding: 16px 0;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-value.primary {
  color: var(--brand-color);
}

.expense-list-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.expense-list-card:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.amount-text {
  font-weight: 600;
  color: var(--brand-color);
}

@media (max-width: 768px) {
  .expense-tracker-container {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .page-title {
    font-size: 24px;
  }
}
</style>
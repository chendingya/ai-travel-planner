<template>
  <div class="plan-context-card">
    <div class="plan-context-header">
      <span class="plan-context-title">计划上下文</span>
      <t-button
        variant="text"
        size="small"
        :loading="isLoadingContextPlans"
        @click="$emit('refresh')"
        title="刷新可挂载计划"
      >
        <t-icon name="refresh" />
      </t-button>
    </div>
    <t-select
      size="small"
      :value="attachedPlanId"
      :options="contextPlanOptions"
      :loading="isLoadingContextPlans"
      :disabled="isLoading"
      clearable
      placeholder="选择要持续挂载的旅行计划"
      @change="(value) => $emit('change', value)"
    />
    <div v-if="attachedPlanLabel" class="plan-context-active">
      <span class="plan-context-active-text">已挂载：{{ attachedPlanLabel }}</span>
      <t-button
        variant="text"
        size="small"
        theme="danger"
        :disabled="isLoading"
        @click="$emit('clear')"
      >
        取消
      </t-button>
    </div>
    <div v-else class="plan-context-hint">未挂载计划。挂载后将对当前会话后续消息持续生效。</div>
  </div>
</template>

<script setup>
defineProps({
  attachedPlanId: {
    type: String,
    default: '',
  },
  attachedPlanLabel: {
    type: String,
    default: '',
  },
  contextPlanOptions: {
    type: Array,
    default: () => [],
  },
  isLoadingContextPlans: {
    type: Boolean,
    default: false,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['refresh', 'change', 'clear'])
</script>

<style scoped>
.plan-context-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(66, 153, 225, 0.24);
  border-radius: 10px;
  background: rgba(66, 153, 225, 0.06);
}

.plan-context-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.plan-context-title {
  font-size: 12px;
  font-weight: 600;
  color: #2d3748;
}

.plan-context-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plan-context-active-text {
  font-size: 12px;
  color: #2f4858;
  line-height: 1.3;
}

.plan-context-hint {
  font-size: 12px;
  line-height: 1.35;
  color: #6b7280;
}
</style>

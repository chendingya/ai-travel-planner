<template>
  <button 
    :class="['glass-button', size, `theme-${theme}`, { 'is-loading': loading }]" 
    @click="handleClick"
    :disabled="loading || disabled"
  >
    <t-icon v-if="loading" name="loading" class="loading-icon" />
    <t-icon v-else-if="icon" :name="icon" />
    <span class="button-text"><slot></slot></span>
  </button>
</template>

<script setup>
defineProps({
  icon: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'md', // sm | md | lg
    validator: (v) => ['sm', 'md', 'lg'].includes(v)
  },
  theme: {
    type: String,
    default: 'light', // light (白色背景/深色文字) | dark (深色背景/白色文字) | primary (品牌色)
    validator: (v) => ['light', 'dark', 'primary'].includes(v)
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['click']);

const handleClick = (e) => {
  emit('click', e);
};
</script>

<style scoped>
.glass-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: auto;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 500;
  white-space: nowrap;
  outline: none;
}

.glass-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button-text {
  display: inline-flex;
  align-items: center;
}

/* size variants */
.glass-button.sm {
  font-size: 14px;
  padding: 8px 16px;
}

.glass-button.md {
  font-size: 16px;
  padding: 12px 28px;
}

.glass-button.lg {
  font-size: 18px;
  padding: 16px 48px;
}

/* === Theme: Dark (白色文字，用于深色/蓝色背景) === */
.glass-button.theme-dark {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.glass-button.theme-dark:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.glass-button.theme-dark:active:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* === Theme: Light (深色文字，用于浅色背景) - 默认 === */
.glass-button.theme-light {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: var(--text-primary, #1a1a1a);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.glass-button.theme-light:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 132, 255, 0.15);
  border-color: rgba(0, 132, 255, 0.2);
}

.glass-button.theme-light:active:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* === Theme: Primary (品牌色渐变背景) === */
.glass-button.theme-primary {
  background: linear-gradient(135deg, var(--td-brand-color, #0084ff) 0%, var(--td-brand-color-6, #0066cc) 100%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  box-shadow: 0 4px 16px rgba(0, 132, 255, 0.3);
}

.glass-button.theme-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--td-brand-color-5, #3399ff) 0%, var(--td-brand-color, #0084ff) 100%);
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(0, 132, 255, 0.4);
}

.glass-button.theme-primary:active:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 132, 255, 0.3);
}

/* Loading animation */
.is-loading {
  pointer-events: none;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

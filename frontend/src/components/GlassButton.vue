<template>
  <button :class="['glass-button', size]" @click="handleClick">
    <t-icon v-if="icon" :name="icon" />
    <slot></slot>
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
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
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

.glass-button:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.glass-button:active {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>

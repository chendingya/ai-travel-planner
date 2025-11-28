<template>
  <div class="quick-note-container">
    <t-card class="quick-note-card" :bordered="false">
      <div class="quick-note-header">
        <h2 class="quick-note-title">
          <t-icon name="image" />
          AI速记卡片生成
        </h2>
        <GlassButton 
          icon="arrow-left"
          @click="handleBack"
          size="sm"
        >
          返回
        </GlassButton>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <t-loading size="large" text="正在生成您的专属旅行速记卡片..." />
        <div class="loading-steps">
          <div class="loading-step" :class="{ active: currentStep >= 1 }">
            <t-icon :name="currentStep > 1 ? 'check-circle' : 'time'" />
            <span>生成提示词</span>
          </div>
          <div class="loading-step" :class="{ active: currentStep >= 2 }">
            <t-icon :name="currentStep > 2 ? 'check-circle' : 'time'" />
            <span>调用AI绘图</span>
          </div>
          <div class="loading-step" :class="{ active: currentStep >= 3 }">
            <t-icon name="check-circle" />
            <span>完成</span>
          </div>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-container">
        <t-result theme="error" title="生成失败">
          <template #description>
            {{ error }}
          </template>
          <template #actions>
            <GlassButton @click="handleRetry" icon="refresh">
              重试
            </GlassButton>
            <GlassButton @click="handleBack" icon="arrow-left">
              返回
            </GlassButton>
          </template>
        </t-result>
      </div>

      <!-- 成功显示图片 -->
      <div v-else-if="imageUrl" class="result-container">
        <div class="result-header">
          <h3 class="result-title">您的专属旅行速记卡片</h3>
          <div class="result-actions">
            <GlassButton @click="handleDownload" icon="download">
              下载图片
            </GlassButton>
            <GlassButton @click="handleRetry" icon="refresh">
              重新生成
            </GlassButton>
          </div>
        </div>
        
        <div class="image-container">
          <img :src="imageUrl" alt="旅行速记卡片" class="result-image" />
        </div>

        <!-- 显示生成的提示词 -->
        <t-collapse v-if="generatedPrompt" class="prompt-collapse">
          <t-collapse-panel value="prompt" header="查看生成的提示词">
            <div class="prompt-content">
              {{ generatedPrompt }}
            </div>
          </t-collapse-panel>
        </t-collapse>
      </div>

      <!-- 初始状态 -->
      <div v-else class="initial-container">
        <t-empty description="点击生成按钮创建您的旅行速记卡片">
          <template #image>
            <t-icon name="image" size="80px" style="color: var(--text-secondary)" />
          </template>
        </t-empty>
      </div>
    </t-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlannerStore } from '../stores/planner';
import { MessagePlugin } from 'tdesign-vue-next';
import GlassButton from '../components/GlassButton.vue';

const router = useRouter();
const store = usePlannerStore();

const loading = ref(false);
const currentStep = ref(0);
const error = ref('');
const imageUrl = ref('');
const generatedPrompt = ref('');

const handleBack = () => {
  router.back();
};

const generateQuickNote = async () => {
  if (!store.plan || !store.form) {
    MessagePlugin.warning('请先生成旅行计划');
    router.push({ name: 'Planner' });
    return;
  }

  loading.value = true;
  error.value = '';
  currentStep.value = 1;

  try {
    // 第一步：生成提示词
    console.log('🎨 开始生成提示词...');
    const promptResponse = await fetch('/api/generate-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: store.form.destination,
        duration: store.form.duration,
        dailyItinerary: store.plan.daily_itinerary,
      }),
    });

    if (!promptResponse.ok) {
      throw new Error('生成提示词失败');
    }

    const promptData = await promptResponse.json();
    generatedPrompt.value = promptData.prompt;
    console.log('✅ 提示词生成成功');

    currentStep.value = 2;

    // 第二步：生成图片
    console.log('🖼️ 开始生成图片...');
    const imageResponse = await fetch('/api/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: generatedPrompt.value,
      }),
    });

    if (!imageResponse.ok) {
      const errorData = await imageResponse.json();
      throw new Error(errorData.message || '生成图片失败');
    }

    const imageData = await imageResponse.json();
    imageUrl.value = imageData.imageUrl;
    console.log('✅ 图片生成成功');

    currentStep.value = 3;
    MessagePlugin.success('速记卡片生成成功！');
  } catch (err) {
    console.error('❌ 生成失败:', err);
    error.value = err.message || '生成速记卡片时发生错误，请稍后再试';
    MessagePlugin.error(error.value);
  } finally {
    loading.value = false;
  }
};

const handleRetry = () => {
  error.value = '';
  imageUrl.value = '';
  generatedPrompt.value = '';
  currentStep.value = 0;
  generateQuickNote();
};

const handleDownload = () => {
  if (!imageUrl.value) return;
  
  // 创建一个临时链接来下载图片
  const link = document.createElement('a');
  link.href = imageUrl.value;
  link.download = `旅行速记卡片-${store.form.destination}-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  MessagePlugin.success('图片下载成功！');
};

onMounted(() => {
  // 页面加载时自动开始生成
  generateQuickNote();
});
</script>

<style scoped>
.quick-note-container {
  padding: 24px;
  min-height: calc(100vh - var(--header-height));
  background: transparent;
}

.quick-note-card {
  max-width: 1200px;
  margin: 0 auto;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: none;
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
}

.quick-note-card :deep(.t-card__body) {
  padding: 32px;
}

.quick-note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.quick-note-title {
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 40px;
}

.loading-steps {
  display: flex;
  gap: 40px;
  align-items: center;
}

.loading-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.3;
  transition: all 0.3s ease;
}

.loading-step.active {
  opacity: 1;
}

.loading-step .t-icon {
  font-size: 32px;
  color: var(--td-brand-color);
}

.loading-step span {
  font-size: 14px;
  color: var(--text-secondary);
}

.error-container,
.initial-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.result-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.result-actions {
  display: flex;
  gap: 12px;
}

.image-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.result-image {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.prompt-collapse {
  background: rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  overflow: hidden;
}

.prompt-collapse :deep(.t-collapse-panel) {
  background: transparent;
  border: none;
}

.prompt-content {
  padding: 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
}

@media (max-width: 768px) {
  .quick-note-container {
    padding: 16px;
  }

  .quick-note-card :deep(.t-card__body) {
    padding: 20px;
  }

  .quick-note-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .loading-steps {
    flex-direction: column;
    gap: 20px;
  }

  .result-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

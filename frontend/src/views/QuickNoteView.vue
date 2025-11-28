<template>
  <div class="quick-note-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">
          <t-icon name="image" />
          AI速记卡片生成
        </h1>
        <p class="page-subtitle">将您的旅行计划转化为精美的视觉卡片</p>
      </div>
      <div class="header-actions">
        <!-- 提供商选择 -->
        <div class="provider-selector" v-if="providers.length > 1">
          <span class="provider-label">图片引擎:</span>
          <t-select 
            v-model="selectedProvider" 
            size="small"
            :disabled="loading"
            class="provider-select"
          >
            <t-option 
              v-for="p in providers" 
              :key="p.id" 
              :value="p.id"
              :label="p.name"
            >
              <div class="provider-option">
                <t-icon :name="p.icon" />
                <span>{{ p.name }}</span>
              </div>
            </t-option>
          </t-select>
        </div>
        <GlassButton 
          icon="arrow-left"
          @click="handleBack"
          size="sm"
          theme="dark"
        >
          返回
        </GlassButton>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <div class="loading-card">
          <div class="loading-animation">
            <div class="loading-circle"></div>
            <div class="loading-circle delay-1"></div>
            <div class="loading-circle delay-2"></div>
          </div>
          <h3 class="loading-title">正在创作中...</h3>
          <p class="loading-subtitle">使用 {{ currentProviderName }} 生成您的专属旅行速记卡片</p>
          
          <div class="loading-steps">
            <div class="loading-step" :class="{ active: currentStep >= 1, completed: currentStep > 1 }">
              <div class="step-icon">
                <t-icon :name="currentStep > 1 ? 'check' : 'edit'" />
              </div>
              <span class="step-label">生成提示词</span>
            </div>
            <div class="step-line" :class="{ active: currentStep > 1 }"></div>
            <div class="loading-step" :class="{ active: currentStep >= 2, completed: currentStep > 2 }">
              <div class="step-icon">
                <t-icon :name="currentStep > 2 ? 'check' : 'image'" />
              </div>
              <span class="step-label">AI绘图</span>
            </div>
            <div class="step-line" :class="{ active: currentStep > 2 }"></div>
            <div class="loading-step" :class="{ active: currentStep >= 3 }">
              <div class="step-icon">
                <t-icon name="check-circle" />
              </div>
              <span class="step-label">完成</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-container">
        <div class="error-card">
          <div class="error-icon">
            <t-icon name="close-circle" />
          </div>
          <h3 class="error-title">生成失败</h3>
          <p class="error-message">{{ error }}</p>
          <div class="error-actions">
            <GlassButton @click="handleRetry" icon="refresh" theme="primary">
              重新尝试
            </GlassButton>
            <GlassButton @click="handleBack" icon="arrow-left" theme="light">
              返回上页
            </GlassButton>
          </div>
        </div>
      </div>

      <!-- 成功显示图片 -->
      <div v-else-if="imageUrl" class="result-container">
        <div class="result-header">
          <div class="result-info">
            <h2 class="result-title">🎉 您的专属旅行速记卡片</h2>
            <t-tag theme="primary" variant="light" class="provider-tag">
              <t-icon :name="currentProviderIcon" />
              {{ currentProviderName }}
            </t-tag>
          </div>
          <div class="result-actions">
            <GlassButton @click="handleDownload" icon="download" theme="primary">
              下载图片
            </GlassButton>
            <GlassButton @click="handleRetry" icon="refresh" theme="light">
              重新生成
            </GlassButton>
          </div>
        </div>
        
        <div class="image-wrapper">
          <div class="image-container">
            <img :src="imageUrl" alt="旅行速记卡片" class="result-image" />
          </div>
        </div>

        <!-- 显示生成的提示词 -->
        <t-collapse v-if="generatedPrompt" class="prompt-collapse">
          <t-collapse-panel value="prompt" header="🔍 查看生成的提示词">
            <div class="prompt-content">
              {{ generatedPrompt }}
            </div>
          </t-collapse-panel>
        </t-collapse>
      </div>

      <!-- 初始状态 -->
      <div v-else class="initial-container">
        <div class="initial-card">
          <div class="initial-icon">
            <t-icon name="image" />
          </div>
          <h3 class="initial-title">准备生成速记卡片</h3>
          <p class="initial-subtitle">点击下方按钮，AI将为您的旅行计划生成精美的视觉卡片</p>
          <GlassButton @click="generateQuickNote" icon="palette" theme="primary" size="lg">
            开始生成
          </GlassButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
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
const usedProvider = ref(''); // 实际使用的提供商

// 提供商相关
const providers = ref([]);
const selectedProvider = ref('');
const defaultProvider = ref('');

// 计算属性
const currentProviderName = computed(() => {
  const provider = providers.value.find(p => p.id === (usedProvider.value || selectedProvider.value));
  return provider?.name || '未知';
});

const currentProviderIcon = computed(() => {
  const provider = providers.value.find(p => p.id === (usedProvider.value || selectedProvider.value));
  return provider?.icon || 'cloud';
});

const handleBack = () => {
  router.back();
};

// 获取可用的图片生成提供商
const fetchProviders = async () => {
  try {
    const response = await fetch('/api/image-providers');
    if (response.ok) {
      const data = await response.json();
      providers.value = data.providers || [];
      defaultProvider.value = data.default || '';
      selectedProvider.value = data.default || (providers.value[0]?.id || '');
      console.log('📋 可用图片生成提供商:', providers.value.map(p => p.id).join(', '));
    }
  } catch (err) {
    console.warn('获取提供商列表失败，使用默认值');
    // 默认提供商
    providers.value = [
      { id: 'hunyuan', name: '腾讯混元', icon: 'cloud' },
      { id: 'modelscope', name: '魔搭社区', icon: 'app' }
    ];
    selectedProvider.value = 'hunyuan';
  }
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
  usedProvider.value = selectedProvider.value;

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

    // 第二步：生成图片（带提供商选择）
    console.log(`🖼️ 开始使用 ${selectedProvider.value} 生成图片...`);
    const imageResponse = await fetch('/api/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: generatedPrompt.value,
        provider: selectedProvider.value,
      }),
    });

    if (!imageResponse.ok) {
      const errorData = await imageResponse.json();
      throw new Error(errorData.message || '生成图片失败');
    }

    const imageData = await imageResponse.json();
    imageUrl.value = imageData.imageUrl;
    usedProvider.value = imageData.provider || selectedProvider.value;
    console.log(`✅ 图片生成成功 (提供商: ${usedProvider.value})`);

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
  // 先获取提供商列表，再自动开始生成
  fetchProviders().then(() => {
    generateQuickNote();
  });
});
</script>

<style scoped>
.quick-note-container {
  min-height: calc(100vh - var(--header-height));
  background: transparent;
}

/* === 页面头部 === */
.page-header {
  background: linear-gradient(135deg, var(--td-brand-color-8, #0052d9) 0%, var(--td-brand-color-6, #0066cc) 30%, var(--td-brand-color-4, #3399ff) 70%, var(--td-brand-color-2, #66b8ff) 100%);
  padding: 32px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
  position: relative;
  overflow: hidden;
}

.page-header::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 60%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  pointer-events: none;
}

.header-content {
  position: relative;
  z-index: 1;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: white;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.page-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  position: relative;
  z-index: 1;
}

.provider-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.provider-label {
  font-size: 14px;
  color: white;
  white-space: nowrap;
  font-weight: 500;
}

.provider-select {
  min-width: 140px;
}

.provider-select :deep(.t-input) {
  background: rgba(255, 255, 255, 0.9) !important;
  border-radius: 8px !important;
  border: none !important;
}

.provider-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* === 主内容区 === */
.main-content {
  padding: 32px 24px;
  max-width: 1200px;
  margin: 0 auto;
}

/* === 加载状态 === */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 500px;
}

.loading-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 24px;
  padding: 48px;
  text-align: center;
  box-shadow: var(--glass-shadow);
  max-width: 500px;
  width: 100%;
}

.loading-animation {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.loading-circle {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--td-brand-color) 0%, var(--td-brand-color-6) 100%);
  animation: bounce 1.4s infinite ease-in-out;
}

.loading-circle.delay-1 {
  animation-delay: 0.16s;
}

.loading-circle.delay-2 {
  animation-delay: 0.32s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1.2);
    opacity: 1;
  }
}

.loading-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.loading-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
}

.loading-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
}

.loading-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.4;
  transition: all 0.3s ease;
}

.loading-step.active {
  opacity: 1;
}

.loading-step.completed .step-icon {
  background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
}

.step-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--td-brand-color) 0%, var(--td-brand-color-6) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(0, 132, 255, 0.3);
  transition: all 0.3s ease;
}

.step-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.step-line {
  width: 60px;
  height: 3px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  margin: 0 12px 28px;
  transition: all 0.3s ease;
}

.step-line.active {
  background: linear-gradient(90deg, #52c41a 0%, #73d13d 100%);
}

/* === 错误状态 === */
.error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 500px;
}

.error-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 24px;
  padding: 48px;
  text-align: center;
  box-shadow: var(--glass-shadow);
  max-width: 450px;
  width: 100%;
}

.error-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  color: white;
  font-size: 40px;
  box-shadow: 0 8px 24px rgba(255, 77, 79, 0.3);
}

.error-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.error-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
  line-height: 1.6;
}

.error-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* === 成功结果 === */
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
  padding: 24px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
}

.result-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.result-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.provider-tag {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 4px 12px !important;
  font-size: 13px !important;
}

.result-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.image-wrapper {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--glass-shadow);
}

.image-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 16px;
  padding: 16px;
  min-height: 400px;
}

.result-image {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  transition: transform 0.3s ease;
}

.result-image:hover {
  transform: scale(1.02);
}

.prompt-collapse {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--glass-shadow);
}

.prompt-collapse :deep(.t-collapse-panel) {
  background: transparent !important;
  border: none !important;
}

.prompt-collapse :deep(.t-collapse-panel__header) {
  padding: 16px 20px !important;
  font-weight: 500 !important;
}

.prompt-content {
  padding: 16px 20px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  margin: 0 20px 20px;
}

/* === 初始状态 === */
.initial-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 500px;
}

.initial-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 24px;
  padding: 64px 48px;
  text-align: center;
  box-shadow: var(--glass-shadow);
  max-width: 450px;
  width: 100%;
}

.initial-icon {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--td-brand-color-2) 0%, var(--td-brand-color-4) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  color: var(--td-brand-color);
  font-size: 48px;
}

.initial-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.initial-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
  line-height: 1.6;
}

/* === 响应式 === */
@media (max-width: 768px) {
  .page-header {
    padding: 24px 16px;
    flex-direction: column;
    align-items: flex-start;
  }

  .page-title {
    font-size: 24px;
  }

  .main-content {
    padding: 20px 16px;
  }

  .loading-card,
  .error-card,
  .initial-card {
    padding: 32px 24px;
  }

  .loading-steps {
    flex-direction: column;
    gap: 16px;
  }

  .step-line {
    width: 3px;
    height: 30px;
    margin: 0;
  }

  .result-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .result-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .result-actions {
    width: 100%;
    justify-content: stretch;
  }

  .result-actions .glass-button {
    flex: 1;
  }
}
</style>

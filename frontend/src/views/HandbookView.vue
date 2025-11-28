<template>
  <div class="postcard-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">
          <t-icon name="postcard" />
          旅游明信片
        </h1>
        <p class="page-subtitle">为您的旅程生成风景明信片设计，定制专属记忆</p>
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

    <!-- 风格预览卡片 -->
    <div class="style-preview-section" v-if="!loading && !imageUrl && !error">
      <div class="style-cards">
        <div 
          v-for="style in artStyles" 
          :key="style.id"
          class="style-card"
          :class="{ active: selectedStyle === style.id }"
          @click="selectedStyle = style.id"
        >
          <div class="style-card-name">{{ style.name }}</div>
          <div class="style-card-desc">{{ style.description }}</div>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <div class="loading-card">
          <div class="loading-animation">
            <div class="loading-brush">🖌️</div>
          </div>
          <h3 class="loading-title">正在绘制您的专属旅游明信片...</h3>
          <p class="loading-subtitle">
            <span class="style-badge">{{ currentStyleName }}</span> 风格
            · 使用 {{ currentProviderName }}
          </p>
          
          <div class="loading-steps">
            <div class="loading-step" :class="{ active: currentStep >= 1, completed: currentStep > 1 }">
              <div class="step-icon">
                <t-icon :name="currentStep > 1 ? 'check' : 'edit'" />
              </div>
              <span class="step-label">生成创意</span>
            </div>
            <div class="step-line" :class="{ active: currentStep > 1 }"></div>
            <div class="loading-step" :class="{ active: currentStep >= 2, completed: currentStep > 2 }">
              <div class="step-icon">
                <t-icon :name="currentStep > 2 ? 'check' : 'palette'" />
              </div>
              <span class="step-label">AI绘制</span>
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
            <h2 class="result-title">🎨 您的专属旅游明信片</h2>
            <div class="result-tags">
              <t-tag theme="success" variant="light" class="style-tag">
                {{ currentStyleEmoji }} {{ currentStyleName }}
              </t-tag>
              <t-tag theme="primary" variant="light" class="provider-tag">
                <t-icon :name="currentProviderIcon" />
                {{ currentProviderName }}
              </t-tag>
            </div>
          </div>
          <div class="result-actions">
            <GlassButton @click="handleDownload" icon="download" theme="primary">
              下载明信片
            </GlassButton>
            <GlassButton @click="handleRetry" icon="refresh" theme="light">
              换个风格
            </GlassButton>
          </div>
        </div>
        
        <div class="image-wrapper">
          <div class="image-container">
            <img :src="imageUrl" alt="旅游明信片" class="result-image" />
          </div>
          <!-- 装饰元素 -->
          <div class="decoration-corner top-left">✿</div>
          <div class="decoration-corner top-right">❀</div>
          <div class="decoration-corner bottom-left">✾</div>
          <div class="decoration-corner bottom-right">❁</div>
        </div>

        <!-- 显示生成的提示词 -->
        <t-collapse v-if="generatedPrompt" class="prompt-collapse">
          <t-collapse-panel value="prompt" header="🎭 查看创意提示词">
            <div class="prompt-content">
              {{ generatedPrompt }}
            </div>
          </t-collapse-panel>
        </t-collapse>

        <!-- 打印提示 -->
        <div class="print-tip">
          <t-icon name="print" />
          <span>提示：此明信片设计支持高清打印，建议使用 A4 纸张获得最佳效果</span>
        </div>
      </div>

      <!-- 初始状态 -->
      <div v-else class="initial-container">
        <div class="initial-card">
          <div class="initial-icon">
            <span>🎨</span>
          </div>
          <h3 class="initial-title">选择艺术风格，开始创作</h3>
          <p class="initial-subtitle">
            基于您的旅行计划，AI将为您生成独一无二的旅游明信片设计
          </p>
          <GlassButton @click="generatePostcard" icon="palette" theme="primary" size="lg">
            开始创作
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
const usedProvider = ref('');
const usedStyle = ref('');

// 艺术风格选项
const artStyles = ref([
  {
    id: 'xiangxiu',
    name: '湖南湘绣风',
    description: '传统湘绣针法艺术，丝线交织的华美图案',
    promptSuffix: '湖南湘绣艺术风格，精致的刺绣针法纹理，丝线交织的华美图案，传统湘绣配色（红、绿、蓝、紫），绣面质感，中国传统工艺美学'
  },
  {
    id: 'zhangjiajie',
    name: '张家界水墨风',
    description: '云雾缭绕的奇峰，写意山水画意境',
    promptSuffix: '张家界水墨画风格，云雾缭绕的奇峰异石，中国传统山水画意境，写意泼墨技法，黑白灰层次分明，留白艺术，空灵禅意'
  },
  {
    id: 'mawangdui',
    name: '长沙瓷器彩绘风',
    description: '长沙窑彩绘陶瓷，古雅精致的色彩',
    promptSuffix: '长沙瓷器彩绘风格，长沙窑古陶瓷艺术，青绿釉彩配色，精致的彩绘纹样，传统陶瓷工艺美学，品茶赏花的古雅意境，陶瓷质感纹理'
  },
  {
    id: 'dongting',
    name: '油画印象风',
    description: '欧洲油画风格，色彩层次丰富',
    promptSuffix: '油画印象风格，厚涂油画质感，笔触明显，色彩饱和度高，光影对比强烈，欧洲古典油画美学，适合打印收藏，高级艺术感'
  },
  {
    id: 'changsha',
    name: '古风插画风',
    description: '古典美女插画，诗意唯美的东方风',
    promptSuffix: '古风插画风格，古典美女形象，中国传统服饰，唯美诗意的构图，淡雅水彩笔触，琴棋书画等文化元素，柔和的色调搭配，民国风情与古典美学融合'
  }
]);

const selectedStyle = ref('xiangxiu');

// 提供商相关
const providers = ref([]);
const selectedProvider = ref('');
const defaultProvider = ref('');

// 计算属性
const currentStyleName = computed(() => {
  const style = artStyles.value.find(s => s.id === (usedStyle.value || selectedStyle.value));
  return style?.name || '未知';
});

const currentStyleEmoji = computed(() => {
  const style = artStyles.value.find(s => s.id === (usedStyle.value || selectedStyle.value));
  return style?.emoji || '🎨';
});

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
    providers.value = [
      { id: 'hunyuan', name: '腾讯混元', icon: 'cloud' },
      { id: 'modelscope', name: '魔搭社区', icon: 'app' }
    ];
    selectedProvider.value = 'hunyuan';
  }
};

const generatePostcard = async () => {
  if (!store.plan || !store.form) {
    MessagePlugin.warning('请先生成旅行计划');
    router.push({ name: 'Planner' });
    return;
  }

  loading.value = true;
  error.value = '';
  currentStep.value = 1;
  usedProvider.value = selectedProvider.value;
  usedStyle.value = selectedStyle.value;

  // 获取选中的风格信息
  const styleInfo = artStyles.value.find(s => s.id === selectedStyle.value);

  try {
    // 第一步：生成文创风格的提示词
    console.log(`🎨 开始生成 ${styleInfo?.name} 风格的旅游明信片提示词...`);
    const promptResponse = await fetch('/api/generate-postcard-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: store.form.destination,
        duration: store.form.duration,
        dailyItinerary: store.plan.daily_itinerary,
        style: styleInfo?.id,
        styleName: styleInfo?.name,
        styleSuffix: styleInfo?.promptSuffix,
      }),
    });

    if (!promptResponse.ok) {
      throw new Error('生成创意提示词失败');
    }

    const promptData = await promptResponse.json();
    generatedPrompt.value = promptData.prompt;
    console.log('✅ 创意提示词生成成功');

    currentStep.value = 2;

    // 第二步：生成图片
    console.log(`🖼️ 开始使用 ${selectedProvider.value} 绘制明信片...`);
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
    console.log(`✅ 明信片生成成功 (提供商: ${usedProvider.value})`);

    currentStep.value = 3;
    MessagePlugin.success('明信片生成成功！');
  } catch (err) {
    console.error('❌ 生成失败:', err);
    error.value = err.message || '生成明信片时发生错误，请稍后再试';
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
};

const handleDownload = () => {
  if (!imageUrl.value) return;
  
  const styleName = currentStyleName.value.replace(/风$/, '');
  const link = document.createElement('a');
  link.href = imageUrl.value;
  link.download = `旅游明信片-${store.form.destination}-${styleName}-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  MessagePlugin.success('明信片下载成功！');
};

onMounted(() => {
  fetchProviders();
});
</script>

<style scoped>
.postcard-container {
  min-height: calc(100vh - var(--header-height));
  background: transparent;
}

/* === 页面头部 === */
.page-header {
  background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 30%, #c084fc 70%, #e879f9 100%);
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
  background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
  pointer-events: none;
}

.page-header::after {
  content: '✿ ❀ ✾ ❁';
  position: absolute;
  bottom: 10px;
  right: 20px;
  font-size: 24px;
  opacity: 0.3;
  letter-spacing: 8px;
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
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.page-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.95);
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

.style-selector,
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

.style-label,
.provider-label {
  font-size: 14px;
  color: white;
  white-space: nowrap;
  font-weight: 500;
}

.style-select,
.provider-select {
  min-width: 140px;
}

.style-select :deep(.t-input),
.provider-select :deep(.t-input) {
  background: rgba(255, 255, 255, 0.9) !important;
  border-radius: 8px !important;
  border: none !important;
}

.style-option,
.provider-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.style-emoji {
  font-size: 16px;
}

/* === 风格预览卡片 === */
.style-preview-section {
  padding: 24px;
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%);
}

.style-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin: 0 auto;
}

.style-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 16px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
  box-shadow: var(--glass-shadow);
}

.style-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(139, 92, 246, 0.2);
}

.style-card.active {
  border-color: #8b5cf6;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
}

.style-card-emoji {
  font-size: 40px;
  margin-bottom: 12px;
}

.style-card-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.style-card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* === 主内容区 === */
.main-content {
  padding: 32px 24px;
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
  margin-bottom: 24px;
}

.loading-brush {
  font-size: 64px;
  animation: paint 2s ease-in-out infinite;
}

@keyframes paint {
  0%, 100% {
    transform: rotate(-15deg) translateX(0);
  }
  25% {
    transform: rotate(15deg) translateX(10px);
  }
  50% {
    transform: rotate(-15deg) translateX(-10px);
  }
  75% {
    transform: rotate(15deg) translateX(10px);
  }
}

.loading-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.loading-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
}

.style-badge {
  display: inline-block;
  padding: 4px 12px;
  background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
  color: white;
  border-radius: 20px;
  font-weight: 500;
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
  background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
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
  flex-direction: column;
  gap: 12px;
}

.result-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.result-tags {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.style-tag,
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
  padding: 32px;
  box-shadow: var(--glass-shadow);
  position: relative;
}

.decoration-corner {
  position: absolute;
  font-size: 24px;
  opacity: 0.5;
  color: #8b5cf6;
}

.decoration-corner.top-left {
  top: 12px;
  left: 12px;
}

.decoration-corner.top-right {
  top: 12px;
  right: 12px;
}

.decoration-corner.bottom-left {
  bottom: 12px;
  left: 12px;
}

.decoration-corner.bottom-right {
  bottom: 12px;
  right: 12px;
}

.image-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
  border-radius: 16px;
  padding: 16px;
  min-height: 400px;
}

.result-image {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(139, 92, 246, 0.2);
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
  background: rgba(139, 92, 246, 0.05);
  border-radius: 8px;
  margin: 0 20px 20px;
}

.print-tip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
  border-radius: 12px;
  color: #6b21a8;
  font-size: 14px;
}

/* === 初始状态 === */
.initial-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
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
  font-size: 80px;
  margin-bottom: 24px;
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
  margin: 0 0 24px 0;
  line-height: 1.6;
}

.style-badges {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 32px;
}

.style-mini-badge {
  font-size: 24px;
  padding: 8px;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 12px;
  transition: transform 0.2s ease;
}

.style-mini-badge:hover {
  transform: scale(1.2);
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

  .header-actions {
    flex-direction: column;
    width: 100%;
  }

  .style-selector,
  .provider-selector {
    width: 100%;
    justify-content: space-between;
  }

  .style-preview-section {
    padding: 16px;
  }

  .style-cards {
    grid-template-columns: repeat(2, 1fr);
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

  .result-actions {
    width: 100%;
    justify-content: stretch;
  }

  .result-actions .glass-button {
    flex: 1;
  }
}
</style>

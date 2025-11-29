<template>
  <div class="share-content-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">
          <t-icon name="edit" />
          妙笔·云章
        </h1>
        <p class="page-subtitle">基于AI生成技术，为您的旅程创作精美的分享文案，记录精彩瞬间</p>
      </div>
      <div class="header-actions">
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
      <!-- 初始状态 -->
      <div v-if="!showConfig && !loading && !shareContent && !error" class="initial-container">
        <div class="initial-card">
          <div class="initial-icon">
            <span>✍️</span>
          </div>
          <h3 class="initial-title">AI分享文案生成器</h3>
          <p class="initial-subtitle">
            基于您的旅行计划，AI将为您创作独一无二的社交媒体分享文案，记录旅程中的精彩瞬间
          </p>
          <GlassButton @click="showConfig = true" icon="edit" theme="primary" size="lg">
            开始创作
          </GlassButton>
        </div>
      </div>
      
      <!-- 配置区域 - 替代模态框 -->
      <div v-if="showConfig && !loading && !shareContent" class="initial-container">
        <div class="config-card">
          <div class="config-header">
            <h3 class="config-title">✍️ 分享文案配置</h3>
            <GlassButton 
              icon="close" 
              @click="showConfig = false" 
              size="sm" 
              theme="light"
            >
              取消
            </GlassButton>
          </div>
          
          <div class="share-config">
            <div class="config-group">
              <label class="config-label">分享平台</label>
              <div class="platform-buttons">
                <button
                  v-for="p in platforms"
                  :key="p.id"
                  :class="['platform-btn', { active: selectedPlatform === p.id }]"
                  @click="selectedPlatform = p.id"
                  :disabled="loading"
                >
                  <span class="platform-icon">{{ p.icon }}</span>
                  <span class="platform-name">{{ p.name }}</span>
                </button>
              </div>
            </div>
            
            <div class="config-group">
              <label class="config-label">文案风格</label>
              <div class="emotion-buttons">
                <button
                  v-for="e in emotions"
                  :key="e.id"
                  :class="['emotion-btn', { active: selectedEmotion === e.id }]"
                  @click="selectedEmotion = e.id"
                  :disabled="loading"
                >
                  <span class="emotion-icon">{{ e.icon }}</span>
                  <span class="emotion-name">{{ e.name }}</span>
                </button>
              </div>
            </div>

            <div class="config-group">
              <label class="config-label">重点地点（可选）</label>
              <t-input
                v-model="shareHighlights"
                placeholder="如：解放西、橘子洲、茶颜悦色（逗号分隔）"
                :disabled="loading"
              />
            </div>

            <div class="config-actions">
              <GlassButton 
                @click="generateShareContent"
                :loading="loading"
                size="lg"
                theme="primary"
                class="generate-btn"
              >
                {{ loading ? '生成中...' : '生成文案' }}
              </GlassButton>
              <GlassButton 
                @click="showConfig = false"
                :disabled="loading"
                size="lg"
                theme="light"
                class="cancel-btn"
              >
                取消
              </GlassButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 分享内容展示 -->
      <div v-else-if="shareContent && !loading && !error" class="content-display">
        <div class="content-header">
          <div class="content-info">
            <h2 class="content-title">🎉 您的专属分享文案</h2>
            <t-tag theme="primary" variant="light" class="platform-tag">
              <t-icon :name="platformIcon" />
              {{ shareContent.platformName }}
            </t-tag>
            <t-tag theme="success" variant="light" class="emotion-tag">
              {{ shareContent.emotion }}
            </t-tag>
          </div>
          <div class="content-actions">
            <GlassButton 
              icon="download"
              @click="downloadContent"
              size="sm"
            >
              保存文案
            </GlassButton>
            <GlassButton 
              icon="share"
              @click="copyContent"
              size="sm"
            >
              复制文案
            </GlassButton>
            <GlassButton 
              icon="refresh"
              @click="showConfig = true"
              size="sm"
            >
              重新生成
            </GlassButton>
          </div>
        </div>

        <div class="content-body">
          <div class="content-text">{{ shareContent.content }}</div>
          <div class="content-meta">
            <span class="meta-item">生成时间：{{ formatTime(shareContent.timestamp) }}</span>
            <span class="meta-item">目的地：{{ shareContent.destination || store.form?.destination }}</span>
          </div>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-else-if="loading && !shareContent" class="loading-container">
        <div class="loading-card">
          <div class="loading-animation">
            <div class="loading-circle"></div>
            <div class="loading-circle delay-1"></div>
            <div class="loading-circle delay-2"></div>
          </div>
          <h3 class="loading-title">正在生成分享文案...</h3>
          <p class="loading-subtitle">
            <span class="style-badge">{{ selectedEmotionText }}</span> 风格
            · 针对 {{ selectedPlatformText }} 平台
          </p>
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
            <GlassButton @click="showShareModal = true" icon="refresh" theme="primary">
              重新尝试
            </GlassButton>
            <GlassButton @click="handleBack" icon="arrow-left" theme="light">
              返回上页
            </GlassButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 分享内容生成模态框 -->
    <t-dialog
      v-model:visible="showShareModal"
      header="✍️ 旅行分享文案"
      width="900px"
      :close-btn="true"
      @close="showShareModal = false"
    >
      <div class="share-modal-container">
        <!-- 配置区域 -->
        <div class="share-config">
          <div class="config-group">
            <label class="config-label">发布平台</label>
            <div class="platform-buttons">
              <button
                v-for="p in platforms"
                :key="p.id"
                :class="['platform-btn', { active: selectedPlatform === p.id }]"
                @click="selectedPlatform = p.id"
                :disabled="loading"
              >
                <span class="platform-icon">{{ p.icon }}</span>
                <span class="platform-name">{{ p.name }}</span>
              </button>
            </div>
          </div>

          <div class="config-group">
            <label class="config-label">内容风格</label>
            <div class="emotion-buttons">
              <button
                v-for="e in emotions"
                :key="e.id"
                :class="['emotion-btn', { active: selectedEmotion === e.id }]"
                @click="selectedEmotion = e.id"
                :disabled="loading"
              >
                <span class="emotion-icon">{{ e.icon }}</span>
                <span class="emotion-name">{{ e.name }}</span>
              </button>
            </div>
          </div>

          <div class="config-group">
            <label class="config-label">重点地点（可选）</label>
            <t-input
              v-model="shareHighlights"
              placeholder="如：解放西、橘子洲、茶颜悦色（逗号分隔）"
              :disabled="loading"
            />
          </div>

          <div class="config-actions">
            <t-button
              theme="primary"
              @click="generateShareContent"
              :loading="loading"
              size="large"
              class="generate-btn"
            >
              {{ loading ? '生成中...' : '生成文案' }}
            </t-button>
          </div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlannerStore } from '../stores/planner';
import { MessagePlugin } from 'tdesign-vue-next';
import GlassButton from '../components/GlassButton.vue';

const router = useRouter();
const store = usePlannerStore();

const showConfig = ref(false);
const loading = ref(false);
const error = ref('');
const shareContent = ref(null);
const shareHighlights = ref('');

const platforms = [
  { id: 'xiaohongshu', name: '小红书', icon: '📖' },
  { id: 'moments', name: '朋友圈', icon: '👥' },
  { id: 'douyin', name: '抖音', icon: '🎬' }
];

const emotions = [
  { id: '种草', name: '种草', icon: '🌱' },
  { id: '治愈', name: '治愈', icon: '😌' },
  { id: '攻略', name: '攻略', icon: '📚' },
  { id: 'emo', name: 'emo', icon: '🎭' },
  { id: '吐槽', name: '吐槽', icon: '😂' }
];

const selectedPlatform = ref('xiaohongshu');
const selectedEmotion = ref('种草');

// 自动提取行程中的地点
const extractHighlights = () => {
  const highlights = new Set();
  if (store.plan?.daily_itinerary) {
    store.plan.daily_itinerary.forEach(day => {
      if (day.activities && Array.isArray(day.activities)) {
        day.activities.forEach(activity => {
          if (activity.location) {
            highlights.add(activity.location);
          }
        });
      }
    });
  }
  return Array.from(highlights).join('、');
};

// 计算当前选择的平台和风格文本
const selectedPlatformText = computed(() => {
  const platform = platforms.find(p => p.id === selectedPlatform.value);
  return platform?.name || '';
});

const selectedEmotionText = computed(() => {
  const emotion = emotions.find(e => e.id === selectedEmotion.value);
  return emotion?.name || '';
});

// 计算当前平台的图标
const platformIcon = computed(() => {
  const platform = platforms.find(p => p.id === (shareContent.value?.platform || selectedPlatform.value));
  return platform?.icon || '📖';
});

const handleBack = () => {
  router.back();
};

const generateShareContent = async () => {
  if (!store.plan || !store.form) {
    MessagePlugin.warning('请先生成旅行计划');
    router.push({ name: 'Planner' });
    return;
  }

  loading.value = true;
  error.value = '';
  shareContent.value = null;

  try {
    const highlightsArray = shareHighlights.value
      .split('，')
      .concat(shareHighlights.value.split(','))
      .filter(h => h.trim())
      .map(h => h.trim());

    const response = await fetch('/api/generate-share-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: store.form.destination,
        duration: store.form.duration,
        dailyItinerary: store.plan.daily_itinerary,
        platform: selectedPlatform.value,
        emotion: selectedEmotion.value,
        highlights: highlightsArray
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '生成失败');
    }

    const data = await response.json();
    shareContent.value = data;
    showConfig.value = false;
    MessagePlugin.success('分享文案生成成功！');
  } catch (err) {
    error.value = err.message || '生成分享文案时发生错误';
    console.error('Error generating share content:', err);
  } finally {
    loading.value = false;
  }
};

const downloadContent = () => {
  if (!shareContent.value) return;

  const element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(shareContent.value.content)
  );
  element.setAttribute(
    'download',
    `${shareContent.value.destination || store.form?.destination}-${shareContent.value.platformName}-分享文案.txt`
  );
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);

  MessagePlugin.success('文案已下载');
};

const copyContent = () => {
  if (!shareContent.value?.content) return;

  navigator.clipboard.writeText(shareContent.value.content).then(() => {
    MessagePlugin.success('文案已复制到剪贴板');
  }).catch(() => {
    MessagePlugin.error('复制失败，请手动选择复制');
  });
};

// 监听配置区域显示状态，自动填充地点
watch(showConfig, (newVal) => {
  if (newVal) {
    shareHighlights.value = extractHighlights();
  }
});

// 页面加载时初始化
onMounted(() => {
  // 提前初始化地点信息
  const highlights = extractHighlights();
  if (highlights) {
    shareHighlights.value = highlights;
  }
});

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    console.warn('时间格式化失败:', e);
    return '';
  }
};
</script>

<style scoped>
.share-content-container {
  min-height: calc(100vh - var(--header-height));
  background: transparent;
}

/* === 页面头部 === */
.page-header {
  background: linear-gradient(135deg, #10b981 0%, #059669 30%, #047857 70%, #065f46 100%);
  padding: 32px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
  position: relative;
  overflow: hidden;
  margin-top: 24px;
  border-radius: 24px;
  box-shadow: 0 4px 24px rgba(16, 185, 129, 0.3);
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

/* === 主内容区 === */
.main-content {
  padding: 40px 24px 32px 24px;
  max-width: 1200px;
  margin: 0 auto;
}

/* === 初始状态 === */
.initial-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 500px;
  margin-bottom: 40px;
}

.initial-card, .config-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 24px;
  padding: 64px 48px;
  box-shadow: var(--glass-shadow);
  max-width: 1200px;
  width: 100%;
}

/* 初始卡片特定样式：确保内容居中 */
.initial-card {
  text-align: center;
}

.initial-card .glass-button {
  margin: 0 auto;
}

.initial-icon {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981 0%, #059669 30%, #047857 70%, #065f46 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  color: white;
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

/* === 内容展示 === */
.content-display {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.content-header {
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

.content-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.content-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.platform-tag, .emotion-tag {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 4px 12px !important;
  font-size: 13px !important;
}

.content-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.content-body {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 16px;
  padding: 24px;
  box-shadow: var(--glass-shadow);
}

.content-text {
  font-size: 16px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  margin-bottom: 20px;
}

.content-meta {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: var(--text-secondary);
  padding-top: 16px;
  border-top: 1px solid var(--td-border-level-1-color);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
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
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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

.style-badge {
  background: rgba(16, 185, 129, 0.1);
  color: #047857;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
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

/* === 模态框样式 === */
.share-modal-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px;
}

.share-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.05) 100%);
  border-radius: 12px;
  border: 1px solid rgba(16, 185, 129, 0.15);
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.config-label {
  font-weight: 600;
  color: var(--td-text-color-primary);
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.platform-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
  flex-wrap: wrap;
}

.platform-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 100px;
  padding: 16px 12px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.08) 100%);
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.platform-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
  border-color: rgba(16, 185, 129, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.2);
}

.platform-btn.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-color: #10b981;
  color: white;
  box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
}

.platform-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.platform-icon {
  font-size: 24px;
}

.platform-name {
  font-size: 13px;
  font-weight: 500;
}

.emotion-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 12px;
  flex-wrap: wrap;
}

.emotion-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 80px;
  padding: 16px 12px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.08) 100%);
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.emotion-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
  border-color: rgba(16, 185, 129, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.2);
}

.emotion-btn.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-color: #10b981;
  color: white;
  box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
}

.emotion-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emotion-icon {
  font-size: 24px;
}

.emotion-name {
  font-size: 13px;
  font-weight: 500;
}

.config-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.generate-btn {
  width: 100%;
  font-size: 16px;
}

/* === 配置区域 === */
.config-section {
  max-width: 900px;
  margin: 0 auto;
  animation: fadeInUp 0.4s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.config-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-radius: 24px;
  padding: 64px 48px;
  box-shadow: var(--glass-shadow);
  max-width: 1200px;
  width: 100%;
}

.config-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 24px;
  position: relative;
}

.config-header .glass-button {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}

.config-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.config-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 32px;
}

.cancel-btn {
  min-width: 150px;
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
  .initial-card,
  .config-card {
    padding: 24px 16px;
  }

  .content-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .content-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .content-actions {
    width: 100%;
    justify-content: stretch;
  }

  .content-actions .glass-button {
    flex: 1;
  }
}
</style>
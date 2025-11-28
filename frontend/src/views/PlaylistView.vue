<template>
  <div class="playlist-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">
          <t-icon name="sound" />
          听见·山河
        </h1>
        <p class="page-subtitle">基于AI生成技术，为您的旅程创建专属BGM歌单，记录美好声音</p>
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
      <div v-if="!loading && !playlist && !error && !showConfig" class="initial-container">
        <div class="initial-card">
          <div class="initial-icon">
            <span>🎵</span>
          </div>
          <h3 class="initial-title">AI旅途BGM歌单生成器</h3>
          <p class="initial-subtitle">
            基于您的旅行计划和风格偏好，AI将为您创建独一无二的旅途音乐歌单，完美记录您的旅行声音
          </p>
          <GlassButton @click="showConfig = true" icon="sound" theme="primary" size="lg">
            开始创作
          </GlassButton>
        </div>
      </div>
      
      <!-- 配置区域 - 替代模态框 -->
      <div v-if="showConfig && !loading && !playlist" class="initial-container">
        <div class="config-card">
          <div class="config-header">
            <h3 class="config-title">🎵 旅途BGM歌单配置</h3>
            <GlassButton 
              icon="close" 
              @click="showConfig = false" 
              size="sm" 
              theme="light"
            >
              取消
            </GlassButton>
          </div>
          
          <div class="playlist-config">
            <div class="config-group">
              <label class="config-label">行程风格</label>
              <div class="style-buttons">
                <button
                  v-for="s in styles"
                  :key="s.value"
                  :class="['style-btn', { active: selectedStyle === s.value }]"
                  @click="selectedStyle = s.value"
                  :disabled="loading"
                >
                  <span class="style-icon">{{ s.label.split(' ')[0] }}</span>
                  <span class="style-name">{{ s.label.split(' ')[1] }}</span>
                </button>
              </div>
              <div class="custom-style-input">
                <t-input
                  v-model="customStyle"
                  placeholder="或自定义你的旅行风格（如：浪漫之旅、亲子游等）"
                  :disabled="loading"
                  clearable
                  @change="handleCustomStyleChange"
                />
              </div>
            </div>

            <div class="config-group">
              <label class="config-label">重点地点（可选）</label>
              <t-input
                v-model="playlistHighlights"
                placeholder="如：解放西、橘子洲、茶颜悦色（逗号分隔）"
                :disabled="loading"
              />
            </div>

            <div class="config-actions">
              <t-button
                theme="primary"
                @click="generatePlaylist"
                :loading="loading"
                size="large"
                class="generate-btn"
              >
                {{ loading ? '生成中...' : '生成歌单' }}
              </t-button>
              <t-button
                theme="default"
                @click="showConfig = false"
                :disabled="loading"
                size="large"
                class="cancel-btn"
              >
                取消
              </t-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 歌单展示 -->
      <div v-else-if="playlist && !loading && !error" class="playlist-display">
        <div class="playlist-header">
          <div class="playlist-cover">
            <div class="cover-placeholder">
              <t-icon name="music" size="60px" />
            </div>
          </div>
          <div class="playlist-info">
            <h2 class="playlist-title">{{ playlist.title }}</h2>
            <p class="playlist-description">{{ playlist.description }}</p>
            <div class="playlist-meta">
              <span class="meta-item">🎵 {{ playlist.songs?.length || 0 }} 首歌曲</span>
              <span class="meta-item">⏱️ {{ estimatedDuration }}</span>
            </div>
            <div class="playlist-actions">
              <GlassButton 
                icon="download"
                @click="downloadPlaylist"
                size="sm"
              >
                下载歌单
              </GlassButton>
              <GlassButton 
                icon="share"
                @click="sharePlaylist"
                size="sm"
              >
                分享
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
        </div>

        <!-- 歌曲列表 -->
        <div class="playlist-songs">
          <div class="songs-title">歌曲列表（共 {{ playlist.songs?.length || 0 }} 首）</div>
          <div class="songs-container">
            <div
              v-for="(song, index) in playlist.songs"
              :key="index"
              class="song-item"
            >
              <div class="song-number">{{ String(index + 1).padStart(2, '0') }}</div>
              <div class="song-content">
                <div class="song-title">{{ song.title }}</div>
                <div class="song-artist">{{ song.artist }}</div>
              </div>
              <div class="song-meta">
                <t-tag :content="song.genre" variant="outline" size="small" />
                <span class="song-reason">{{ truncateReason(song.reason) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-else-if="loading && !playlist" class="loading-container">
        <div class="loading-card">
          <div class="loading-animation">
            <div class="loading-circle"></div>
            <div class="loading-circle delay-1"></div>
            <div class="loading-circle delay-2"></div>
          </div>
          <h3 class="loading-title">正在生成歌单...</h3>
          <p class="loading-subtitle">根据您的旅行计划，AI正在为您创建专属的BGM歌单</p>
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
            <GlassButton @click="showConfig = true" icon="refresh" theme="primary">
              重新尝试
            </GlassButton>
            <GlassButton @click="handleBack" icon="arrow-left" theme="light">
              返回上页
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
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
const playlist = ref(null);

// 页面加载时初始化地点信息
const initHighlights = () => {
  if (showPlaylistModal.value) {
    playlistHighlights.value = extractHighlights();
  }
};

const styles = [
  { label: '🎌 动漫爱好者', value: '动漫爱好者' },
  { label: '🎨 文艺青年', value: '文艺' },
  { label: '🌃 夜生活', value: '夜生活' },
  { label: '🏕️ 户外探险', value: '户外探险' },
  { label: '🍽️ 美食家', value: '美食家' },
  { label: '📸 摄影师', value: '摄影师' }
];

const selectedStyle = ref('文艺');
const customStyle = ref('');
const playlistHighlights = ref('');

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

const estimatedDuration = computed(() => {
  if (!playlist.value?.songs) return '约1小时';
  const totalMinutes = playlist.value.songs.length * 4; // 假设每首歌平均4分钟
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `约${hours}小时${minutes}分钟`;
  }
  return `约${minutes}分钟`;
});

const handleBack = () => {
  router.back();
};

const handleCustomStyleChange = () => {
  // 当用户输入自定义风格时，自动选择自定义风格
  if (customStyle.value.trim()) {
    selectedStyle.value = customStyle.value.trim();
  }
};

const generatePlaylist = async () => {
  if (!store.plan || !store.form) {
    MessagePlugin.warning('请先生成旅行计划');
    router.push({ name: 'Planner' });
    return;
  }

  loading.value = true;
  error.value = '';
  playlist.value = null;

  try {
    const highlightsArray = playlistHighlights.value
      .split('，')
      .concat(playlistHighlights.value.split(','))
      .filter(h => h.trim())
      .map(h => h.trim());

    // 确定最终使用的风格：优先使用自定义输入，否则使用预设值
    const finalStyle = customStyle.value.trim() || selectedStyle.value;

    const response = await fetch('/api/generate-playlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: store.form.destination,
        style: finalStyle,
        highlights: highlightsArray,
        duration: store.form.duration,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '生成失败');
    }

    const data = await response.json();
    playlist.value = data;
    showConfig.value = false;
    MessagePlugin.success('歌单生成成功！');
  } catch (err) {
    error.value = err.message || '生成歌单时发生错误';
    console.error('Error generating playlist:', err);
  } finally {
    loading.value = false;
  }
};

const downloadPlaylist = () => {
  if (!playlist.value) return;

  const playlistText = `🎵 ${playlist.value.title}\n${playlist.value.description}\n\n歌曲列表：\n${'='.repeat(50)}\n${playlist.value.songs
    .map(
      (song, idx) =>
        `${idx + 1}. ${song.title} - ${song.artist}\n   📻 ${song.genre} | ${song.reason}`
    )
    .join('\n\n')}`;

  const element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(playlistText)
  );
  element.setAttribute(
    'download',
    `${playlist.value.destination}-${selectedStyle.value}-歌单.txt`
  );
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);

  MessagePlugin.success('歌单已下载');
};

const sharePlaylist = () => {
  const shareText = `🎵 ${playlist.value.title}\n${playlist.value.description}\n有${playlist.value.songs?.length || 0}首精选歌曲 ✨`;
  
  if (navigator.share) {
    navigator.share({
      title: playlist.value.title,
      text: shareText,
    }).catch(() => {
      // 用户取消分享
    });
  } else {
    // 降级方案：复制到剪贴板
    navigator.clipboard.writeText(shareText).then(() => {
      MessagePlugin.success('歌单信息已复制');
    });
  }
};

const truncateReason = (reason) => {
  if (!reason) return '';
  return reason.length > 40 ? reason.substring(0, 40) + '...' : reason;
};

// 监听配置区域显示状态，自动填充地点
watch(showConfig, (newVal) => {
  if (newVal) {
    playlistHighlights.value = extractHighlights();
  }
});

// 页面加载时初始化
onMounted(() => {
  // 提前初始化地点信息
  const highlights = extractHighlights();
  if (highlights) {
    playlistHighlights.value = highlights;
  }
});
</script>

<style scoped>
.playlist-container {
  min-height: calc(100vh - var(--header-height));
  background: transparent;
}

/* === 页面头部 === */
.page-header {
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 30%, #fb7185 70%, #fda4af 100%);
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
  box-shadow: 0 4px 24px rgba(236, 72, 153, 0.3);
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
  padding: 8px 24px 32px 24px;
  max-width: 1200px;
  margin: 0 auto;
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
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 30%, #fb7185 70%, #fda4af 100%);
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

/* === 歌单展示 === */
.playlist-display {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.playlist-header {
  display: flex;
  gap: 24px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(244, 63, 94, 0.1) 100%);
  border-radius: 12px;
  border: 1px solid rgba(236, 72, 153, 0.2);
}

.playlist-cover {
  flex-shrink: 0;
}

.cover-placeholder {
  width: 140px;
  height: 140px;
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 60px;
  box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
}

.playlist-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.playlist-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.playlist-description {
  margin: 0;
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.playlist-meta {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.playlist-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.playlist-songs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.songs-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.songs-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.song-item {
  display: grid;
  grid-template-columns: 35px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: var(--td-bg-color-demo);
  border-radius: 10px;
  border: 1px solid var(--td-border-level-1-color);
  transition: all 0.2s ease;
}

.song-item:hover {
  background: var(--td-bg-color-container-hover);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: rgba(236, 72, 153, 0.3);
}

.song-number {
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
  font-size: 13px;
  min-width: 30px;
}

.song-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.song-title {
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
}

.song-artist {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 300px;
  justify-content: flex-end;
}

.song-reason {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: right;
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
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%);
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
.playlist-modal-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px;
}

.playlist-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.05) 0%, rgba(244, 63, 94, 0.05) 100%);
  border-radius: 12px;
  border: 1px solid rgba(236, 72, 153, 0.15);
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

.style-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;
  flex-wrap: wrap;
}

.style-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 110px;
  padding: 16px 12px;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(244, 63, 94, 0.08) 100%);
  border: 2px solid rgba(236, 72, 153, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.style-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(244, 63, 94, 0.15) 100%);
  border-color: rgba(236, 72, 153, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(236, 72, 153, 0.2);
}

.style-btn.active {
  background: linear-gradient(135deg, #ec4899 0%, #f43f5e 100%);
  border-color: #ec4899;
  color: white;
  box-shadow: 0 8px 25px rgba(236, 72, 153, 0.4);
}

.style-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.style-icon {
  font-size: 24px;
}

.style-name {
  font-size: 13px;
  font-weight: 500;
}

.custom-style-input {
  margin-top: 12px;
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
  max-width: 450px;
  width: 100%;
  text-align: center;
  animation: fadeInUp 0.4s ease-out;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
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

  .song-item {
    grid-template-columns: 30px 1fr auto;
  }

  .song-meta {
    min-width: auto;
    max-width: 200px;
  }
}
</style>
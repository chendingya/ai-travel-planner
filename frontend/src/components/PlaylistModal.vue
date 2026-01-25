<template>
  <t-dialog
    v-model:visible="isVisible"
    header="🎵 旅途BGM歌单"
    width="900px"
    :close-btn="true"
    @close="handleClose"
  >
    <div class="playlist-modal-container">
      <!-- 配置区域 -->
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
            placeholder="如：西湖、灵隐寺、河坊街（逗号分隔）"
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
        </div>
      </div>

      <!-- 歌单展示区域 -->
      <div v-if="playlist && !loading" class="playlist-display">
        <!-- 歌单头部 -->
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
                @click="generatePlaylist"
                :disabled="loading"
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
      <div v-if="loading && !playlist" class="loading-state">
        <t-loading text="正在为您生成旅途BGM歌单..." />
      </div>

      <!-- 错误状态 -->
      <div v-if="error" class="error-state">
        <t-alert theme="error" :title="error" />
      </div>
    </div>
  </t-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { supabase } from '../supabase';
import GlassButton from './GlassButton.vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  destination: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 3
  },
  dailyItinerary: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:visible']);

const isVisible = ref(props.visible);

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
const playlist = ref(null);
const loading = ref(false);
const error = ref('');

// 自动提取行程中的地点
const extractHighlights = () => {
  const highlights = new Set();
  props.dailyItinerary.forEach(day => {
    if (day.activities && Array.isArray(day.activities)) {
      day.activities.forEach(activity => {
        if (activity.location) {
          highlights.add(activity.location);
        }
      });
    }
  });
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

const handleCustomStyleChange = () => {
  // 当用户输入自定义风格时，自动选择自定义风格
  if (customStyle.value.trim()) {
    selectedStyle.value = customStyle.value.trim();
  }
};

const generatePlaylist = async () => {
  loading.value = true;
  error.value = '';
  playlist.value = null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      loading.value = false;
      error.value = '请先登录后再生成歌单';
      MessagePlugin.warning('请先登录后再生成歌单');
      return;
    }

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
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        destination: props.destination,
        style: finalStyle,
        highlights: highlightsArray,
        duration: props.duration,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '生成失败');
    }

    const data = await response.json();
    playlist.value = data;
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

const playSong = (song) => {
  MessagePlugin.info(`准备播放: ${song.title} - ${song.artist}`);
  // 这里可以集成 Spotify API 或其他音乐服务
};

const truncateReason = (reason) => {
  if (!reason) return '';
  return reason.length > 40 ? reason.substring(0, 40) + '...' : reason;
};

const handleClose = () => {
  emit('update:visible', false);
};

// 监听 props.visible 变化
watch(() => props.visible, (newVal) => {
  isVisible.value = newVal;
  // 每次打开模态框时，自动更新地点
  if (newVal) {
    playlistHighlights.value = extractHighlights();
  }
});

// 监听 isVisible 变化
watch(isVisible, (newVal) => {
  if (!newVal) {
    emit('update:visible', false);
  }
});
</script>

<style scoped>
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
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.15);
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
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%);
  border: 2px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.style-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%);
  border-color: rgba(139, 92, 246, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(139, 92, 246, 0.2);
}

.style-btn.active {
  background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
  border-color: #8b5cf6;
  color: white;
  box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4);
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

.config-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.generate-btn {
  width: 100%;
  font-size: 16px;
}

.playlist-display {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.playlist-header {
  display: flex;
  gap: 24px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.2);
}

.playlist-cover {
  flex-shrink: 0;
}

.cover-placeholder {
  width: 140px;
  height: 140px;
  background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 60px;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
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
  color: var(--td-text-color-primary);
}

.playlist-description {
  margin: 0;
  font-size: 15px;
  color: var(--td-text-color-secondary);
  line-height: 1.5;
}

.playlist-meta {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: var(--td-text-color-secondary);
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
  color: var(--td-text-color-primary);
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
  border-color: rgba(139, 92, 246, 0.3);
}

.song-number {
  font-weight: 600;
  color: var(--td-text-color-secondary);
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
  color: var(--td-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
}

.song-artist {
  font-size: 13px;
  color: var(--td-text-color-secondary);
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
  color: var(--td-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: right;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.error-state {
  padding: 16px;
}

@media (max-width: 1024px) {
  .song-item {
    grid-template-columns: 30px 1fr auto;
  }

  .song-meta {
    min-width: auto;
    max-width: 200px;
  }
}

@media (max-width: 768px) {
  .playlist-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .playlist-cover {
    flex-shrink: auto;
  }

  .cover-placeholder {
    width: 120px;
    height: 120px;
  }

  .song-item {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .song-number,
  .song-meta {
    display: none;
  }

  .song-content {
    grid-column: 1;
  }
}
</style>

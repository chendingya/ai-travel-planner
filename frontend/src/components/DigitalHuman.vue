<template>
  <div class="digital-human" :class="{ 'expanded': isExpanded, 'speaking': isSpeaking }">
    <!-- 数字人主体 -->
    <div class="digital-human-avatar" @click="toggleExpanded">
      <div class="avatar-container">
        <div class="avatar-image">
          <img 
            :src="currentGif" 
            alt="数字人" 
            class="avatar-gif"
            :class="{ 'speaking': isSpeaking }"
            @load="onGifLoad"
          />
        </div>
      </div>
      
      <!-- 状态指示器 -->
      <div class="status-indicator" v-if="status">
        <div class="status-dot" :class="status"></div>
      </div>
    </div>

    <!-- 展开面板 -->
    <transition name="slide-up">
      <div v-if="isExpanded" class="digital-human-panel">
        <div class="panel-header">
          <h4 class="panel-title">
            <span class="title-icon">🤖</span>
            AI导游助手
          </h4>
          <t-button
            variant="text"
            size="small"
            @click="toggleExpanded"
            class="close-btn"
          >
            <t-icon name="close" />
          </t-button>
        </div>

        <!-- 当前讲解内容 -->
        <div v-if="currentSpot" class="current-spot">
          <div class="spot-info">
            <div class="spot-name">{{ currentSpot.name }}</div>
            <div class="spot-description">{{ currentSpot.description }}</div>
          </div>
        </div>

        <!-- 音频播放器 -->
        <div v-if="audioUrl" class="audio-player">
          <!-- 多段音频进度显示 -->
          <div v-if="audioUrls.length > 1" class="audio-progress">
            <div class="progress-text">
              播放进度: {{ currentAudioIndex + 1 }} / {{ audioUrls.length }}
            </div>
            <div class="progress-dots">
              <div
                v-for="(url, index) in audioUrls"
                :key="index"
                class="progress-dot"
                :class="{ 'active': index <= currentAudioIndex }"
              ></div>
            </div>
          </div>
          
          <audio
            ref="audioPlayer"
            :src="audioUrl"
            controls
            preload="none"
            @play="onAudioPlay"
            @pause="onAudioPause"
            @ended="onAudioEnded"
          >
            您的浏览器不支持音频播放
          </audio>
        </div>

        <!-- 生成状态 -->
        <div v-if="isGenerating" class="generating-status">
          <t-loading theme="dots" size="small" />
          <span>正在生成讲解内容...</span>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="error-message">
          <t-icon name="error-circle" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- 设置区域 -->
        <div class="settings-section">
          <div class="setting-item">
            <label class="setting-label">音色选择</label>
            <t-select
              v-model="selectedVoice"
              placeholder="选择音色"
              size="small"
              style="width: 160px"
            >
              <t-option v-for="voice in voiceOptions" :key="voice.value" :value="voice.value">
                {{ voice.label }}
              </t-option>
            </t-select>
          </div>
          
          <div class="setting-item">
            <t-switch
              v-model="autoPlay"
              :label="'自动播放'"
              size="small"
            />
          </div>
        </div>

        <!-- 快捷操作 -->
        <div class="quick-actions">
          <t-button
            variant="outline"
            size="small"
            @click="regenerateAudio"
            :disabled="!currentSpot || isGenerating"
            class="action-btn"
          >
            <t-icon name="refresh" />
            重新生成
          </t-button>
          
          <t-button
            variant="outline"
            size="small"
            @click="stopAudio"
            :disabled="!isSpeaking"
            class="action-btn"
          >
            <t-icon name="pause" />
            停止播放
          </t-button>
        </div>
      </div>
    </transition>

    <!-- 提示气泡 -->
    <transition name="fade">
      <div v-if="showTip && !isExpanded" class="tip-bubble">
        点击景点，我来为您讲解
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

// Props
const props = defineProps({
  // 当前选中的景点信息
  spotInfo: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits(['spot-selected'])

// 响应式数据
const isExpanded = ref(false)
const isSpeaking = ref(false)
const isGenerating = ref(false)
const showTip = ref(true)
const errorMessage = ref('')
const audioUrl = ref('')
const audioUrls = ref([]) // 多段音频URL数组
const currentSpot = ref(null)
const selectedVoice = ref('Cherry')
const autoPlay = ref(true)
const audioPlayer = ref(null)
const currentAudioIndex = ref(0) // 当前播放的音频索引

// GIF循环播放相关
const currentGifIndex = ref(0) // 当前GIF索引
const gifFiles = ['/shuziren.gif', '/shuziren2.gif'] // GIF文件列表
const gifSwitchTimer = ref(null) // GIF切换定时器

// 计算当前GIF路径
const currentGif = computed(() => gifFiles[currentGifIndex.value])

// 状态计算
const status = computed(() => {
  if (isGenerating.value) return 'generating'
  if (isSpeaking.value) return 'speaking'
  if (currentSpot.value) return 'ready'
  return 'idle'
})

// 音色选项
const voiceOptions = [
  { value: 'Cherry', label: '芊悦' },
  { value: 'Ethan', label: '晨煦' },
  { value: 'Eric', label: '程川' },
  { value: 'Rocky', label: '阿强' },
  { value: 'Kiki', label: '阿清' }
]

// 监听景点信息变化
watch(() => props.spotInfo, (newSpot) => {
  if (newSpot && newSpot !== currentSpot.value) {
    handleSpotSelected(newSpot)
  }
}, { deep: true })

// 处理景点选择
const handleSpotSelected = async (spot) => {
  currentSpot.value = spot
  errorMessage.value = ''
  
  // 自动展开面板
  if (!isExpanded.value) {
    isExpanded.value = true
  }
  
  // 隐藏提示
  showTip.value = false
  
  // 生成讲解音频
  await generateSpotAudio(spot)
}

// 生成景点讲解音频
const generateSpotAudio = async (spot) => {
  if (!spot) return
  
  isGenerating.value = true
  errorMessage.value = ''
  
  try {
    // 构建景点信息
    const spotContext = {
      name: spot.description || spot.location || '未知景点',
      location: spot.location || '',
      description: spot.description || '',
      district: spot.district || '',
      city: spot.city || '',
      time: spot.time || ''
    }
    
    // 调用AI生成讲解内容
    const response = await fetch('http://localhost:5000/api/ai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `请为${spotContext.name}这个景点生成一段生动的导游讲解。${spotContext.district ? `位于${spotContext.district}` : ''}${spotContext.city ? `${spotContext.city}市` : ''}。讲解内容要包含景点特色、历史文化背景、游览建议等，语言要生动有趣，时长控制在1-2分钟，大约200-300字。`,
        voice: selectedVoice.value,
        language_type: 'Chinese',
        include_audio: true
      })
    })
    
    if (!response.ok) {
      throw new Error('请求失败')
    }
    
    const data = await response.json()
    
    if (data.audio_error) {
      throw new Error(data.audio_error)
    }
    
    // 处理音频URL
    if (data.audio_urls && Array.isArray(data.audio_urls) && data.audio_urls.length > 0) {
      // 多段音频处理
      audioUrls.value = data.audio_urls
      currentAudioIndex.value = 0
      audioUrl.value = audioUrls.value[0]
      
      console.log(`🎵 收到 ${audioUrls.value.length} 段音频`)
      
      // 自动播放第一段
      if (autoPlay.value) {
        await nextTick()
        playAudio()
      }
    } else if (data.audio_url) {
      // 单段音频处理
      audioUrls.value = []
      currentAudioIndex.value = 0
      audioUrl.value = data.audio_url
      
      // 自动播放
      if (autoPlay.value) {
        await nextTick()
        playAudio()
      }
    } else if (data.audio_task_id) {
      // 轮询获取音频
      await pollAudioStatus(data.audio_task_id)
    } else {
      throw new Error('未能生成音频')
    }
    
  } catch (error) {
    console.error('生成讲解音频失败:', error)
    errorMessage.value = '生成讲解失败，请重试'
  } finally {
    isGenerating.value = false
  }
}

// 轮询音频状态
const pollAudioStatus = async (taskId) => {
  const maxAttempts = 20
  const pollInterval = 2000
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://localhost:5000/api/tts/audio/${taskId}`)
      
      if (!response.ok) {
        throw new Error('查询音频状态失败')
      }
      
      const data = await response.json()
      
      if (data.status === 'completed') {
        audioUrl.value = data.audio_url
        
        if (autoPlay.value) {
          await nextTick()
          playAudio()
        }
        break
      } else if (data.status === 'failed') {
        throw new Error(data.error || '语音生成失败')
      }
      
    } catch (error) {
      console.error('轮询音频状态失败:', error)
    }
    
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }
  
  if (!audioUrl.value) {
    errorMessage.value = '音频生成超时，请重试'
  }
}

// 播放音频
const playAudio = () => {
  if (audioPlayer.value && audioUrl.value) {
    audioPlayer.value.play().catch(error => {
      console.error('音频播放失败:', error)
      errorMessage.value = '音频播放失败'
    })
  }
}

// 停止音频
const stopAudio = () => {
  if (audioPlayer.value) {
    audioPlayer.value.pause()
    audioPlayer.value.currentTime = 0
  }
  // 重置音频状态
  isSpeaking.value = false
  currentAudioIndex.value = 0
  if (audioUrls.value.length > 0) {
    audioUrl.value = audioUrls.value[0]
  }
}

// 重新生成音频
const regenerateAudio = () => {
  if (currentSpot.value) {
    // 清空之前的音频
    audioUrl.value = ''
    audioUrls.value = []
    currentAudioIndex.value = 0
    isSpeaking.value = false
    generateSpotAudio(currentSpot.value)
  }
}

// 音频事件处理
const onAudioPlay = () => {
  isSpeaking.value = true
}

const onAudioPause = () => {
  isSpeaking.value = false
}

const onAudioEnded = () => {
  // 检查是否有多段音频需要播放
  if (audioUrls.value.length > 1 && currentAudioIndex.value < audioUrls.value.length - 1) {
    // 播放下一段音频
    currentAudioIndex.value++
    audioUrl.value = audioUrls.value[currentAudioIndex.value]
    
    console.log(`🎵 播放第 ${currentAudioIndex.value + 1}/${audioUrls.value.length} 段音频`)
    
    // 延迟一小段时间后播放下一段
    setTimeout(() => {
      if (audioPlayer.value) {
        audioPlayer.value.play().catch(error => {
          console.error('下一段音频播放失败:', error)
        })
      }
    }, 500) // 500ms间隔
  } else {
    // 所有音频播放完成
    isSpeaking.value = false
    console.log('🎵 所有音频播放完成')
  }
}

// GIF加载完成处理
const onGifLoad = () => {
  console.log(`🎬 GIF加载完成: ${gifFiles[currentGifIndex.value]}`)
  
  // 启动GIF循环切换
  startGifCycling()
}

// 启动GIF循环切换
const startGifCycling = () => {
  // 清除之前的定时器
  if (gifSwitchTimer.value) {
    clearTimeout(gifSwitchTimer.value)
  }
  
  // 设置新的切换定时器（每个GIF播放3秒）
  gifSwitchTimer.value = setTimeout(() => {
    // 切换到下一个GIF
    currentGifIndex.value = (currentGifIndex.value + 1) % gifFiles.length
    console.log(`🔄 切换到GIF: ${gifFiles[currentGifIndex.value]}`)
    
    // 切换后继续循环
    startGifCycling()
  }, 3000) // 3秒后切换
}

// 切换展开状态
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value) {
    showTip.value = false
  }
}

// 组件挂载
onMounted(() => {
  // 5秒后隐藏提示
  setTimeout(() => {
    showTip.value = false
  }, 5000)
  
  // 启动GIF循环
  startGifCycling()
})

// 组件卸载
onUnmounted(() => {
  stopAudio()
  
  // 清理GIF切换定时器
  if (gifSwitchTimer.value) {
    clearTimeout(gifSwitchTimer.value)
  }
})
</script>

<style scoped>
.digital-human {
  position: fixed;
  bottom: 24px;
  right: 0px;
  z-index: 1000;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.digital-human-avatar {
  position: relative;
  width: 160px;
  height: 160px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.digital-human-avatar:hover {
  transform: scale(1.05);
}

.avatar-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.digital-human.speaking .avatar-container {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    filter: drop-shadow(0 4px 12px rgba(102, 126, 234, 0.3));
  }
  50% {
    filter: drop-shadow(0 8px 24px rgba(102, 126, 234, 0.6));
  }
}

.avatar-image {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-gif {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: all 0.3s ease;
  /* GIF播放优化 */
  image-rendering: auto;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  /* 减少播放顿挫感 */
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  /* 确保流畅播放 */
  animation-timing-function: linear;
}

.avatar-gif.speaking {
  animation: gif-pulse 1s ease-in-out infinite alternate;
}

@keyframes gif-pulse {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.05);
  }
}


.status-indicator {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.status-dot.idle {
  background: #95a5a6;
}

.status-dot.ready {
  background: #3498db;
}

.status-dot.generating {
  background: #f39c12;
  animation: blink 1s ease-in-out infinite;
}

.status-dot.speaking {
  background: #27ae60;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.digital-human-panel {
  position: absolute;
  bottom: 170px;
  right: 0;
  width: 360px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  padding: 20px;
  transform-origin: bottom right;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 18px;
}

.close-btn {
  color: var(--text-secondary);
}

.current-spot {
  background: rgba(0, 132, 255, 0.05);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
}

.spot-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.spot-description {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.audio-player {
  margin-bottom: 16px;
}

.audio-progress {
  margin-bottom: 8px;
  padding: 8px 12px;
  background: rgba(0, 132, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(0, 132, 255, 0.1);
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  text-align: center;
}

.progress-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e0e0e0;
  transition: all 0.3s ease;
}

.progress-dot.active {
  background: #1890ff;
  transform: scale(1.2);
}

.audio-player audio {
  width: 100%;
  height: 32px;
  border-radius: 8px;
}

.generating-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 16px;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f5222d;
  font-size: 14px;
  margin-bottom: 16px;
}

.settings-section {
  border-top: 1px solid var(--glass-border);
  padding-top: 16px;
  margin-bottom: 16px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.quick-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  flex: 1;
}

.tip-bubble {
  position: absolute;
  bottom: 180px;
  right: 0;
  background: var(--text-primary);
  color: white;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.tip-bubble::after {
  content: '';
  position: absolute;
  bottom: -4px;
  right: 40px;
  width: 8px;
  height: 8px;
  background: var(--text-primary);
  transform: rotate(45deg);
}

/* 过渡动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .digital-human {
    bottom: 16px;
    right: 16px;
  }
  
  .digital-human-avatar {
    width: 100px;
    height: 100px;
  }
  
  .digital-human-panel {
    width: 300px;
    right: -20px;
  }
  
  .tip-bubble {
    display: none;
  }
}
</style>

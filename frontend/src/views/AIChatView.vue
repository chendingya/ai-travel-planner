<template>
  <div class="ai-chat-view">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="page-title">
            <span class="title-icon">🤖</span>
            AI面对面对话
          </h1>
          <p class="page-subtitle">与智能旅行助手进行语音对话，获取专业的旅行建议</p>
        </div>
        
        <!-- 音色设置 -->
        <div class="voice-settings">
          <t-select
            v-model="selectedVoice"
            placeholder="选择音色"
            style="width: 200px"
          >
            <t-option v-for="voice in voiceOptions" :key="voice.value" :value="voice.value">
              {{ voice.label }}
            </t-option>
          </t-select>
          
          <t-switch
            v-model="autoPlay"
            :label="'自动播放'"
            style="margin-left: 16px"
          />
        </div>
      </div>
    </div>

    <!-- 聊天区域 -->
    <div class="chat-container">
      <div class="chat-messages" ref="messagesContainer">
        <div
          v-for="(message, index) in messages"
          :key="index"
          :class="['message', message.role]"
        >
          <div class="message-avatar">
            <div class="avatar">
              {{ message.role === 'user' ? '👤' : '🤖' }}
            </div>
          </div>
          
          <div class="message-content">
            <div class="message-text">{{ message.content }}</div>
            
            <!-- AI消息的音频播放器 -->
            <div v-if="message.role === 'assistant' && (message.audioUrl || message.audioUrls)" class="audio-player">
              <!-- 单段音频 -->
              <audio
                v-if="message.audioUrl && !message.audioUrls"
                ref="audioPlayers"
                :src="message.audioUrl"
                controls
                preload="none"
                @ended="onAudioEnded(index)"
              >
                您的浏览器不支持音频播放
              </audio>
              
              <!-- 多段音频 -->
              <div v-else-if="message.audioUrls" class="multi-audio-player">
                <div 
                  v-for="(audioUrl, audioIndex) in message.audioUrls" 
                  :key="audioIndex" 
                  class="audio-segment"
                >
                  <div class="segment-label">片段 {{ audioIndex + 1 }}</div>
                  <audio
                    :ref="el => { if (el) audioPlayers.push(el) }"
                    :src="audioUrl"
                    controls
                    preload="none"
                    @ended="onAudioSegmentEnded(index, audioIndex)"
                  >
                    您的浏览器不支持音频播放
                  </audio>
                </div>
              </div>
            </div>
            
            <!-- AI消息的音频生成状态 -->
            <div v-if="message.role === 'assistant' && message.audioStatus === 'processing'" class="audio-status">
              <t-loading theme="dots" size="small" />
              <span>正在生成语音...</span>
            </div>
            
            <!-- AI消息的音频错误 -->
            <div v-if="message.role === 'assistant' && message.audioError" class="audio-error">
              <t-icon name="error-circle" />
              <span>{{ message.audioError }}</span>
            </div>
          </div>
          
          <div class="message-time">
            {{ formatTime(message.timestamp) }}
          </div>
        </div>
        
        <!-- 加载状态 -->
        <div v-if="isLoading" class="message assistant">
          <div class="message-avatar">
            <div class="avatar">🤖</div>
          </div>
          <div class="message-content">
            <div class="typing-indicator">
              <t-loading theme="dots" size="small" />
              <span>AI正在思考...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <div class="input-container">
        <t-input
          v-model="inputMessage"
          placeholder="请输入您的问题..."
          :maxlength="500"
          @keydown.enter="sendMessage"
          :disabled="isLoading"
          class="message-input"
        >
          <template #suffix>
            <t-button
              theme="primary"
              @click="sendMessage"
              :disabled="!inputMessage.trim() || isLoading"
              :loading="isLoading"
              class="send-button"
            >
              <template #icon>
                <t-icon name="send" />
              </template>
              发送
            </t-button>
          </template>
        </t-input>
      </div>
      
      <!-- 快捷问题 -->
      <div class="quick-questions">
        <div class="quick-title">快捷问题：</div>
        <div class="quick-buttons">
          <t-button
            v-for="question in quickQuestions"
            :key="question"
            variant="outline"
            size="small"
            @click="handleQuickQuestion(question)"
            :disabled="isLoading"
            class="quick-btn"
          >
            {{ question }}
          </t-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

// 响应式数据
const messages = ref([])
const inputMessage = ref('')
const isLoading = ref(false)
const selectedVoice = ref('Cherry')
const autoPlay = ref(true)
const messagesContainer = ref(null)
const audioPlayers = ref([])

// 音色选项
const voiceOptions = [
  { value: 'Cherry', label: '芊悦 - 阳光积极小姐姐' },
  { value: 'Ethan', label: '晨煦 - 阳光温暖少年' },
  { value: 'Eric', label: '四川-程川 - 跳脱市井成都男子' },
  { value: 'Rocky', label: '粤语-阿强 - 幽默风趣' },
  { value: 'Kiki', label: '粤语-阿清 - 甜美港妹闺蜜' }
]

// 快捷问题
const quickQuestions = [
  '推荐一些湖南的热门景点',
  '湖南有什么特色美食？',
  '如何规划一次完美的湖南之旅？',
  '湖南旅游的最佳季节是什么时候？',
  '湖南有哪些必去的网红打卡地？'
]

// 发送消息
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return
  
  const userMessage = inputMessage.value.trim()
  inputMessage.value = ''
  
  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: userMessage,
    timestamp: new Date()
  })
  
  // 滚动到底部
  await nextTick()
  scrollToBottom()
  
  try {
    isLoading.value = true
    
    // 调用AI对话API
    const response = await fetch('http://localhost:5000/api/ai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: userMessage,
        voice: selectedVoice.value,
        language_type: 'Chinese',
        include_audio: true
      })
    })
    
    if (!response.ok) {
      throw new Error('请求失败')
    }
    
    const data = await response.json()
    
    // 添加AI回复
    const aiMessage = {
      role: 'assistant',
      content: data.ai_response,
      timestamp: new Date(),
      audioStatus: data.audio_task_id ? 'processing' : (data.audio_url || data.audio_urls ? 'completed' : null),
      audioTaskId: data.audio_task_id || null,
      audioUrl: data.audio_url || null,
      audioUrls: data.audio_urls || null, // 多段音频URL
      audioError: data.audio_error || null
    }
    
    messages.value.push(aiMessage)
    
    // 滚动到底部
    await nextTick()
    scrollToBottom()
    
    // 如果有音频任务，轮询获取音频
    if (data.audio_task_id) {
      await pollAudioStatus(aiMessage)
    } else if (data.audio_url) {
      // 直接播放音频
      if (autoPlay.value) {
        await nextTick()
        playAudio(aiMessage)
      }
    }
    
  } catch (error) {
    console.error('发送消息失败:', error)
    MessagePlugin.error('发送消息失败，请稍后重试')
  } finally {
    isLoading.value = false
  }
}

// 轮询音频状态
const pollAudioStatus = async (message) => {
  const maxAttempts = 20 // 最多轮询20次
  const pollInterval = 2000 // 2秒轮询一次
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://localhost:5000/api/tts/audio/${message.audioTaskId}`)
      
      if (!response.ok) {
        throw new Error('查询音频状态失败')
      }
      
      const data = await response.json()
      
      if (data.status === 'completed') {
        // 音频生成完成
        message.audioUrl = data.audio_url
        message.audioStatus = 'completed'
        
        // 自动播放
        if (autoPlay.value) {
          await nextTick()
          playAudio(message)
        }
        break
      } else if (data.status === 'failed') {
        // 音频生成失败
        message.audioStatus = 'failed'
        message.audioError = data.error || '语音生成失败'
        break
      }
      // 继续轮询
      
    } catch (error) {
      console.error('轮询音频状态失败:', error)
    }
    
    // 等待下次轮询
    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }
  
  // 轮询超时
  if (message.audioStatus === 'processing') {
    message.audioStatus = 'timeout'
    message.audioError = '语音生成超时，请重试'
  }
}

// 播放音频
const playAudio = (message) => {
  const audioElement = audioPlayers.value.find(player => 
    player.src === message.audioUrl
  )
  
  if (audioElement) {
    audioElement.play().catch(error => {
      console.error('音频播放失败:', error)
      MessagePlugin.error('音频播放失败')
    })
  }
}

// 音频播放结束
const onAudioEnded = (index) => {
  // 可以在这里添加播放结束后的逻辑
  console.log(`音频播放结束: ${index}`)
}

// 多段音频播放结束
const onAudioSegmentEnded = (messageIndex, segmentIndex) => {
  console.log(`多段音频播放结束: 消息${messageIndex}, 片段${segmentIndex}`)
  // 可以在这里添加多段音频播放结束后的逻辑
}

// 处理快捷问题
const handleQuickQuestion = (question) => {
  inputMessage.value = question
  sendMessage()
}

// 滚动到底部
const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 格式化时间
const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 组件挂载
onMounted(() => {
  // 添加欢迎消息
  messages.value.push({
    role: 'assistant',
    content: '您好！我是您的AI旅行助手，很高兴为您服务！我可以为您提供湖南旅游的相关建议，包括景点推荐、美食介绍、行程规划等。请问有什么可以帮助您的吗？',
    timestamp: new Date()
  })
})
</script>

<style scoped>
.ai-chat-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.03) 0%, rgba(168, 237, 234, 0.05) 100%);
}

.page-header {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--glass-border);
  padding: 20px 24px;
  flex-shrink: 0;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.title-section {
  flex: 1;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  font-size: 28px;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.voice-settings {
  display: flex;
  align-items: center;
  gap: 16px;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.message {
  display: flex;
  margin-bottom: 24px;
  gap: 12px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.message-content {
  flex: 1;
  max-width: 70%;
}

.message.user .message-content {
  display: flex;
  justify-content: flex-end;
}

.message-text {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 12px 16px;
  color: var(--text-primary);
  line-height: 1.6;
  word-wrap: break-word;
}

.message.user .message-text {
  background: linear-gradient(135deg, #0084ff, #00b8ff);
  color: white;
  border: none;
}

.audio-player {
  margin-top: 8px;
}

.audio-player audio {
  width: 100%;
  height: 32px;
  border-radius: 8px;
}

.multi-audio-player {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audio-segment {
  background: rgba(0, 132, 255, 0.05);
  border-radius: 12px;
  padding: 12px;
}

.segment-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.audio-status {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.audio-error {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f5222d;
  font-size: 14px;
}

.typing-indicator {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.message-time {
  font-size: 12px;
  color: var(--text-placeholder);
  margin-top: 4px;
  text-align: right;
}

.message.user .message-time {
  text-align: left;
}

.input-area {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-top: 1px solid var(--glass-border);
  padding: 12px 24px;
  flex-shrink: 0;
}

.input-container {
  max-width: 1200px;
  margin: 0 auto 16px auto;
}

.message-input {
  width: 100%;
}

.send-button {
  margin-left: 8px;
}

.quick-questions {
  max-width: 1200px;
  margin: 16px auto 0;
}

.quick-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.quick-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-btn {
  border-radius: 20px;
  font-size: 13px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  
  .voice-settings {
    justify-content: center;
  }
  
  .message-content {
    max-width: 85%;
  }
  
  .quick-buttons {
    justify-content: center;
  }
}

/* 滚动条样式 */
.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(0, 132, 255, 0.3);
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 132, 255, 0.5);
}
</style>

<template>
  <div class="ai-chat-view">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="header-content">
        <div class="title-section">
          <div class="page-title-wrapper">
            <h1 class="page-title">AI面对面对话</h1>
          </div>
          <p class="page-subtitle">与智能旅行助手进行语音对话，获取专业的旅行建议</p>
        </div>
        
        <!-- 音色设置 -->
        <div class="voice-settings">
          <div class="voice-select-wrapper">
            <div class="setting-label">
              <t-icon name="sound" />
              <span>音色选择</span>
            </div>
            <t-select
              v-model="selectedVoice"
              placeholder="选择音色"
              class="voice-select"
            >
              <t-option v-for="voice in voiceOptions" :key="voice.value" :value="voice.value">
                {{ voice.label }}
              </t-option>
            </t-select>
          </div>
          
          <div class="auto-play-wrapper">
            <span class="switch-label">自动播放</span>
            <t-switch
              v-model="autoPlay"
              :label="''"
              class="auto-play-switch"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 聊天区域 -->
    <div class="chat-container">
      <div class="chat-messages" ref="messagesContainer">
        <div
          v-for="message in messages"
          :key="message.id"
          :class="['message', message.role]"
          :data-message-id="message.id"
        >
          <div class="message-avatar">
            <div class="avatar" :class="message.role">
              <div class="avatar-inner">
                {{ message.role === 'user' ? '👤' : '🤖' }}
              </div>
            </div>
          </div>
          
          <div class="message-wrapper">
            <div class="message-content">
              <div class="message-text">{{ message.content }}</div>
              
              <!-- AI消息的音频播放器 -->
              <div v-if="message.role === 'assistant' && (message.audioUrl || message.audioUrls)" class="audio-player">
                <!-- 单段音频 -->
                <div v-if="message.audioUrl && !message.audioUrls" class="audio-wrapper">
                  <audio
                    :src="message.audioUrl"
                    controls
                    preload="none"
                    @ended="onAudioEnded(message)"
                    class="audio-element"
                  >
                    您的浏览器不支持音频播放
                  </audio>
                </div>
                
                <!-- 多段音频 -->
                <div v-else-if="message.audioUrls" class="multi-audio-player">
                  <div 
                    v-for="(audioUrl, audioIndex) in message.audioUrls" 
                    :key="audioIndex" 
                    class="audio-segment"
                  >
                    <div class="segment-header">
                      <t-icon name="sound" />
                      <span class="segment-label">片段 {{ audioIndex + 1 }}</span>
                    </div>
                    <div class="audio-wrapper">
                      <audio
                        :src="audioUrl"
                        controls
                        preload="none"
                        @ended="onAudioSegmentEnded(message, audioIndex)"
                        class="audio-element"
                      >
                        您的浏览器不支持音频播放
                      </audio>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- AI消息的音频生成状态 -->
              <div v-if="message.role === 'assistant' && message.audioStatus === 'processing'" class="audio-status">
                <div class="status-wrapper">
                  <t-loading theme="dots" size="small" />
                  <span>正在生成语音...</span>
                </div>
              </div>
              
              <!-- AI消息的音频错误 -->
              <div v-if="message.role === 'assistant' && message.audioError" class="audio-error">
                <div class="error-wrapper">
                  <t-icon name="error-circle" />
                  <span>{{ message.audioError }}</span>
                </div>
              </div>
            </div>
            
            <div class="message-time">
              {{ formatTime(message.timestamp) }}
            </div>
          </div>
        </div>
        
        <!-- 加载状态 -->
        <div v-if="isLoading" class="message assistant">
          <div class="message-avatar">
            <div class="avatar assistant">
              <div class="avatar-inner">
                🤖
              </div>
            </div>
          </div>
          <div class="message-wrapper">
            <div class="message-content">
              <div class="typing-indicator">
                <div class="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span>AI正在思考...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <div class="input-container">
        <div class="input-wrapper">
          <div class="input-field">
            <t-textarea
              v-model="inputMessage"
              placeholder="请输入您的问题..."
              :maxlength="500"
              :autosize="{ minRows: 2, maxRows: 4 }"
              @keydown.ctrl.enter="sendMessage"
              :disabled="isLoading"
              class="message-input"
            />
          </div>
          <div class="send-button-wrapper">
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
          </div>
        </div>
      </div>
      
      <!-- 快捷问题 -->
      <div class="quick-questions">
        <div class="quick-header">
          <t-icon name="lightbulb" />
          <span class="quick-title">快捷问题</span>
        </div>
        <div class="quick-buttons">
          <t-button
            v-for="(question, index) in quickQuestions"
            :key="question"
            variant="outline"
            size="small"
            @click="handleQuickQuestion(question)"
            :disabled="isLoading"
            class="quick-btn"
            :style="{ animationDelay: `${index * 0.1}s` }"
          >
            {{ question }}
          </t-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

const defaultGreeting = '您好！我是您的AI旅行助手，很高兴为您服务！我可以为您提供湖南旅游的相关建议，包括景点推荐、美食介绍、行程规划等。请问有什么可以帮助您的吗？'
const createMessageId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const createMessage = (role, content, extra = {}) => ({
  id: createMessageId(),
  role,
  content,
  timestamp: new Date(),
  ...extra
})
const createGreetingMessage = () => createMessage('assistant', defaultGreeting)

// 响应式数据 - 初始化就包含欢迎消息
const messages = ref([createGreetingMessage()])
const chatRef = ref(null)
const inputMessage = ref('')
const isLoading = ref(false)
const selectedVoice = ref('Cherry')
const autoPlay = ref(true)
const messagesContainer = ref(null)
const createConversationId = () => `ai-face-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const conversationId = ref(createConversationId())
const shouldResetHistory = ref(true)

const getMessageElement = (messageId) => {
  if (!messagesContainer.value) return null
  return messagesContainer.value.querySelector(`[data-message-id="${messageId}"]`)
}

const playMessageAudioSegment = (message, segmentIndex = 0) => {
  const messageElement = getMessageElement(message.id)
  if (!messageElement) return
  const audioElements = Array.from(messageElement.querySelectorAll('audio'))
  if (!audioElements.length) return
  const targetIndex = message.audioUrls && message.audioUrls.length ? segmentIndex : 0
  if (targetIndex >= audioElements.length) return
  const targetAudio = audioElements[targetIndex]
  message.currentAudioSegment = targetIndex
  targetAudio.currentTime = 0
  targetAudio.play().catch(error => {
    console.error('音频播放失败:', error)
    MessagePlugin.error('音频播放失败')
  })
}

const startAutoPlayForMessage = async (message, segmentIndex = 0) => {
  if (!autoPlay.value) return
  await nextTick()
  playMessageAudioSegment(message, segmentIndex)
}

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



// 发送消息处理函数
const handleSend = async (message) => {
  if (!message.trim() || isLoading.value) return
  
  // 添加用户消息
  messages.value.push(createMessage('user', message))
  
  // 滚动到底部
  await nextTick()
  scrollToBottom()
  
  try {
    isLoading.value = true
    const resetFlag = shouldResetHistory.value
    
    // 调用AI对话API
    const response = await fetch('http://localhost:5000/api/ai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        voice: selectedVoice.value,
        language_type: 'Chinese',
        include_audio: true,
        enable_tools: true,
        conversation_id: conversationId.value,
        reset_history: resetFlag
      })
    })
    
    if (!response.ok) {
      throw new Error('请求失败')
    }
    
    const data = await response.json()
    shouldResetHistory.value = false
    
    // 添加AI回复
    const hasMultipleSegments = Array.isArray(data.audio_urls) && data.audio_urls.length > 0
    const aiMessage = createMessage('assistant', data.ai_response, {
      audioStatus: data.audio_task_id ? 'processing' : (data.audio_url || hasMultipleSegments ? 'completed' : null),
      audioTaskId: data.audio_task_id || null,
      audioUrl: hasMultipleSegments ? null : (data.audio_url || null),
      audioUrls: hasMultipleSegments ? data.audio_urls : null,
      audioError: data.audio_error || null,
      currentAudioSegment: hasMultipleSegments ? 0 : null
    })
    
    messages.value.push(aiMessage)
    
    // 滚动到底部
    await nextTick()
    scrollToBottom()
    
    // 如果有音频任务，轮询获取音频
    if (data.audio_task_id) {
      await pollAudioStatus(aiMessage)
    } else if (aiMessage.audioUrls && aiMessage.audioUrls.length) {
      await startAutoPlayForMessage(aiMessage, 0)
    } else if (aiMessage.audioUrl) {
      await startAutoPlayForMessage(aiMessage)
    }
    
  } catch (error) {
    console.error('发送消息失败:', error)
    MessagePlugin.error('发送消息失败，请稍后重试')
  } finally {
    isLoading.value = false
  }
}

// 发送消息函数
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return
  
  const userMessage = inputMessage.value.trim()
  inputMessage.value = ''
  
  // 调用handleSend处理消息
  handleSend(userMessage)
}

const resetConversation = () => {
  conversationId.value = createConversationId()
  shouldResetHistory.value = true
  messages.value = [createGreetingMessage()]
}

// 清空聊天记录处理函数
const handleClear = () => {
  resetConversation()
  MessagePlugin.success('已开启新的对话')
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
        message.audioUrls = null
        message.audioStatus = 'completed'
        message.currentAudioSegment = 0
        
        await startAutoPlayForMessage(message)
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

// 音频播放结束
const onAudioEnded = (message) => {
  if (message) {
    message.currentAudioSegment = null
  }
  console.log(`音频播放结束: ${message?.id || ''}`)
}

// 多段音频播放结束
const onAudioSegmentEnded = (message, segmentIndex) => {
  if (!message.audioUrls || !message.audioUrls.length) return
  if (segmentIndex < message.audioUrls.length - 1) {
    if (autoPlay.value) {
      const nextIndex = segmentIndex + 1
      message.currentAudioSegment = nextIndex
      setTimeout(() => {
        startAutoPlayForMessage(message, nextIndex)
      }, 300)
    }
  } else {
    message.currentAudioSegment = null
    console.log(`多段音频播放完成: ${message.id}`)
  }
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
  // 欢迎消息已在初始化时添加
})
</script>

<style scoped>
.ai-chat-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4ecfb 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  overflow: hidden;
  width: 100%;
  margin: 0;
  padding: 0;
}

/* 页面头部 */
.page-header {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  padding: 24px 32px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-bottom-left-radius: 20px;
  border-bottom-right-radius: 20px;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
}

.title-section {
  flex: 1;
}

.page-title-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1d1d1f;
  margin: 0;
  letter-spacing: -0.022em;
}

.page-subtitle {
  font-size: 16px;
  color: #86868b;
  margin: 0;
  line-height: 1.5;
  font-weight: 400;
}

/* 音色设置 */
.voice-settings {
  display: flex;
  align-items: center;
  gap: 24px;
}

.voice-select-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #86868b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.voice-select {
  min-width: 240px;
}

.auto-play-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.auto-play-switch {
  transform: scale(1.2);
}

.switch-label {
  font-size: 12px;
  color: #86868b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* 聊天区域 */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  position: relative;
  width: 100%;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 32px 32px 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* 消息样式 */
.message {
  display: flex;
  margin-bottom: 32px;
  gap: 16px;
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.user {
  flex-direction: row-reverse;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  flex-shrink: 0;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.avatar.user {
  background: linear-gradient(135deg, #0084ff, #00b8ff);
  box-shadow: 0 4px 12px rgba(0, 132, 255, 0.3);
}

.avatar.assistant {
  background: linear-gradient(135deg, #a8a8a8, #c7c7cc);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.avatar-inner {
  font-size: 22px;
  filter: brightness(1.2);
}

.message-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

.message.user .message-wrapper {
  align-items: flex-end;
}

.message-content {
  position: relative;
}

.message-text {
  background: white;
  border-radius: 20px;
  padding: 14px 18px;
  color: #1d1d1f;
  line-height: 1.5;
  word-wrap: break-word;
  font-size: 16px;
  font-weight: 400;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s ease;
}

.message.user .message-text {
  background: linear-gradient(135deg, #0084ff, #00b8ff);
  color: white;
  border: none;
}

.message-text:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(0, 0, 0, 0.08);
}

/* 音频播放器 */
.audio-player {
  margin-top: 8px;
}

.audio-wrapper {
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.audio-element {
  width: 100%;
  height: 36px;
  border-radius: 0;
}

.multi-audio-player {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audio-segment {
  background: rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.segment-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.segment-label {
  font-size: 12px;
  color: #86868b;
  font-weight: 500;
}

/* 音频状态 */
.audio-status {
  margin-top: 8px;
}

.status-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  color: #86868b;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.audio-error {
  margin-top: 8px;
}

.error-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 59, 48, 0.1);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  color: #ff3b30;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(255, 59, 48, 0.2);
}

/* 输入状态 */
.typing-indicator {
  background: white;
  border-radius: 16px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #86868b;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.typing-dots {
  display: flex;
  gap: 4px;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #86868b;
  animation: typing 1.4s infinite;
}

.typing-dots span:nth-child(1) {
  animation-delay: 0s;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

/* 消息时间 */
.message-time {
  font-size: 12px;
  color: #86868b;
  margin-top: 4px;
  text-align: right;
  font-weight: 400;
}

.message.user .message-time {
  text-align: left;
}

/* 输入区域 */
.input-area {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding: 20px 32px 32px;
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
}

.input-container {
  max-width: 1400px;
  margin: 0 auto 24px auto;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.input-field {
  flex: 1;
}

.message-input {
  width: 100%;
  border-radius: 20px;
}

.send-button-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-bottom: 6px; /* 与textarea内边距匹配 */
}

.send-button {
  border-radius: 20px;
  height: 40px;
  min-width: 80px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 快捷问题 */
.quick-questions {
  max-width: 1400px;
  margin: 0 auto;
}

.quick-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.quick-title {
  font-size: 16px;
  color: #1d1d1f;
  font-weight: 600;
  letter-spacing: -0.016em;
}

.quick-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.quick-btn {
  border-radius: 24px;
  font-size: 14px;
  padding: 8px 16px;
  height: auto;
  font-weight: 400;
  transition: all 0.2s ease;
  animation: slideUp 0.5s ease-out forwards;
  opacity: 0;
  transform: translateY(10px);
}

@keyframes slideUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.quick-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

:deep(.t-textarea__inner) {
  border-radius: 20px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.9);
}

:deep(.t-chat__input-footer) {
  display: none; /* 隐藏默认的底部区域，使用自定义的 */
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-header {
    padding: 16px 20px;
  }
  
  .header-content {
    flex-direction: column;
    align-items: stretch;
    gap: 20px;
  }
  
  .page-title {
    font-size: 24px;
  }
  
  .page-subtitle {
    font-size: 14px;
  }
  
  .voice-settings {
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .chat-messages {
    padding: 20px 16px 16px;
  }
  
  .message-wrapper {
    max-width: 85%;
  }
  
  .input-area {
    padding: 16px 20px 24px;
  }
  
  .quick-buttons {
    justify-content: center;
  }
}

/* 滚动条样式 */
.chat-messages::-webkit-scrollbar {
  width: 4px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
</style>

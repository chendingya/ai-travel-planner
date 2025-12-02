<template>
  <div class="ai-chat-view">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="page-title">AI面对面对话</h1>
          <p class="page-subtitle">与智能旅行助手进行对话，获取专业的旅行建议</p>
        </div>
        <div class="header-actions">
          <!-- 工具模式开关 -->
          <div 
            class="tool-mode-toggle" 
            :class="{ 'is-active': enableTools }"
            @click="!isLoading && (enableTools = !enableTools)"
            :title="enableTools ? '已启用MCP工具（火车票查询、网络搜索）' : '启用MCP工具可查询火车票、搜索网络'"
          >
            <div class="toggle-bg"></div>
            <div class="toggle-content">
              <div class="toggle-icon-wrapper">
                <t-icon :name="enableTools ? 'tools' : 'chat'" class="toggle-icon" />
              </div>
              <span class="toggle-text">{{ enableTools ? '工具模式' : '普通对话' }}</span>
            </div>
          </div>

          <t-button variant="outline" @click="handleClear" shape="round" class="new-chat-btn">
            <template #icon><t-icon name="refresh" /></template>
            新对话
          </t-button>
        </div>
      </div>
    </div>

    <!-- 聊天区域 -->
    <div class="chat-container">
      <!-- 消息列表 - 使用 t-chat 组件 -->
      <t-chat
        ref="chatRef"
        :reverse="false"
        :data="chatData"
        :clear-history="false"
        :text-loading="isLoading"
      />

      <!-- 快捷问题区域 -->
      <div v-if="messages.length <= 1" class="quick-questions">
        <div class="quick-header">
          <t-icon name="lightbulb" />
          <span>快捷问题</span>
          <t-tag v-if="enableTools" theme="primary" size="small" variant="light">
            <t-icon name="tools" size="12px" style="margin-right: 4px;" />
            工具增强
          </t-tag>
        </div>
        <div class="quick-buttons">
          <t-button
            v-for="question in currentQuickQuestions"
            :key="question"
            variant="outline"
            size="small"
            :disabled="isLoading"
            @click="handleQuickQuestion(question)"
            class="quick-btn"
          >
            {{ question }}
          </t-button>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="sender-wrapper">
        <t-chat-sender
          v-model="inputValue"
          :placeholder="currentPlaceholder"
          :disabled="isLoading"
          :loading="isLoading"
          @send="handleSend"
          @stop="handleStop"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

// 头像配置
const userAvatar = 'https://tdesign.gtimg.com/site/avatar.jpg'
const assistantAvatar = 'https://tdesign.gtimg.com/site/chat-avatar.png'

// Chat 组件引用
const chatRef = ref(null)

// 会话管理
const createConversationId = () => `ai-face-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const conversationId = ref(createConversationId())
const shouldResetHistory = ref(true)

// MCP 工具模式开关
const enableTools = ref(false)

// 默认问候消息
const defaultGreeting = `您好！我是您的AI旅行助手，很高兴为您服务！

我可以为您提供湖南旅游的相关建议，包括：
- **景点推荐**：热门景区、网红打卡地
- **美食介绍**：特色小吃、地道餐厅
- **行程规划**：路线设计、时间安排
- **实用建议**：交通指南、住宿推荐

**提示**：开启右上角的"工具模式"，我还可以：
- **查询火车票**：查询12306列车信息
- **网络搜索**：获取最新旅游资讯

请问有什么可以帮助您的吗？`

// 消息列表
const messages = ref([
  {
    role: 'assistant',
    content: defaultGreeting,
  },
])

// 转换为 t-chat 需要的 data 格式
const chatData = computed(() => {
  return messages.value.map((msg) => ({
    avatar: msg.role === 'user' ? userAvatar : assistantAvatar,
    name: msg.role === 'user' ? '我' : 'AI助手',
    role: msg.role,
    content: msg.content,
  }))
})

// 状态
const inputValue = ref('')
const isLoading = ref(false)
const abortController = ref(null)

// 普通模式快捷问题
const normalQuickQuestions = [
  '推荐一些湖南的热门景点',
  '湖南有什么特色美食？',
  '如何规划一次完美的湖南之旅？',
  '湖南旅游的最佳季节是什么时候？'
]

// 工具模式快捷问题
const toolQuickQuestions = [
  '查一下明天从北京到长沙的高铁',
  '搜索一下张家界最新的旅游攻略',
  '查询下周五从上海到张家界的火车',
  '帮我搜索凤凰古城的住宿推荐'
]

// 根据模式切换快捷问题
const currentQuickQuestions = computed(() => 
  enableTools.value ? toolQuickQuestions : normalQuickQuestions
)

// 根据模式切换占位符
const currentPlaceholder = computed(() => 
  enableTools.value 
    ? '输入问题，可使用火车票查询、网络搜索等工具...' 
    : '请输入您的问题...'
)

// 格式化时间
function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `今天 ${hours}:${minutes}`
}

// 发送消息
const handleSend = async (value) => {
  const content = value?.trim() || inputValue.value?.trim()
  if (!content || isLoading.value) return
  
  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: content,
  })
  
  inputValue.value = ''
  
  // 滚动到底部
  await nextTick()
  scrollToBottom()
  
  // 调用AI
  await callAI(content)
}

// 调用AI接口
const callAI = async (prompt) => {
  isLoading.value = true
  const resetFlag = shouldResetHistory.value
  abortController.value = new AbortController()
  
  try {
    const response = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        conversation_id: conversationId.value,
        reset_history: resetFlag,
        enable_tools: enableTools.value,
      }),
      signal: abortController.value.signal,
    })
    
    if (!response.ok) {
      throw new Error('请求失败')
    }
    
    const data = await response.json()
    shouldResetHistory.value = false
    
    // 添加AI回复
    messages.value.push({
      role: 'assistant',
      content: data.ai_response || '抱歉，我暂时无法回答您的问题。',
    })
    
    // 滚动到底部
    await nextTick()
    scrollToBottom()
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已取消')
    } else {
      console.error('AI对话请求失败:', error)
      MessagePlugin.error('发送消息失败，请稍后重试')
    }
  } finally {
    isLoading.value = false
    abortController.value = null
  }
}

// 停止生成
const handleStop = () => {
  if (abortController.value) {
    abortController.value.abort()
  }
}

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    const chatEl = chatRef.value?.$el
    if (chatEl) {
      const scrollContainer = chatEl.querySelector('.t-chat__list') || chatEl
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  })
}

// 清空对话
const handleClear = () => {
  conversationId.value = createConversationId()
  shouldResetHistory.value = true
  messages.value = [
    {
      role: 'assistant',
      content: defaultGreeting,
    },
  ]
  MessagePlugin.success('已开启新的对话')
}

// 快捷问题
const handleQuickQuestion = (question) => {
  if (!isLoading.value) {
    handleSend(question)
  }
}
</script>

<style scoped>
.ai-chat-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4ecfb 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 页面头部 */
.page-header {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding: 16px 32px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 900px;
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
  font-weight: 700;
  color: #1d1d1f;
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 14px;
  color: #86868b;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 工具模式开关 */
.tool-mode-toggle {
  position: relative;
  width: 140px;
  height: 40px;
  border-radius: 20px;
  background: #f0f2f5;
  cursor: pointer;
  transition: all 0.3s ease;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
  user-select: none;
}

.tool-mode-toggle:hover {
  background: #e5e7eb;
}

.tool-mode-toggle.is-active {
  background: #e6f4ff;
  border-color: #0066cc;
}

.toggle-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #0066cc, #0088ff);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.tool-mode-toggle.is-active .toggle-bg {
  opacity: 0.05;
}

.toggle-content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
}

.toggle-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.tool-mode-toggle.is-active .toggle-icon-wrapper {
  background: #0066cc;
}

.toggle-icon {
  font-size: 16px;
  color: #666;
  transition: color 0.3s ease;
}

.tool-mode-toggle.is-active .toggle-icon {
  color: white;
}

.toggle-text {
  font-size: 14px;
  font-weight: 600;
  color: #666;
  transition: color 0.3s ease;
}

.tool-mode-toggle.is-active .toggle-text {
  color: #0066cc;
}

.new-chat-btn {
  height: 40px;
  border-radius: 20px;
  font-weight: 600;
}

/* 聊天区域 */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 20px;
}

/* t-chat 组件样式 */
:deep(.t-chat) {
  flex: 1;
  background: transparent;
}

/* 气泡背景纯白 */
:deep(.t-chat__text) {
  background: #ffffff !important;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

:deep(.t-chat__text__content) {
  padding: 14px 18px !important;
  font-size: 15px;
  line-height: 1.7;
}

/* 用户消息气泡 - 蓝色 */
:deep(.t-chat-item--user .t-chat__text) {
  background: linear-gradient(135deg, #0066cc 0%, #0088ff 100%) !important;
  border-radius: 16px 4px 16px 16px;
}

:deep(.t-chat-item--user .t-chat__text__content) {
  color: white;
}

/* AI 消息气泡 */
:deep(.t-chat-item--assistant .t-chat__text) {
  border-radius: 4px 16px 16px 16px;
}

/* 头像样式 */
:deep(.t-chat-item__avatar) {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

:deep(.t-chat-item__avatar .t-avatar) {
  width: 40px !important;
  height: 40px !important;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Markdown 内容样式 */
:deep(.t-chat__text__content p) {
  margin: 0 0 10px 0;
}

:deep(.t-chat__text__content p:last-child) {
  margin-bottom: 0;
}

:deep(.t-chat__text__content ul),
:deep(.t-chat__text__content ol) {
  padding-left: 20px;
  margin: 8px 0;
}

:deep(.t-chat__text__content li) {
  margin-bottom: 6px;
}

:deep(.t-chat__text__content strong) {
  font-weight: 600;
}

/* 快捷问题 */
.quick-questions {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 16px 20px;
  margin-bottom: 16px;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.quick-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #666;
  font-size: 13px;
  font-weight: 600;
}

.quick-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.quick-btn {
  border-radius: 18px;
  font-size: 13px;
  padding: 6px 16px;
  height: 32px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #444;
}

.quick-btn:hover:not(:disabled) {
  background: #f8faff;
  border-color: #0066cc;
  color: #0066cc;
}

/* 输入区域 */
.sender-wrapper {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px;
  padding: 8px 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
}

.sender-wrapper:focus-within {
  background: white;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
}

/* 响应式 */
@media (max-width: 768px) {
  .page-header {
    padding: 12px 16px;
  }
  
  .header-content {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .header-actions {
    justify-content: space-between;
  }
  
  .chat-container {
    padding: 12px;
  }
}
</style>

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
          <!-- 工具模式开关 - 美化版 -->
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

    <!-- 聊天区域 - 使用 TDesign Chat 组件 -->
    <div class="chat-container">
      <!-- 消息列表 -->
      <t-chat
        ref="chatRef"
        :data="chatData"
        :clear-history="false"
        :text-loading="isLoading"
        layout="single"
        :reverse="false"
      >
        <!-- 自定义头像 -->
        <template #avatar="{ item }">
          <t-avatar 
            :image="item.role === 'user' ? userAvatar : assistantAvatar"
            size="40px"
          />
        </template>
      </t-chat>

      <!-- 快捷问题区域 -->
      <div class="quick-questions">
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

// 消息列表 - 转换为 TChat 需要的格式
const messages = ref([
  {
    role: 'assistant',
    content: defaultGreeting,
    datetime: formatTime(new Date()),
  },
])

// 转换为 TChat data 格式
const chatData = computed(() => {
  return messages.value.map((msg) => ({
    avatar: msg.role === 'user' ? userAvatar : assistantAvatar,
    name: msg.role === 'user' ? '我' : 'AI助手',
    role: msg.role,
    content: msg.content,
    datetime: msg.datetime || '',
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
  return `${hours}:${minutes}`
}

// 发送消息
const handleSend = async (value) => {
  const content = value?.trim() || inputValue.value?.trim()
  if (!content || isLoading.value) return
  
  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: content,
    datetime: formatTime(new Date()),
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
        enable_tools: enableTools.value,  // 传递工具模式状态
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
      datetime: formatTime(new Date()),
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
  if (chatRef.value?.scrollToBottom) {
    chatRef.value.scrollToBottom({ behavior: 'smooth' })
  }
}

// 清空对话
const handleClear = () => {
  conversationId.value = createConversationId()
  shouldResetHistory.value = true
  messages.value = [
    {
      role: 'assistant',
      content: defaultGreeting,
      datetime: formatTime(new Date()),
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
  width: 100%;
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
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
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
  font-weight: 700;
  color: #1d1d1f;
  margin: 0 0 4px 0;
  letter-spacing: -0.5px;
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

/* 美化版工具模式开关 */
.tool-mode-toggle {
  position: relative;
  width: 140px;
  height: 40px;
  border-radius: 20px;
  background: #f0f2f5;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
}

.toggle-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
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
  z-index: 1;
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
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tool-mode-toggle.is-active .toggle-icon-wrapper {
  background: #0066cc;
  transform: translateX(4px);
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
  transition: all 0.3s ease;
}

.tool-mode-toggle.is-active .toggle-text {
  color: #0066cc;
  transform: translateX(-2px);
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
  padding: 24px 0;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}

/* TChat 组件样式覆盖 - 修复类名 (兼容两种类名格式) */
:deep(.t-chat) {
  flex: 1;
  background: transparent;
  width: 100%;
}

:deep(.t-chat__list) {
  padding: 0 20px;
}

:deep(.t-chat__item),
:deep(.t-chat-item) {
  padding: 16px 0;
  display: flex;
  flex-direction: row;
  animation: slideIn 0.3s ease-out;
  gap: 12px;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* AI 消息 - 左对齐 */
:deep(.t-chat__item--assistant),
:deep(.t-chat-item--assistant),
:deep(.t-chat__item:not(.t-chat__item--user):not(.t-chat-item--user)),
:deep(.t-chat-item:not(.t-chat-item--user):not(.t-chat__item--user)) {
  justify-content: flex-start;
}

/* 用户消息 - 右对齐 */
:deep(.t-chat__item--user),
:deep(.t-chat-item--user) {
  justify-content: flex-end;
  flex-direction: row-reverse;
}

/* 消息内容容器 */
:deep(.t-chat__item-main),
:deep(.t-chat-item__main) {
  display: flex;
  flex-direction: column;
  max-width: 80%;
}

:deep(.t-chat__item--user .t-chat__item-main),
:deep(.t-chat-item--user .t-chat-item__main) {
  align-items: flex-end;
}

:deep(.t-chat__item--assistant .t-chat__item-main),
:deep(.t-chat-item--assistant .t-chat-item__main),
:deep(.t-chat__item:not(.t-chat__item--user) .t-chat__item-main),
:deep(.t-chat-item:not(.t-chat-item--user) .t-chat-item__main) {
  align-items: flex-start;
}

/* 对话气泡样式 - 美化 */
:deep(.t-chat__item-content),
:deep(.t-chat-item__content) {
  padding: 14px 18px;
  font-size: 15px;
  line-height: 1.6;
  word-wrap: break-word;
  word-break: break-word;
  position: relative;
}

/* AI 消息气泡 - 左侧 */
:deep(.t-chat__item--assistant .t-chat__item-content),
:deep(.t-chat-item--assistant .t-chat-item__content),
:deep(.t-chat__item:not(.t-chat__item--user) .t-chat__item-content),
:deep(.t-chat-item:not(.t-chat-item--user) .t-chat-item__content) {
  background: white;
  color: #1d1d1f;
  border-radius: 4px 20px 20px 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

/* 用户消息气泡 - 右侧 */
:deep(.t-chat__item--user .t-chat__item-content),
:deep(.t-chat-item--user .t-chat-item__content) {
  background: linear-gradient(135deg, #0066cc 0%, #0088ff 100%);
  color: white;
  border-radius: 20px 4px 20px 20px;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 102, 204, 0.2);
}

:deep(.t-chat__item--user .t-chat__item-content *),
:deep(.t-chat-item--user .t-chat-item__content *) {
  color: white !important;
}

:deep(.t-chat__item--user .t-chat__item-content a),
:deep(.t-chat-item--user .t-chat-item__content a) {
  color: #e0e8ff !important;
  text-decoration: underline;
}

/* 头像样式 */
:deep(.t-chat__item-avatar),
:deep(.t-chat-item__avatar) {
  flex-shrink: 0;
  margin: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.t-chat__item--user .t-chat__item-avatar),
:deep(.t-chat-item--user .t-chat-item__avatar) {
  margin-left: 12px;
}

:deep(.t-chat__item--assistant .t-chat__item-avatar),
:deep(.t-chat-item--assistant .t-chat-item__avatar),
:deep(.t-chat__item:not(.t-chat__item--user) .t-chat__item-avatar),
:deep(.t-chat-item:not(.t-chat-item--user) .t-chat-item__avatar) {
  margin-right: 12px;
}

/* 名称和时间 */
:deep(.t-chat__item-name),
:deep(.t-chat-item__name) {
  font-size: 12px;
  color: #86868b;
  margin-bottom: 4px;
  padding: 0 4px;
}

:deep(.t-chat__item--user .t-chat__item-name),
:deep(.t-chat-item--user .t-chat-item__name) {
  text-align: right;
}

:deep(.t-chat__item-datetime),
:deep(.t-chat-item__datetime) {
  font-size: 11px;
  color: #999;
  margin-top: 6px;
  opacity: 0.8;
}

:deep(.t-chat__item--user .t-chat__item-datetime),
:deep(.t-chat-item--user .t-chat-item__datetime) {
  text-align: right;
  color: rgba(255, 255, 255, 0.8);
}

/* Markdown 内容样式 */
:deep(.t-chat-content) {
  font-size: 15px;
  line-height: 1.7;
}

:deep(.t-chat-content h1),
:deep(.t-chat-content h2),
:deep(.t-chat-content h3) {
  margin: 12px 0 8px;
  font-weight: 600;
  color: inherit;
}

:deep(.t-chat-content ul),
:deep(.t-chat-content ol) {
  padding-left: 20px;
  margin: 8px 0;
}

:deep(.t-chat-content li) {
  margin-bottom: 4px;
}

:deep(.t-chat-content pre) {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 12px;
  border-radius: 8px;
  margin: 10px 0;
  overflow-x: auto;
}

/* 快捷问题 */
.quick-questions {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 16px 20px;
  margin: 20px 20px 0;
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
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.quick-btn:hover:not(:disabled) {
  background: #f8faff;
  border-color: #0066cc;
  color: #0066cc;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 102, 204, 0.1);
}

/* 输入区域 */
.sender-wrapper {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 24px;
  padding: 8px 12px;
  margin: 16px 20px 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

.sender-wrapper:focus-within {
  background: white;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

/* 隐藏上传按钮 */
:deep(.t-chat-sender__upload) {
  display: none !important;
}

/* 输入框样式修复 */
:deep(.t-chat-sender) {
  background: transparent !important;
  padding: 0 !important;
}

:deep(.t-chat-sender__textarea) {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}

:deep(.t-chat-sender__inner-header),
:deep(.t-chat-sender__header) {
  display: none !important;
}

:deep(.t-textarea) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

:deep(.t-textarea__inner) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  min-height: 24px !important;
  max-height: 120px !important;
  padding: 8px 12px !important;
  font-size: 15px !important;
  line-height: 1.5 !important;
  resize: none !important;
}

:deep(.t-textarea__inner:focus),
:deep(.t-textarea__inner:focus-visible) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

:deep(.t-chat-sender__footer) {
  padding: 4px 0 0 0 !important;
  border: none !important;
}

:deep(.t-chat-sender__mode) {
  display: none !important;
}

/* 隐藏发送按钮 */
:deep(.t-chat-sender__button) {
  display: none !important;
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
    padding: 12px 0;
  }
  
  :deep(.t-chat__item-content) {
    max-width: 90%;
  }
  
  .quick-questions,
  .sender-wrapper {
    margin: 12px 12px 0;
  }
}
</style>

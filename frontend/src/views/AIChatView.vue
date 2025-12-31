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
          <!-- 历史会话按钮 -->
          <t-button 
            variant="outline" 
            @click="showHistoryPanel = !showHistoryPanel" 
            shape="round" 
            class="history-btn"
            :class="{ 'is-active': showHistoryPanel }"
          >
            <template #icon><t-icon name="time" /></template>
            历史记录
          </t-button>
          
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

    <!-- 主体区域 -->
    <div class="main-content">
      <!-- 历史会话侧边栏 -->
      <transition name="slide-left">
        <div v-if="showHistoryPanel" class="history-panel">
          <div class="history-header">
            <h3>历史对话</h3>
            <div class="history-header-actions">
              <t-button v-if="isLoggedIn" variant="text" size="small" @click="loadSessions" :loading="isLoadingSessions" title="刷新">
                <t-icon name="refresh" />
              </t-button>
              <t-button variant="text" size="small" @click="showHistoryPanel = false" title="关闭">
                <t-icon name="close" />
              </t-button>
            </div>
          </div>
          
          <!-- 未登录提示 -->
          <div v-if="!isLoggedIn" class="history-login-tip">
            <t-icon name="user-circle" size="48px" />
            <p class="login-tip-title">登录后查看历史记录</p>
            <p class="login-tip-desc">登录账号后，您的对话记录将被保存，方便随时查看</p>
            <t-button theme="primary" @click="goToLogin">
              <template #icon><t-icon name="login" style="color: white;" /></template>
              立即登录
            </t-button>
          </div>
          
          <!-- 已登录 - 显示历史列表 -->
          <template v-else>
            <div class="history-list" v-if="sessions.length > 0">
              <div 
                v-for="session in displayedSessions" 
                :key="session.conversation_id"
                class="history-item"
                :class="{ 'is-active': session.conversation_id === conversationId }"
              >
                <div class="history-item-content" @click="loadSession(session.conversation_id)">
                  <div class="history-item-title">{{ session.title }}</div>
                  <div class="history-item-meta">
                    <span>{{ session.message_count }} 条消息</span>
                    <span>{{ formatDate(session.updated_at) }}</span>
                  </div>
                </div>
                <t-button 
                  variant="text" 
                  size="small" 
                  class="history-item-delete"
                  @click.stop="confirmDeleteSession(session.conversation_id)"
                  title="删除此对话"
                >
                  <t-icon name="delete" />
                </t-button>
              </div>
              <!-- 展开更多按钮 -->
              <div v-if="sessions.length > initialDisplayCount" class="history-expand">
                <t-button 
                  variant="text" 
                  size="small" 
                  block
                  @click="showAllSessions = !showAllSessions"
                >
                  <t-icon :name="showAllSessions ? 'chevron-up' : 'chevron-down'" />
                  {{ showAllSessions ? '收起' : `展开更多 (${sessions.length - initialDisplayCount})` }}
                </t-button>
              </div>
            </div>
            <div v-else class="history-empty">
              <t-icon name="chat" size="32px" />
              <p>暂无历史对话</p>
            </div>
          </template>
        </div>
      </transition>

      <!-- 聊天区域 -->
      <div class="chat-container">
      <!-- 消息列表 - 使用 t-chat-list 和 t-chat-message 组件支持 Markdown -->
      <div class="chat-list-wrapper" ref="chatRef">
        <t-chat-list :clear-history="false">
          <t-chat-message
            v-for="(msg, index) in messages"
            :key="index"
            :avatar="msg.role === 'user' ? userAvatar : assistantAvatar"
            :name="msg.role === 'user' ? '我' : 'AI助手'"
            :role="msg.role"
            :content="formatMessageContent(msg.content, msg.role)"
            :status="index === messages.length - 1 && isLoading && msg.role === 'assistant' ? 'pending' : 'complete'"
            :variant="msg.role === 'user' ? 'base' : 'text'"
            :placement="msg.role === 'user' ? 'right' : 'left'"
          />
        </t-chat-list>
      </div>

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
        
        <!-- 工具模式提示 -->
        <div v-if="!enableTools" class="tool-mode-tip" @click="enableTools = true">
          <t-icon name="tips" />
          <span>开启<strong>工具模式</strong>可查询火车票、搜索网络等实时信息</span>
          <t-icon name="chevron-right" size="16px" />
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
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { supabase } from '../supabase'

// 登录状态
const isLoggedIn = ref(false)
const currentUser = ref(null)

// 检查登录状态
const checkLoginStatus = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    isLoggedIn.value = !!session
    currentUser.value = session?.user || null
  } catch (error) {
    console.error('检查登录状态失败:', error)
    isLoggedIn.value = false
    currentUser.value = null
  }
}

// 头像配置
const userAvatar = 'https://tdesign.gtimg.com/site/avatar.jpg'
const assistantAvatar = 'https://tdesign.gtimg.com/site/chat-avatar.png'

// Chat 组件引用
const chatRef = ref(null)

// 历史会话相关
const showHistoryPanel = ref(false)
const sessions = ref([])
const isLoadingSessions = ref(false)
const showAllSessions = ref(false)
const initialDisplayCount = 5

// 计算显示的会话列表
const displayedSessions = computed(() => {
  if (showAllSessions.value || sessions.value.length <= initialDisplayCount) {
    return sessions.value
  }
  return sessions.value.slice(0, initialDisplayCount)
})

// 会话管理
const createConversationId = () => `ai-face-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const conversationId = ref(createConversationId())
const shouldResetHistory = ref(true)

// MCP 工具模式开关
const enableTools = ref(false)

// 默认问候消息
const defaultGreeting = `您好！我是您的AI旅行助手，很高兴为您服务！

我可以为您提供杭州旅游的相关建议，包括：
- **景点推荐**：热门景区、网红打卡地
- **美食介绍**：特色小吃、地道餐厅
- **行程规划**：路线设计、时间安排
- **实用建议**：交通指南、住宿推荐

**提示**：开启右上角的"工具模式"，我还可以：
- **查询火车票**：查询12306列车信息
- **天气查询**：查询目的地实时天气
- **地点搜索**：搜索景点、餐厅、酒店
- **网络搜索**：获取最新旅游资讯

请问有什么可以帮助您的吗？`

// 消息列表
const messages = ref([
  {
    role: 'assistant',
    content: defaultGreeting,
  },
])

// 将消息内容转换为 t-chat-message 需要的 content 格式（数组）
// 直接使用 AI 返回的原始文本，不做任何预处理
// TDesign Chat 使用 cherry-markdown 引擎，能正确解析标准 Markdown
const formatMessageContent = (content, role) => {
  // 如果已经是数组格式，直接返回
  if (Array.isArray(content)) {
    return content
  }
  // AI 消息使用 markdown 类型渲染
  if (role === 'assistant') {
    return [{ type: 'markdown', data: content || '' }]
  }
  // 用户消息使用 text 类型
  return [{ type: 'text', data: content || '' }]
}

// 转换为 t-chat 需要的 data 格式（保留用于兼容）
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
  '推荐一些杭州的热门景点',
  '杭州有什么特色美食？',
  '如何规划一次完美的杭州之旅？',
  '杭州旅游的最佳季节是什么时候？'
]

// 工具模式快捷问题
const toolQuickQuestions = [
  '查一下明天从北京到杭州的高铁',
  '杭州今天天气怎么样？',
  '搜索西湖附近的美食餐厅',
  '帮我搜索乌镇的住宿推荐'
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
  
  // 检查登录状态
  if (!isLoggedIn.value) {
    MessagePlugin.warning('请先登录后再进行对话')
    goToLogin()
    return
  }
  
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
    const chatEl = chatRef.value
    if (chatEl) {
      // 新结构：直接使用 chat-list-wrapper 作为滚动容器
      chatEl.scrollTop = chatEl.scrollHeight
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

// 加载会话列表
const loadSessions = async () => {
  // 未登录时不加载历史记录
  if (!isLoggedIn.value) {
    sessions.value = []
    return
  }
  
  isLoadingSessions.value = true
  try {
    const response = await fetch('/api/ai-chat/sessions')
    if (response.ok) {
      const data = await response.json()
      sessions.value = data.sessions || []
    }
  } catch (error) {
    console.error('加载会话列表失败:', error)
  } finally {
    isLoadingSessions.value = false
  }
}

// 加载指定会话的历史记录
const loadSession = async (sessionId) => {
  if (sessionId === conversationId.value) {
    showHistoryPanel.value = false
    return
  }
  
  try {
    const response = await fetch(`/api/ai-chat/history/${sessionId}`)
    if (response.ok) {
      const data = await response.json()
      if (data.messages && data.messages.length > 0) {
        conversationId.value = sessionId
        shouldResetHistory.value = false
        messages.value = data.messages
        showHistoryPanel.value = false
        
        // 滚动到底部
        await nextTick()
        scrollToBottom()
      }
    }
  } catch (error) {
    console.error('加载历史记录失败:', error)
    MessagePlugin.error('加载历史记录失败')
  }
}

// 确认删除对话
const confirmDeleteSession = (sessionId) => {
  const confirmDialog = DialogPlugin.confirm({
    header: '删除确认',
    body: '确定要删除这个对话吗？删除后无法恢复。',
    confirmBtn: '删除',
    cancelBtn: '取消',
    theme: 'warning',
    onConfirm: async () => {
      await deleteSession(sessionId)
      confirmDialog.destroy()
    },
    onClose: () => {
      confirmDialog.destroy()
    },
  })
}

// 删除指定会话
const deleteSession = async (sessionId) => {
  try {
    const response = await fetch('/api/ai-chat/history', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })
    
    if (response.ok) {
      // 从列表中移除
      sessions.value = sessions.value.filter(s => s.conversation_id !== sessionId)
      
      // 如果删除的是当前会话，开启新对话（不显示提示）
      if (sessionId === conversationId.value) {
        conversationId.value = createConversationId()
        shouldResetHistory.value = true
        messages.value = [{ role: 'assistant', content: defaultGreeting }]
      }
      
      MessagePlugin.success('对话已删除')
    } else {
      MessagePlugin.error('删除失败')
    }
  } catch (error) {
    console.error('删除会话失败:', error)
    MessagePlugin.error('删除失败')
  }
}

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  } else if (diffDays === 1) {
    return '昨天'
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
}

// 页面加载时检查登录状态并获取会话列表
onMounted(async () => {
  await checkLoginStatus()
  if (isLoggedIn.value) {
    loadSessions()
  }
  
  // 监听登录状态变化
  supabase.auth.onAuthStateChange(async (event, session) => {
    isLoggedIn.value = !!session
    currentUser.value = session?.user || null
    if (session) {
      loadSessions()
    } else {
      sessions.value = []
    }
  })
})

// 快捷问题
const handleQuickQuestion = (question) => {
  if (!isLoading.value) {
    handleSend(question)
  }
}

// 跳转到登录页面
const goToLogin = () => {
  // 触发顶部导航栏的登录弹窗
  // 通过查找包含"登录"文字的按钮来触发
  const buttons = document.querySelectorAll('.header-right button, .auth-container button')
  for (const btn of buttons) {
    if (btn.textContent.includes('登录') && !btn.textContent.includes('立即')) {
      btn.click()
      showHistoryPanel.value = false
      return
    }
  }
  MessagePlugin.info('请点击右上角的"登录"按钮进行登录')
  showHistoryPanel.value = false
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

/* 主体区域 */
.main-content {
  flex: 1;
  display: flex;
  position: relative;
}

/* 历史会话侧边栏 */
.history-panel {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 50;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.08);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.history-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1f;
}

.history-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 4px;
  gap: 8px;
}

.history-item:hover {
  background: rgba(0, 102, 204, 0.06);
}

.history-item.is-active {
  background: rgba(0, 102, 204, 0.1);
  border: 1px solid rgba(0, 102, 204, 0.2);
}

.history-item-content {
  flex: 1;
  min-width: 0;
}

.history-item-title {
  font-size: 14px;
  font-weight: 500;
  color: #1d1d1f;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #86868b;
}

.history-item-delete {
  opacity: 0;
  transition: opacity 0.2s ease;
  color: #999;
}

.history-item-delete:hover {
  color: #ff4d4f;
}

.history-item:hover .history-item-delete {
  opacity: 1;
}

.history-expand {
  padding: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.history-expand .t-button {
  color: #0066cc;
  font-size: 13px;
}

.history-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #86868b;
  gap: 12px;
}

.history-empty p {
  margin: 0;
  font-size: 14px;
}

/* 未登录提示样式 */
.history-login-tip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: #666;
}

.history-login-tip .t-icon {
  color: #0066cc;
  opacity: 0.6;
  margin-bottom: 8px;
}

.login-tip-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.login-tip-desc {
  margin: 0 0 20px 0;
  font-size: 13px;
  color: #86868b;
  line-height: 1.5;
}

/* 历史按钮样式 */
.history-btn {
  height: 40px;
  border-radius: 20px;
  font-weight: 600;
}

.history-btn.is-active {
  background: rgba(0, 102, 204, 0.1);
  border-color: #0066cc;
  color: #0066cc;
}

/* 侧边栏动画 */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
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

/* 消息列表容器 */
.chat-list-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

/* t-chat-list 组件样式 */
:deep(.t-chat-list) {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

/* 工具模式提示 */
.tool-mode-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #e6f4ff 0%, #f0f7ff 100%);
  border: 1px solid rgba(0, 102, 204, 0.15);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  color: #0066cc;
}

.tool-mode-tip:hover {
  background: linear-gradient(135deg, #d6ebff 0%, #e6f4ff 100%);
  border-color: rgba(0, 102, 204, 0.3);
}

.tool-mode-tip strong {
  font-weight: 600;
}

.tool-mode-tip .t-icon:last-child {
  margin-left: auto;
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
    flex-wrap: wrap;
  }
  
  .chat-container {
    padding: 12px;
  }
  
  .history-panel {
    width: 100%;
  }
}
</style>

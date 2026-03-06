<template>
  <div class="ai-chat-view" ref="viewRootRef" :style="{ '--view-height': `${viewHeight}px` }">

    <!-- 主体区域 -->
    <div class="main-content">
      <!-- 左侧栏 -->
      <div class="history-panel">
        <div class="sidebar-top">
          <h1 class="sidebar-title">AI面对面对话</h1>
          <p class="sidebar-subtitle">与智能旅行助手进行对话，获取专业的旅行建议</p>
          <div class="sidebar-actions">
            <t-button
              variant="outline"
              @click="toggleHistoryPanel"
              shape="round"
              class="history-btn"
              :class="{ 'is-active': showHistoryPanel }"
            >
              <template #icon><t-icon name="time" /></template>
              历史记录
            </t-button>
            <t-button variant="outline" @click="handleClear" shape="round" class="new-chat-btn">
              <template #icon><t-icon name="refresh" /></template>
              新对话
            </t-button>
            <div
              class="tool-mode-toggle sidebar-tool-toggle"
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
          </div>
        </div>

        <template v-if="showHistoryPanel">
          <div class="history-header">
            <h3>历史对话</h3>
            <div class="history-header-actions">
                <t-button v-if="isLoggedIn" variant="text" size="small" @click="handleManualRefreshSessions" :loading="isLoadingSessions" title="刷新">
                <t-icon name="refresh" />
              </t-button>
            </div>
          </div>

          <div class="history-body">
            <!-- 初始加载骨架屏 -->
            <div v-if="isAuthChecking || (isLoggedIn && !sessionsLoadedOnce)" class="history-skeleton">
              <div v-for="i in 6" :key="i" class="skeleton-item">
                <div class="skeleton-line skeleton-title"></div>
                <div class="skeleton-line skeleton-meta"></div>
              </div>
            </div>

            <!-- 未登录提示 -->
            <div v-else-if="!isLoggedIn" class="history-login-tip">
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
              <div class="history-list" v-if="displayedSessions.length > 0" ref="historyListRef" @scroll="handleHistoryScroll">
                <div class="history-virtual-spacer" :style="{ height: `${virtualPaddingTop}px` }"></div>
                <div
                  v-for="session in visibleSessions"
                  :key="session.conversation_id"
                  class="history-item"
                  :class="{
                    'is-active': session.conversation_id === conversationId,
                    'is-appearing': hasSessionAppearAnimation(session.conversation_id),
                  }"
                  :style="sessionAppearStyle(session.conversation_id)"
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
                <div class="history-virtual-spacer" :style="{ height: `${virtualPaddingBottom}px` }"></div>
                <div class="history-load-more" v-if="hasMoreSessions || isLoadingMoreSessions">
                  <t-loading v-if="isLoadingMoreSessions" size="small" />
                  <span>{{ isLoadingMoreSessions ? '正在加载更多历史对话...' : '下拉到底加载更多' }}</span>
                </div>
              </div>
              <div v-else class="history-empty">
                <t-icon name="chat" size="32px" />
                <p>暂无历史对话</p>
              </div>
            </template>
          </div>
        </template>
        <div v-else class="history-collapsed-placeholder">
          <t-icon name="time" />
          <span>历史记录已收起</span>
        </div>
      </div>

      <!-- 聊天区域 -->
      <div class="chat-container">
        <div class="chat-list-wrapper">
          <t-chatbot
            ref="chatBotRef"
            :default-messages="messages"
            :chat-service-config="chatServiceConfig"
            :sender-props="{
              placeholder: currentPlaceholder,
              disabled: isLoading || !isLoggedIn,
            }"
            :list-props="{
              autoScroll: true,
              defaultScrollTo: 'bottom',
            }"
            :message-props="messageProps"
            @message-change="handleMessageChange"
          />
        </div>

        <!-- 快捷问题区域 -->
        <div v-if="messages.length <= 1" class="quick-questions">
          <div class="quick-header">
            <div class="quick-title-row">
              <t-icon name="lightbulb" />
              <span>快捷问题</span>
              <t-tag v-if="enableTools" theme="primary" size="small" variant="light">
                <t-icon name="tools" size="12px" style="margin-right: 4px;" />
                工具增强
              </t-tag>
            </div>
          </div>

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

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { supabase } from '../supabase'
import { createAIStreamEventParser } from '../utils/aiStreamEventParser'

// 登录状态
const isLoggedIn = ref(false)
const currentUser = ref(null)
const isAuthChecking = ref(true)

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
  } finally {
    isAuthChecking.value = false
  }
}

// 头像配置
const userAvatar = 'https://tdesign.gtimg.com/site/avatar.jpg'
const assistantAvatar = 'https://tdesign.gtimg.com/site/chat-avatar.png'

const chatBotRef = ref(null)
const viewRootRef = ref(null)
const viewHeight = ref(window.innerHeight)

// 历史会话相关
const showHistoryPanel = ref(true)
const sessions = ref([])
const isLoadingSessions = ref(false)
const isLoadingMoreSessions = ref(false)
const hasMoreSessions = ref(true)
const sessionsPage = ref(0)
const sessionsPageSize = 20
const sessionsLoadedOnce = ref(false)
const isLoadingHistory = ref(false)
const loadingHistoryId = ref(null)
const historyListRef = ref(null)
const historyScrollTop = ref(0)
const historyListHeight = ref(0)
const historyItemHeight = 84
const historyOverscan = 6
const sessionAppearDelayMap = ref({})
const sessionAppearDelayStep = 55
const sessionAppearDelayMax = 500
const sessionAppearDuration = 380
const sessionAppearCleanupBuffer = 240
let authSubscription = null
let historyResizeObserver = null

// 计算显示的会话列表
const displayedSessions = computed(() => sessions.value)

const virtualVisibleCount = computed(() => {
  if (!historyListHeight.value) return 20
  return Math.ceil(historyListHeight.value / historyItemHeight) + historyOverscan * 2
})

const virtualStartIndex = computed(() => {
  const base = Math.floor(historyScrollTop.value / historyItemHeight) - historyOverscan
  return Math.max(0, base)
})

const virtualEndIndex = computed(() => {
  return Math.min(displayedSessions.value.length, virtualStartIndex.value + virtualVisibleCount.value)
})

const visibleSessions = computed(() => {
  return displayedSessions.value.slice(virtualStartIndex.value, virtualEndIndex.value)
})

const virtualPaddingTop = computed(() => virtualStartIndex.value * historyItemHeight)
const virtualPaddingBottom = computed(() => Math.max(0, (displayedSessions.value.length - virtualEndIndex.value) * historyItemHeight))

// 会话管理
const conversationId = ref(null)
const shouldResetHistory = ref(true)

// MCP 工具模式开关
const enableTools = ref(true)

// 默认问候消息
const defaultGreeting = `您好！我是您的AI旅行助手，很高兴为您服务！

我可以为您提供杭州旅游的相关建议，包括：
- **景点推荐**：热门景区、网红打卡地
- **美食介绍**：特色小吃、地道餐厅
- **行程规划**：路线设计、时间安排
- **实用建议**：交通指南、住宿推荐

**提示**：开启"工具模式"，我还可以：
- **查询火车票**：查询12306列车信息
- **天气查询**：查询目的地实时天气
- **地点搜索**：搜索景点、餐厅、酒店
- **网络搜索**：获取最新旅游资讯

请问有什么可以帮助您的吗？`
const debugToolRaw = new URLSearchParams(window.location.search).get('debug_tool_raw') === '1'
const streamEventParser = createAIStreamEventParser({ includeRaw: debugToolRaw })

const toPlainText = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        if (typeof item.data === 'string') return item.data
        if (typeof item.text === 'string') return item.text
        if (typeof item.content === 'string') return item.content
      }
      return ''
    }).join('')
  }
  return content ? String(content) : ''
}

const normalizeMessage = (msg) => {
  const role = msg?.role || 'assistant'
  const rawContent = msg?.content
  if (Array.isArray(rawContent) && rawContent.every((item) => item && typeof item === 'object' && 'type' in item)) {
    return {
      ...msg,
      role,
      content: rawContent,
    }
  }
  const text = toPlainText(rawContent)
  if (role === 'user') {
    return { ...msg, role: 'user', content: [{ type: 'text', data: text }] }
  }
  if (role === 'system') {
    return { ...msg, role: 'system', content: [{ type: 'text', data: text }] }
  }
  return { ...msg, role: 'assistant', content: [{ type: 'markdown', data: text }] }
}

// 消息列表
const messages = ref([
  normalizeMessage({
    role: 'assistant',
    content: defaultGreeting,
  }),
])

const messageProps = (msg) => ({
  avatar: msg.role === 'user' ? userAvatar : assistantAvatar,
  name: msg.role === 'user' ? '我' : msg.role === 'assistant' ? 'AI助手' : '系统',
})

const isLoading = ref(false)

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

const updateLoading = (list) => {
  const last = Array.isArray(list) ? list.at(-1) : null
  const status = last?.status
  isLoading.value = status === 'pending' || status === 'streaming'
}

const handleMessageChange = (e) => {
  const next = Array.isArray(e?.detail) ? e.detail : []
  messages.value = next
  updateLoading(next)
}

const chatServiceConfig = () => ({
  endpoint: '/api/ai-chat',
  stream: true,
  protocol: 'default',
  onRequest: async (params) => {
    streamEventParser.reset()
    const session = await getAuthSession('请先登录后再进行对话')
    if (!session) {
      goToLogin()
      throw new Error('请先登录后再进行对话')
    }
    const urlParams = new URLSearchParams(window.location.search)
    const debugStream = urlParams.get('debug_stream') === '1'
    return {
      ...params,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message: params?.prompt || '',
        sessionId: conversationId.value || undefined,
        enable_tools: enableTools.value,
        ...(debugStream ? { debug_stream: true } : {}),
      }),
    }
  },
  onMessage: (chunk) => {
    const parsed = streamEventParser.parseChunk(chunk)
    if (!parsed) return null
    if (parsed.sessionId) conversationId.value = parsed.sessionId
    return parsed.content || null
  },
  onError: () => {
    MessagePlugin.error('发送消息失败，请稍后重试')
  },
  onComplete: () => {
    shouldResetHistory.value = false
  },
})

const updateViewHeight = () => {
  const top = viewRootRef.value?.getBoundingClientRect?.().top || 0
  viewHeight.value = Math.max(420, Math.floor(window.innerHeight - top))
}

const updateHistoryListMetrics = () => {
  historyListHeight.value = historyListRef.value?.clientHeight || 0
}

const appendSessionAppearAnimations = (list) => {
  const ids = Array.isArray(list)
    ? list
        .map((s) => (s && typeof s.conversation_id === 'string' ? s.conversation_id : ''))
        .filter(Boolean)
    : []
  if (!ids.length) return

  const next = { ...sessionAppearDelayMap.value }
  let maxDelay = 0
  ids.forEach((id, index) => {
    const delay = Math.min(index * sessionAppearDelayStep, sessionAppearDelayMax)
    next[id] = delay
    maxDelay = Math.max(maxDelay, delay)
  })
  sessionAppearDelayMap.value = next

  const removeAfterMs = maxDelay + sessionAppearDuration + sessionAppearCleanupBuffer
  setTimeout(() => {
    const current = { ...sessionAppearDelayMap.value }
    ids.forEach((id) => {
      delete current[id]
    })
    sessionAppearDelayMap.value = current
  }, removeAfterMs)
}

const clearSessionAppearAnimations = () => {
  if (!Object.keys(sessionAppearDelayMap.value).length) return
  sessionAppearDelayMap.value = {}
}

const hasSessionAppearAnimation = (conversationId) => {
  return sessionAppearDelayMap.value[conversationId] != null
}

const sessionAppearStyle = (conversationId) => {
  const delay = sessionAppearDelayMap.value[conversationId]
  if (delay == null) return undefined
  return { '--appear-delay': `${delay}ms` }
}

const loadMoreSessionsIfNeeded = () => {
  if (!showHistoryPanel.value) return
  if (!isLoggedIn.value) return
  if (isLoadingSessions.value || isLoadingMoreSessions.value) return
  if (!hasMoreSessions.value) return
  loadSessions({ append: true })
}

const handleHistoryScroll = (event) => {
  const target = event?.target
  const nextScrollTop = target?.scrollTop || 0
  const previousScrollTop = historyScrollTop.value
  historyScrollTop.value = nextScrollTop
  if (Math.abs(nextScrollTop - previousScrollTop) > 4) {
    clearSessionAppearAnimations()
  }
  if (!target) return
  const distanceToBottom = target.scrollHeight - (target.scrollTop + target.clientHeight)
  if (distanceToBottom <= 36) {
    loadMoreSessionsIfNeeded()
  }
}

const resetHistoryVirtualScroll = () => {
  historyScrollTop.value = 0
  if (historyListRef.value) {
    historyListRef.value.scrollTop = 0
  }
}

const setupHistoryResizeObserver = () => {
  if (historyResizeObserver) {
    historyResizeObserver.disconnect()
    historyResizeObserver = null
  }
  if (!historyListRef.value) return
  historyResizeObserver = new ResizeObserver(() => {
    updateHistoryListMetrics()
  })
  historyResizeObserver.observe(historyListRef.value)
  updateHistoryListMetrics()
}

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    chatBotRef.value?.scrollList?.({ to: 'bottom', behavior: 'auto' })
  })
}

// 清空对话
const handleClear = () => {
  conversationId.value = null
  shouldResetHistory.value = true
  streamEventParser.reset()
  messages.value = [
    normalizeMessage({
      role: 'assistant',
      content: defaultGreeting,
    }),
  ]
  chatBotRef.value?.setMessages?.(messages.value, 'replace')
  MessagePlugin.success('已开启新的对话')
}

// 加载会话列表
const loadSessions = async ({ append = false, forceRefresh = false } = {}) => {
  // 未登录时不加载历史记录
  if (!isLoggedIn.value) {
    sessions.value = []
    hasMoreSessions.value = false
    sessionsPage.value = 0
    return
  }
  if (isLoadingSessions.value) return
  if (append && !hasMoreSessions.value) return
  
  isLoadingSessions.value = true
  isLoadingMoreSessions.value = append
  try {
    const session = await getAuthSession()
    if (!session) {
      sessions.value = []
      hasMoreSessions.value = false
      sessionsPage.value = 0
      return
    }
    if (forceRefresh) {
      sessionsPage.value = 0
      hasMoreSessions.value = true
      sessionAppearDelayMap.value = {}
    }

    const nextPage = append ? sessionsPage.value + 1 : 1
    const response = await fetch(`/api/ai-chat/sessions?page=${nextPage}&page_size=${sessionsPageSize}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    if (response.ok) {
      const data = await response.json()
      const incoming = Array.isArray(data?.sessions) ? data.sessions : (Array.isArray(data) ? data : [])
      const hasMore = data?.pagination?.hasMore
      if (append) {
        const existing = new Set(sessions.value.map((s) => s?.conversation_id).filter(Boolean))
        const mergedIncoming = incoming.filter((s) => !existing.has(s?.conversation_id))
        sessions.value = [...sessions.value, ...mergedIncoming]
        if (mergedIncoming.length) appendSessionAppearAnimations(mergedIncoming)
      } else {
        sessions.value = incoming
      }
      sessionsPage.value = nextPage
      hasMoreSessions.value = typeof hasMore === 'boolean' ? hasMore : incoming.length >= sessionsPageSize
      sessionsLoadedOnce.value = true
      await nextTick()
      setupHistoryResizeObserver()
    }
  } catch (error) {
    console.error('加载会话列表失败:', error)
  } finally {
    isLoadingSessions.value = false
    isLoadingMoreSessions.value = false
  }
}

const handleManualRefreshSessions = (e) => {
  if (e && e.isTrusted === false) return
  loadSessions({ append: false, forceRefresh: true })
}

const toggleHistoryPanel = async () => {
  const next = !showHistoryPanel.value
  showHistoryPanel.value = next
  if (!next) {
    if (historyResizeObserver) {
      historyResizeObserver.disconnect()
      historyResizeObserver = null
    }
    historyListHeight.value = 0
    return
  }
  await nextTick()
  setupHistoryResizeObserver()
  resetHistoryVirtualScroll()
  if (!isLoggedIn.value) return
  if (sessionsLoadedOnce.value && sessions.value.length > 0) return
  await loadSessions({ append: false, forceRefresh: true })
}

// 加载指定会话的历史记录
const loadSession = async (sessionId) => {
  if (isLoadingHistory.value) return
  if (sessionId === conversationId.value) return
  
  isLoadingHistory.value = true
  loadingHistoryId.value = sessionId
  try {
    const session = await getAuthSession('请先登录后再查看历史记录')
    if (!session) {
      goToLogin()
      return
    }
    const response = await fetch(`/api/ai-chat/history/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    if (!response.ok) throw new Error('请求失败')

    const data = await response.json()
    const historyMessages = Array.isArray(data?.messages) ? data.messages : []
    conversationId.value = sessionId
    shouldResetHistory.value = false
    streamEventParser.reset()
    messages.value = historyMessages.length
      ? historyMessages.map(normalizeMessage)
      : [normalizeMessage({ role: 'assistant', content: '该对话暂无消息' })]
    chatBotRef.value?.setMessages?.(messages.value, 'replace')
    
    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('加载历史记录失败:', error)
    MessagePlugin.error('加载历史记录失败')
  } finally {
    isLoadingHistory.value = false
    loadingHistoryId.value = null
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
    const session = await getAuthSession('请先登录后再删除会话')
    if (!session) {
      goToLogin()
      return
    }
    const response = await fetch(`/api/ai-chat/history/${sessionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    
    if (response.ok) {
      // 从列表中移除
      sessions.value = sessions.value.filter(s => s.conversation_id !== sessionId)
      
      // 如果删除的是当前会话，开启新对话（不显示提示）
      if (sessionId === conversationId.value) {
        conversationId.value = null
        shouldResetHistory.value = true
        messages.value = [normalizeMessage({ role: 'assistant', content: defaultGreeting })]
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
  if (!Number.isFinite(date.getTime())) return ''
  const now = new Date()

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.round((nowOnly - dateOnly) / (1000 * 60 * 60 * 24))

  const hh = date.getHours().toString().padStart(2, '0')
  const mm = date.getMinutes().toString().padStart(2, '0')

  if (diffDays === 0) return `今天 ${hh}:${mm}`
  if (diffDays === 1) return `昨天 ${hh}:${mm}`
  if (diffDays > 1 && diffDays < 7) return `${diffDays}天前`
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  if (y === now.getFullYear()) return `${m}/${d}`
  return `${y}/${m}/${d}`
}

// 页面加载时检查登录状态并获取会话列表
onMounted(async () => {
  await checkLoginStatus()
  await nextTick()
  updateViewHeight()
  window.addEventListener('resize', updateViewHeight)
  
  // 监听登录状态变化
  authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
    isLoggedIn.value = !!session
    currentUser.value = session?.user || null
    if (!session) {
      sessions.value = []
      hasMoreSessions.value = false
      sessionsPage.value = 0
      sessionAppearDelayMap.value = {}
      sessionsLoadedOnce.value = false
      return
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewHeight)
  const sub = authSubscription?.data?.subscription
  if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe()
  authSubscription = null
  if (historyResizeObserver) {
    historyResizeObserver.disconnect()
    historyResizeObserver = null
  }
})

watch(isLoggedIn, async (loggedIn) => {
  if (!loggedIn) return
  if (!showHistoryPanel.value) return
  if (sessionsLoadedOnce.value && sessions.value.length > 0) return
  await loadSessions({ append: false, forceRefresh: true })
})

watch(
  () => sessions.value.length,
  async () => {
    await nextTick()
    updateHistoryListMetrics()
  }
)

// 快捷问题
const handleQuickQuestion = (question) => {
  if (!isLoading.value) {
    chatBotRef.value?.sendUserMessage?.({ prompt: question })
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
      return
    }
  }
  MessagePlugin.info('请点击右上角的"登录"按钮进行登录')
}

const getAuthSession = async (tip = '') => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      if (tip) MessagePlugin.warning(tip)
      return null
    }
    return session
  } catch (error) {
    console.error('获取登录态失败:', error)
    if (tip) MessagePlugin.warning(tip)
    return null
  }
}
</script>

<style scoped>
.ai-chat-view {
  height: var(--view-height);
  min-height: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4ecfb 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 主体区域 */
.main-content {
  flex: 1;
  display: flex;
  position: relative;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
}

/* 历史会话侧边栏 */
.history-panel {
  position: relative;
  flex: 0 0 320px;
  width: 320px;
  height: 100%;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 50;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.08);
}

.sidebar-top {
  flex: none;
  padding: 18px 16px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sidebar-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  color: #1d1d1f;
}

.sidebar-subtitle {
  margin: 0;
  font-size: 13px;
  color: #86868b;
  line-height: 1.4;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-actions .history-btn,
.sidebar-actions .new-chat-btn {
  width: 100%;
}

.sidebar-tool-toggle {
  width: 100%;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
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

.history-collapsed-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #667085;
  font-size: 13px;
}

.history-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  padding: 8px;
}

.history-virtual-spacer {
  width: 100%;
  flex: none;
}

.history-load-more {
  min-height: 36px;
  padding: 8px 10px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #7b8598;
  font-size: 12px;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  min-height: 76px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 4px;
  gap: 8px;
}

.history-item.is-appearing {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  animation: historyItemAppear 380ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--appear-delay, 0ms);
}

@keyframes historyItemAppear {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
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

/* 骨架屏 */
.history-skeleton {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skeleton-item {
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 2px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.skeleton-line {
  border-radius: 6px;
  background: linear-gradient(90deg, #efefef 25%, #e2e2e2 50%, #efefef 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.5s infinite ease-in-out;
}

.skeleton-title {
  height: 13px;
  width: 72%;
}

.skeleton-meta {
  height: 11px;
  width: 45%;
}

@keyframes skeletonShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
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

/* 工具模式开关 */
.tool-mode-toggle {
  position: relative;
  width: 100%;
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
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 0 20px 16px;
  overflow: hidden;
}

/* 消息列表容器 */
.chat-list-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

:deep(.t-chatbot) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.t-chatbot__list) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

:deep(.t-chatbot__footer) {
  flex: none;
}

/* 单行输入框模式 */
:deep(.t-chat-sender) {
  border-radius: 24px !important;
  background: rgba(255, 255, 255, 0.9) !important;
  backdrop-filter: blur(20px);
  border: 1.5px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06) !important;
  padding: 0 6px 0 16px !important;
  transition: border-color 0.2s, box-shadow 0.2s;
}

:deep(.t-chat-sender:focus-within) {
  border-color: #0066cc !important;
  box-shadow: 0 2px 16px rgba(0, 102, 204, 0.12) !important;
  background: #fff !important;
}

:deep(.t-chat-sender__content) {
  align-items: center !important;
  min-height: unset !important;
  padding: 0 !important;
}

:deep(.t-chat-sender__input) {
  min-height: 44px !important;
  max-height: 44px !important;
  height: 44px !important;
  line-height: 44px !important;
  padding: 0 !important;
  overflow: hidden !important;
  resize: none !important;
  white-space: nowrap !important;
}

:deep(.t-chat-sender__input textarea) {
  min-height: 44px !important;
  max-height: 44px !important;
  height: 44px !important;
  line-height: 44px !important;
  padding: 0 !important;
  resize: none !important;
  overflow: hidden !important;
}

:deep(.t-chat-sender__footer) {
  display: none !important;
}

:deep(.t-chat-sender__toolbar) {
  display: none !important;
}

:deep(.t-chat-sender__submit) {
  align-self: center !important;
  margin: 0 2px !important;
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
  min-height: 0;
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
  padding: 12px 14px;
  margin-top: 10px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  flex: none;
  max-height: 240px;
  overflow-y: auto;
}

.quick-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  margin-bottom: 8px;
  color: #666;
  font-size: 13px;
  font-weight: 600;
}

.quick-title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  gap: 8px;
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
  .ai-chat-view {
    min-height: 560px;
  }

  .main-content {
    flex-direction: column;
  }

  .chat-container {
    padding: 0 12px 12px;
    max-width: none;
  }

  .history-panel {
    position: relative;
    height: 300px;
    width: 100%;
    flex: none;
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  .sidebar-title {
    font-size: 20px;
  }

  .sidebar-subtitle {
    font-size: 12px;
  }

  .quick-questions {
    max-height: 200px;
  }
}
</style>

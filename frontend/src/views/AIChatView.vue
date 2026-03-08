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

            <PlanContextPanel
              v-if="isLoggedIn"
              :attached-plan-id="attachedPlanId"
              :attached-plan-label="attachedPlanLabel"
              :context-plan-options="contextPlanOptions"
              :is-loading-context-plans="isLoadingContextPlans"
              :is-loading="isLoading"
              @refresh="loadContextPlans({ force: true })"
              @change="handleAttachPlanChange"
              @clear="clearAttachedPlanForCurrentConversation"
            />
            <div v-if="memoryMetrics" class="memory-metrics-card">
              <div class="memory-metrics-title">Token 用量</div>
              <div v-if="hasActualUsage(memoryMetrics)" class="memory-metrics-main">
                Prompt Tokens {{ formatMetricNumber(memoryMetrics.prompt_tokens_actual) }}
              </div>
              <div v-if="hasActualUsage(memoryMetrics)" class="memory-metrics-sub">
                prompt {{ formatMetricNumber(memoryMetrics.prompt_tokens_actual) }} ·
                completion {{ formatMetricNumber(memoryMetrics.completion_tokens_actual) }} ·
                total {{ formatMetricNumber(memoryMetrics.total_tokens_actual) }}
              </div>
              <div v-if="memoryMetrics.token_usage_source" class="memory-metrics-sub">
                usage 来源：{{ memoryMetrics.token_usage_source }}
              </div>
              <div v-if="!hasActualUsage(memoryMetrics)" class="memory-metrics-sub">
                正在等待模型返回实际 token 用量...
              </div>
              <div class="memory-metrics-sub">
                压缩：{{ memoryMetrics.short_memory_compressed ? '是' : '否' }}
                <span v-if="memoryMetrics.short_memory?.compression_reason">
                  （{{ memoryMetrics.short_memory.compression_reason }}）
                </span>
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
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { supabase } from '../supabase'
import { useConversationPlanContext } from '../composables/useConversationPlanContext'
import { useAIChatMessageFlow } from '../composables/useAIChatMessageFlow'
import { useAIChatHistorySidebar } from '../composables/useAIChatHistorySidebar'
import PlanContextPanel from '../components/chat/PlanContextPanel.vue'

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

let authSubscription = null

// 会话管理
const conversationId = ref(null)
const shouldResetHistory = ref(true)

const {
  isLoadingContextPlans,
  draftConversationKey,
  attachedPlanId,
  attachedPlanLabel,
  contextPlanOptions,
  setAttachedPlanForConversation,
  handleAttachPlanChange,
  clearAttachedPlanForCurrentConversation,
  migrateDraftAttachedPlan,
  clearAttachedPlanForConversation,
  loadContextPlans,
  resetPlanContextState,
} = useConversationPlanContext({
  isLoggedIn,
  conversationId,
  getAuthSession: async (...args) => getAuthSession(...args),
})

// MCP 工具模式开关
const enableTools = ref(true)

const {
  defaultGreeting,
  streamEventParser,
  normalizeMessage,
  messages,
  messageProps,
  isLoading,
  memoryMetrics,
  currentQuickQuestions,
  currentPlaceholder,
  chatServiceConfig,
  handleMessageChange,
  handleQuickQuestion: sendQuickQuestion,
  replaceMessages,
  resetToGreeting,
} = useAIChatMessageFlow({
  conversationId,
  attachedPlanId,
  enableTools,
  shouldResetHistory,
  migrateDraftAttachedPlan,
  getAuthSession: async (...args) => getAuthSession(...args),
  goToLogin: () => goToLogin(),
  userAvatar,
  assistantAvatar,
})

const {
  showHistoryPanel,
  sessions,
  isLoadingSessions,
  isLoadingMoreSessions,
  hasMoreSessions,
  sessionsLoadedOnce,
  historyListRef,
  displayedSessions,
  visibleSessions,
  virtualPaddingTop,
  virtualPaddingBottom,
  hasSessionAppearAnimation,
  sessionAppearStyle,
  handleHistoryScroll,
  handleManualRefreshSessions,
  toggleHistoryPanel,
  loadSessions,
  loadSession,
  confirmDeleteSession,
  formatDate,
  updateHistoryListMetrics,
  cleanupHistoryResources,
  resetHistoryStateForLogout,
} = useAIChatHistorySidebar({
  isLoggedIn,
  conversationId,
  shouldResetHistory,
  getAuthSession: async (...args) => getAuthSession(...args),
  goToLogin: () => goToLogin(),
  clearAttachedPlanForConversation,
  setAttachedPlanForConversation,
  draftConversationKey,
  normalizeMessage,
  defaultGreeting,
  streamEventParser,
  chatBotRef,
  replaceMessages,
})

const updateViewHeight = () => {
  const top = viewRootRef.value?.getBoundingClientRect?.().top || 0
  viewHeight.value = Math.max(420, Math.floor(window.innerHeight - top))
}

// 清空对话
const handleClear = () => {
  conversationId.value = null
  setAttachedPlanForConversation(draftConversationKey, '')
  shouldResetHistory.value = true
  resetToGreeting(chatBotRef)
  MessagePlugin.success('已开启新的对话')
}

// 页面加载时检查登录状态并获取会话列表
onMounted(async () => {
  await checkLoginStatus()
  if (isLoggedIn.value) {
    await loadContextPlans({ force: true })
  }
  await nextTick()
  updateViewHeight()
  window.addEventListener('resize', updateViewHeight)
  
  // 监听登录状态变化
  authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
    isLoggedIn.value = !!session
    currentUser.value = session?.user || null
    if (!session) {
      resetHistoryStateForLogout()
      resetPlanContextState()
      return
    }
    loadContextPlans({ force: true })
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewHeight)
  const sub = authSubscription?.data?.subscription
  if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe()
  authSubscription = null
  cleanupHistoryResources()
})

watch(isLoggedIn, async (loggedIn) => {
  if (!loggedIn) {
    resetPlanContextState()
    return
  }
  await loadContextPlans({ force: true })
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

const handleQuickQuestion = (question) => {
  sendQuickQuestion(question, chatBotRef)
}

const formatMetricNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return Math.round(num).toLocaleString()
}

const hasActualUsage = (metrics) => {
  if (!metrics || typeof metrics !== 'object') return false
  return [metrics.prompt_tokens_actual, metrics.completion_tokens_actual, metrics.total_tokens_actual].some((value) => Number.isFinite(Number(value)))
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

.memory-metrics-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
}

.memory-metrics-title {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.memory-metrics-main {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.memory-metrics-sub {
  font-size: 12px;
  line-height: 1.3;
  color: #64748b;
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

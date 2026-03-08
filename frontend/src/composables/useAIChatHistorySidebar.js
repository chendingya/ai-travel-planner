import { ref, computed, nextTick } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'

export const useAIChatHistorySidebar = ({
  isLoggedIn,
  conversationId,
  shouldResetHistory,
  getAuthSession,
  goToLogin,
  clearAttachedPlanForConversation,
  setAttachedPlanForConversation,
  draftConversationKey,
  normalizeMessage,
  defaultGreeting,
  streamEventParser,
  chatBotRef,
  replaceMessages,
}) => {
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
  let historyResizeObserver = null

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

  const hasSessionAppearAnimation = (targetConversationId) => {
    return sessionAppearDelayMap.value[targetConversationId] != null
  }

  const sessionAppearStyle = (targetConversationId) => {
    const delay = sessionAppearDelayMap.value[targetConversationId]
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

  const scrollToBottom = () => {
    nextTick(() => {
      chatBotRef.value?.scrollList?.({ to: 'bottom', behavior: 'auto' })
    })
  }

  const loadSessions = async ({ append = false, forceRefresh = false } = {}) => {
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
        const incoming = Array.isArray(data?.sessions) ? data.sessions : Array.isArray(data) ? data : []
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
      const nextMessages = historyMessages.length
        ? historyMessages.map(normalizeMessage)
        : [normalizeMessage({ role: 'assistant', content: '该对话暂无消息' })]
      replaceMessages(nextMessages, chatBotRef)

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
        sessions.value = sessions.value.filter((s) => s.conversation_id !== sessionId)
        clearAttachedPlanForConversation(sessionId)

        if (sessionId === conversationId.value) {
          conversationId.value = null
          setAttachedPlanForConversation(draftConversationKey, '')
          shouldResetHistory.value = true
          replaceMessages([normalizeMessage({ role: 'assistant', content: defaultGreeting })], chatBotRef)
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

  const cleanupHistoryResources = () => {
    if (historyResizeObserver) {
      historyResizeObserver.disconnect()
      historyResizeObserver = null
    }
  }

  const resetHistoryStateForLogout = () => {
    sessions.value = []
    hasMoreSessions.value = false
    sessionsPage.value = 0
    sessionAppearDelayMap.value = {}
    sessionsLoadedOnce.value = false
  }

  return {
    showHistoryPanel,
    sessions,
    isLoadingSessions,
    isLoadingMoreSessions,
    hasMoreSessions,
    sessionsLoadedOnce,
    isLoadingHistory,
    loadingHistoryId,
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
    deleteSession,
    formatDate,
    updateHistoryListMetrics,
    cleanupHistoryResources,
    resetHistoryStateForLogout,
  }
}

import { ref, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { createAIStreamEventParser } from '../utils/aiStreamEventParser'

export const useAIChatMessageFlow = ({
  conversationId,
  attachedPlanId,
  enableTools,
  shouldResetHistory,
  migrateDraftAttachedPlan,
  getAuthSession,
  goToLogin,
  userAvatar,
  assistantAvatar,
}) => {
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
      return content
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            if (typeof item.data === 'string') return item.data
            if (typeof item.text === 'string') return item.text
            if (typeof item.content === 'string') return item.content
          }
          return ''
        })
        .join('')
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
  const memoryMetrics = ref(null)

  const normalQuickQuestions = [
    '推荐一些杭州的热门景点',
    '杭州有什么特色美食？',
    '如何规划一次完美的杭州之旅？',
    '杭州旅游的最佳季节是什么时候？',
  ]

  const toolQuickQuestions = [
    '查一下明天从北京到杭州的高铁',
    '杭州今天天气怎么样？',
    '搜索西湖附近的美食餐厅',
    '帮我搜索乌镇的住宿推荐',
  ]

  const currentQuickQuestions = computed(() => (enableTools.value ? toolQuickQuestions : normalQuickQuestions))
  const currentPlaceholder = computed(() =>
    enableTools.value ? '输入问题，可使用火车票查询、网络搜索等工具...' : '请输入您的问题...'
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
      memoryMetrics.value = null
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
          context_plan_id: attachedPlanId.value || undefined,
          context_plan_enabled: !!attachedPlanId.value,
          enable_tools: enableTools.value,
          ...(debugStream ? { debug_stream: true } : {}),
        }),
      }
    },
    onMessage: (chunk) => {
      const parsed = streamEventParser.parseChunk(chunk)
      if (!parsed) return null
      if (parsed?.event?.type === 'memory_metrics') {
        memoryMetrics.value = parsed.event.metrics && typeof parsed.event.metrics === 'object' ? parsed.event.metrics : null
        return null
      }
      if (parsed.sessionId) {
        const hadConversation = !!conversationId.value
        if (!hadConversation) migrateDraftAttachedPlan(parsed.sessionId)
        conversationId.value = parsed.sessionId
      }
      return parsed.content || null
    },
    onError: () => {
      MessagePlugin.error('发送消息失败，请稍后重试')
    },
    onComplete: () => {
      shouldResetHistory.value = false
    },
  })

  const handleQuickQuestion = (question, chatBotRef) => {
    if (!isLoading.value) {
      chatBotRef.value?.sendUserMessage?.({ prompt: question })
    }
  }

  const replaceMessages = (nextMessages, chatBotRef) => {
    messages.value = nextMessages
    chatBotRef.value?.setMessages?.(messages.value, 'replace')
  }

  const resetToGreeting = (chatBotRef) => {
    streamEventParser.reset()
    memoryMetrics.value = null
    replaceMessages(
      [
        normalizeMessage({
          role: 'assistant',
          content: defaultGreeting,
        }),
      ],
      chatBotRef
    )
  }

  return {
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
    handleQuickQuestion,
    replaceMessages,
    resetToGreeting,
  }
}

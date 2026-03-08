import { ref, computed } from 'vue'

export const useConversationPlanContext = ({
  isLoggedIn,
  conversationId,
  getAuthSession,
}) => {
  const contextPlans = ref([])
  const isLoadingContextPlans = ref(false)
  const attachedPlanByConversation = ref({})
  const draftConversationKey = '__draft__'

  const currentConversationKey = computed(() => conversationId.value || draftConversationKey)
  const attachedPlanId = computed(() => attachedPlanByConversation.value[currentConversationKey.value] || '')
  const attachedPlanLabel = computed(() => {
    const pid = attachedPlanId.value
    if (!pid) return ''
    const plan = contextPlans.value.find((item) => item && item.id === pid)
    if (!plan) return pid
    const destination = typeof plan.destination === 'string' && plan.destination.trim() ? plan.destination.trim() : '未命名计划'
    const duration = Number.isFinite(Number(plan.duration)) ? `${Number(plan.duration)}天` : ''
    return duration ? `${destination}（${duration}）` : destination
  })
  const contextPlanOptions = computed(() =>
    contextPlans.value.map((plan) => {
      const destination = typeof plan?.destination === 'string' && plan.destination.trim() ? plan.destination.trim() : '未命名计划'
      const duration = Number.isFinite(Number(plan?.duration)) ? `${Number(plan.duration)}天` : ''
      const budget = Number.isFinite(Number(plan?.budget)) ? `¥${Number(plan.budget).toLocaleString()}` : ''
      const meta = [duration, budget].filter(Boolean).join(' · ')
      return {
        label: meta ? `${destination}（${meta}）` : destination,
        value: plan.id,
      }
    })
  )

  const setAttachedPlanForConversation = (key, planId) => {
    const k = typeof key === 'string' && key ? key : draftConversationKey
    const pid = typeof planId === 'string' ? planId : ''
    const next = { ...attachedPlanByConversation.value }
    if (!pid) delete next[k]
    else next[k] = pid
    attachedPlanByConversation.value = next
  }

  const handleAttachPlanChange = (value) => {
    const nextId = typeof value === 'string' ? value : ''
    setAttachedPlanForConversation(currentConversationKey.value, nextId)
  }

  const clearAttachedPlanForCurrentConversation = () => {
    setAttachedPlanForConversation(currentConversationKey.value, '')
  }

  const migrateDraftAttachedPlan = (nextConversationId) => {
    const nextId = typeof nextConversationId === 'string' ? nextConversationId : ''
    if (!nextId) return
    const draftPlanId = attachedPlanByConversation.value[draftConversationKey]
    if (!draftPlanId) return
    const next = { ...attachedPlanByConversation.value }
    next[nextId] = draftPlanId
    delete next[draftConversationKey]
    attachedPlanByConversation.value = next
  }

  const clearAttachedPlanForConversation = (targetConversationId) => {
    const key = typeof targetConversationId === 'string' && targetConversationId ? targetConversationId : ''
    if (!key) return
    const next = { ...attachedPlanByConversation.value }
    if (!Object.prototype.hasOwnProperty.call(next, key)) return
    delete next[key]
    attachedPlanByConversation.value = next
  }

  const loadContextPlans = async ({ force = false } = {}) => {
    if (!isLoggedIn.value) {
      contextPlans.value = []
      return
    }
    if (!force && contextPlans.value.length > 0) return
    if (isLoadingContextPlans.value) return
    isLoadingContextPlans.value = true
    try {
      const session = await getAuthSession()
      if (!session) {
        contextPlans.value = []
        return
      }
      const response = await fetch('/api/plans', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!response.ok) throw new Error('请求失败')
      const data = await response.json().catch(() => ({}))
      const list = Array.isArray(data?.plans) ? data.plans : []
      contextPlans.value = list
      const validIds = new Set(list.map((item) => item?.id).filter(Boolean))
      const next = { ...attachedPlanByConversation.value }
      for (const [key, value] of Object.entries(next)) {
        if (!validIds.has(value)) delete next[key]
      }
      attachedPlanByConversation.value = next
    } catch (error) {
      console.error('加载可挂载计划失败:', error)
    } finally {
      isLoadingContextPlans.value = false
    }
  }

  const resetPlanContextState = () => {
    contextPlans.value = []
    attachedPlanByConversation.value = {}
  }

  return {
    contextPlans,
    isLoadingContextPlans,
    attachedPlanByConversation,
    draftConversationKey,
    currentConversationKey,
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
  }
}

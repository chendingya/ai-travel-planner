<template>
  <div class="memory-center-view full-width">
    <div class="memory-background">
      <div class="memory-content">
        <div class="page-header">
          <div class="header-copy">
            <div class="eyebrow">AI 长期记忆</div>
            <h1 class="page-title">管理跨会话生效的旅行偏好</h1>
            <p class="page-subtitle">
              这些内容会在您之后的 AI 对话里持续作为参考。适合保存稳定偏好，不适合一次性的临时需求。
            </p>
          </div>
          <div class="header-actions">
            <GlassButton icon="arrow-left" theme="light" size="sm" @click="goBack">
              返回
            </GlassButton>
          </div>
        </div>

        <div v-if="!authReady || loading" class="state-card">
          <t-loading text="正在加载长期记忆..." />
        </div>

        <div v-else-if="!isLoggedIn" class="state-card state-card-login">
          <t-alert theme="warning" message="请先登录后再管理长期记忆。" />
          <t-button theme="primary" variant="outline" @click="triggerLoginDialog">
            去登录
          </t-button>
        </div>

        <template v-else>
          <div class="overview-grid">
            <div class="overview-card is-primary">
              <div class="overview-label">已启用偏好</div>
              <div class="overview-value">{{ activeCount }}/{{ memoryDefinitions.length }}</div>
              <div class="overview-meta">会在后续对话中持续参与上下文构建</div>
            </div>
            <div class="overview-card">
              <div class="overview-label">最近更新</div>
              <div class="overview-value overview-value-sm">{{ latestUpdatedAtLabel }}</div>
              <div class="overview-meta">手动保存的内容会覆盖自动抽取的同类偏好</div>
            </div>
            <div class="overview-card">
              <div class="overview-label">当前状态</div>
              <div class="overview-value overview-value-sm">{{ dirtyCount ? `有 ${dirtyCount} 项待保存` : '已同步' }}</div>
              <div class="overview-meta">支持逐项保存、逐项删除和一键清空</div>
            </div>
          </div>

          <div class="toolbar-card">
            <div>
              <div class="toolbar-title">长期记忆面板</div>
              <div class="toolbar-desc">建议用完整句描述真实偏好，例如预算边界、出行节奏和忌口。</div>
            </div>
            <div class="toolbar-actions">
              <t-button variant="outline" :disabled="loading || clearingAll || profileLoading" @click="refreshMemoryCenter">
                <template #icon><t-icon name="refresh" /></template>
                刷新
              </t-button>
              <t-button
                theme="danger"
                variant="outline"
                :disabled="activeCount === 0 || loading"
                :loading="clearingAll"
                @click="confirmClearAll"
              >
                <template #icon><t-icon name="delete" /></template>
                清空全部
              </t-button>
            </div>
          </div>

          <section class="semantic-shell">
            <div class="semantic-hero">
              <div>
                <div class="semantic-kicker">Semantic Profile</div>
                <h2 class="semantic-title">AI 语义画像</h2>
                <p class="semantic-desc">系统会从跨会话对话里提取难以结构化建模的偏好、经验和约束，并在相关问题中做语义召回。</p>
              </div>
              <div class="semantic-stats">
                <div class="semantic-stat">
                  <span>语义记忆</span>
                  <strong>{{ semanticProfile.stats.total_memories }}</strong>
                </div>
                <div class="semantic-stat">
                  <span>活跃标签</span>
                  <strong>{{ semanticProfile.stats.active_tags }}</strong>
                </div>
                <div class="semantic-stat">
                  <span>30天召回</span>
                  <strong>{{ semanticProfile.stats.recalled_last_30d }}</strong>
                </div>
              </div>
            </div>

            <div class="semantic-grid">
              <section class="semantic-card semantic-card-summary">
                <div class="semantic-card-title">画像摘要</div>
                <div v-if="profileLoading" class="semantic-loading">
                  <t-loading size="small" text="正在分析画像..." />
                </div>
                <p v-else class="semantic-summary">{{ semanticProfile.summary }}</p>
              </section>

              <section class="semantic-card">
                <div class="semantic-card-title">高频标签</div>
                <div v-if="profileLoading" class="semantic-loading">
                  <t-loading size="small" text="正在加载标签..." />
                </div>
                <div v-else class="semantic-tags">
                  <t-tag v-for="tag in semanticProfile.tags" :key="tag" theme="primary" variant="light">
                    {{ tag }}
                  </t-tag>
                  <span v-if="semanticProfile.tags.length === 0" class="semantic-empty">暂无语义标签</span>
                </div>
              </section>

              <section class="semantic-card">
                <div class="semantic-card-title">高价值语义记忆</div>
                <div v-if="profileLoading" class="semantic-loading">
                  <t-loading size="small" text="正在加载画像..." />
                </div>
                <div v-else class="semantic-list">
                  <article v-for="item in semanticProfile.highlights" :key="item.id" class="semantic-item">
                    <div class="semantic-item-head">
                      <t-tag theme="primary" variant="outline">{{ memoryTypeLabel(item.memory_type) }}</t-tag>
                      <span class="semantic-item-meta">权重 {{ formatConfidence(item.salience) }}</span>
                    </div>
                    <p class="semantic-item-text">{{ item.memory_text }}</p>
                    <div class="semantic-item-tags">
                      <t-tag v-for="tag in item.tags" :key="`${item.id}-${tag}`" size="small" variant="light">
                        {{ tag }}
                      </t-tag>
                    </div>
                  </article>
                  <span v-if="semanticProfile.highlights.length === 0" class="semantic-empty">暂无高价值语义记忆</span>
                </div>
              </section>

              <section class="semantic-card">
                <div class="semantic-card-title">最近被召回</div>
                <div v-if="profileLoading" class="semantic-loading">
                  <t-loading size="small" text="正在读取召回记录..." />
                </div>
                <div v-else class="semantic-list">
                  <article v-for="item in semanticProfile.recentMemories" :key="item.id" class="semantic-item">
                    <div class="semantic-item-head">
                      <span class="semantic-item-meta">{{ item.recall_count }} 次召回</span>
                      <span class="semantic-item-meta">{{ formatTime(item.last_recalled_at) }}</span>
                    </div>
                    <p class="semantic-item-text">{{ item.memory_text }}</p>
                  </article>
                  <span v-if="semanticProfile.recentMemories.length === 0" class="semantic-empty">暂无召回记录</span>
                </div>
              </section>
            </div>
          </section>

          <div class="memory-layout">
            <div class="memory-grid">
              <section
                v-for="item in memoryCards"
                :key="item.key"
                class="memory-card"
                :class="{ 'is-active': item.exists, 'is-dirty': item.isDirty }"
              >
                <div class="memory-card-header">
                  <div>
                    <div class="memory-card-kicker">{{ item.key }}</div>
                    <h3 class="memory-card-title">{{ item.label }}</h3>
                    <p class="memory-card-desc">{{ item.description }}</p>
                  </div>
                  <t-tag :theme="item.exists ? 'primary' : 'default'" variant="light">
                    {{ item.exists ? '已保存' : '未设置' }}
                  </t-tag>
                </div>

                <div class="memory-card-meta">
                  <span>建议场景：{{ item.scene }}</span>
                  <span v-if="item.exists">更新时间：{{ formatTime(item.updatedAt) }}</span>
                  <span v-if="item.exists">置信度：{{ formatConfidence(item.confidence) }}</span>
                </div>

                <t-textarea
                  v-model="draftMap[item.key]"
                  :autosize="{ minRows: 4, maxRows: 7 }"
                  :maxlength="500"
                  show-limit-number
                  :placeholder="item.placeholder"
                  class="memory-textarea"
                />

                <div class="memory-card-footnote">{{ item.example }}</div>

                <div class="memory-card-actions">
                  <t-button
                    theme="primary"
                    :loading="savingKey === item.key"
                    :disabled="!canSave(item)"
                    @click="handleSave(item)"
                  >
                    <template #icon><t-icon name="add" /></template>
                    {{ item.exists ? '保存更新' : '添加记忆' }}
                  </t-button>
                  <t-button
                    variant="text"
                    theme="danger"
                    :loading="deletingKey === item.key"
                    :disabled="(!item.exists && !draftMap[item.key]?.trim()) || savingKey === item.key"
                    @click="handleSecondaryAction(item)"
                  >
                    <template #icon><t-icon name="delete" /></template>
                    {{ item.exists ? '删除记忆' : '清空输入' }}
                  </t-button>
                </div>
              </section>
            </div>

            <aside class="memory-aside">
              <section class="aside-card aside-card-emphasis">
                <div class="aside-title">AI 会如何使用这些记忆</div>
                <p class="aside-paragraph">系统会把这些内容作为您的稳定旅行偏好，拼接到后续聊天上下文里。越具体，回答越稳定。</p>
                <div class="active-tags">
                  <t-tag v-for="label in activeLabels" :key="label" theme="primary" variant="light">
                    {{ label }}
                  </t-tag>
                  <span v-if="activeLabels.length === 0" class="aside-empty">还没有保存任何长期记忆</span>
                </div>
              </section>

              <section class="aside-card">
                <div class="aside-title">推荐写法</div>
                <p class="aside-line">写稳定偏好，不写一次性任务。</p>
                <p class="aside-line">写边界和优先级，例如“预算优先，其次再考虑酒店星级”。</p>
                <p class="aside-line">如果某项偏好发生变化，直接覆盖保存即可。</p>
              </section>

              <section class="aside-card">
                <div class="aside-title">适合保存的内容</div>
                <p class="aside-line">预算范围、出行节奏、交通偏好、住宿标准。</p>
                <p class="aside-line">饮食口味、目的地类型偏好、明确禁忌。</p>
                <p class="aside-line">不适合保存“这次五一去杭州”这类临时需求。</p>
              </section>
            </aside>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import GlassButton from '../components/GlassButton.vue';
import { useAuthState } from '../composables/useAuthState';

const router = useRouter();
const { user: sessionUser, authReady, refreshAuthState } = useAuthState();

const isLoggedIn = computed(() => Boolean(sessionUser.value));
const loading = ref(true);
const profileLoading = ref(true);
const savingKey = ref('');
const deletingKey = ref('');
const clearingAll = ref(false);
const memoryMap = ref({});
const draftMap = ref({});
const createEmptySemanticProfile = () => ({
  summary: '暂未形成语义画像记忆。',
  tags: [],
  highlights: [],
  recentMemories: [],
  stats: {
    total_memories: 0,
    active_tags: 0,
    recalled_last_30d: 0,
  },
});
const semanticProfile = ref(createEmptySemanticProfile());

const memoryDefinitions = [
  {
    key: 'budget_preference',
    label: '预算偏好',
    description: '记录您通常愿意投入的预算范围，以及哪些体验值得加价。',
    scene: '预算控制、档位推荐',
    placeholder: '例如：周末两人出游预算希望控制在 3000 元内，住宿可以普通一点，把钱留给特色餐厅和演出。',
    example: '示例：我更关注整体性价比，不追求奢华酒店，但对特色体验和美食愿意适当加预算。',
  },
  {
    key: 'travel_pace',
    label: '旅行节奏',
    description: '说明您偏好轻松慢游还是高密度打卡，以及每天能接受的活动量。',
    scene: '行程松紧度、每日安排',
    placeholder: '例如：我不喜欢赶路，一天安排 2 到 3 个核心点位就够，下午最好有休息时间。',
    example: '示例：希望节奏轻松，早上不要太早出门，晚上可以安排散步或夜景。',
  },
  {
    key: 'transport_preference',
    label: '交通偏好',
    description: '记录您更常用的出行方式，以及是否愿意换乘、步行或打车。',
    scene: '路线规划、交通建议',
    placeholder: '例如：城市内优先地铁和打车，不想频繁换乘，单次步行最好控制在 15 分钟内。',
    example: '示例：跨城优先高铁，市内不排斥打车，但尽量避免复杂公交接驳。',
  },
  {
    key: 'accommodation_preference',
    label: '住宿偏好',
    description: '告诉 AI 您看重地段、安静、空间、设施还是酒店档次。',
    scene: '酒店筛选、住宿推荐',
    placeholder: '例如：更想住在景区和地铁站都方便的位置，房间不必太大，但一定要安静和干净。',
    example: '示例：优先选交通方便的舒适型酒店，不住青旅，也不需要豪华配套。',
  },
  {
    key: 'food_preference',
    label: '饮食偏好',
    description: '记录口味倾向、能接受的辣度，以及喜欢探索的美食类型。',
    scene: '餐厅推荐、菜品建议',
    placeholder: '例如：喜欢本地小馆和小吃，能吃一点辣，但不太爱重油和太甜的菜。',
    example: '示例：更想吃当地代表性餐厅，不偏爱网红摆拍店，优先考虑真实口碑。',
  },
  {
    key: 'destination_preference',
    label: '目的地偏好',
    description: '适合保存您偏爱的城市气质、景观类型或旅行主题。',
    scene: '目的地推荐、风格匹配',
    placeholder: '例如：更喜欢有历史感和生活气息的城市，偏爱江南水乡、古镇、博物馆和老街。',
    example: '示例：相比纯商业化景点，我更喜欢文化体验、自然散步和慢生活氛围。',
  },
  {
    key: 'taboo',
    label: '明确禁忌',
    description: '写清楚绝对不接受的安排，帮助 AI 避免踩雷。',
    scene: '风险规避、偏好过滤',
    placeholder: '例如：不安排高强度徒步，不吃内脏类食物，尽量避免人挤人的热门夜市。',
    example: '示例：对噪音敏感，不住酒吧街附近；海鲜过敏，推荐餐厅时需要避开。',
  },
];

const extractMemoryText = (memory) => {
  const value = memory?.memory_value;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return '';
    }
  }
  return '';
};

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const memoryCards = computed(() => {
  return memoryDefinitions.map((definition) => {
    const memory = memoryMap.value[definition.key] || null;
    const draft = draftMap.value[definition.key] || '';
    const storedText = extractMemoryText(memory);
    return {
      ...definition,
      exists: Boolean(memory),
      confidence: memory?.confidence,
      updatedAt: memory?.updated_at || '',
      storedText,
      isDirty: normalizeText(draft) !== normalizeText(storedText),
    };
  });
});

const activeCount = computed(() => memoryCards.value.filter((item) => item.exists).length);
const dirtyCount = computed(() => memoryCards.value.filter((item) => item.isDirty && normalizeText(draftMap.value[item.key])).length);
const activeLabels = computed(() => memoryCards.value.filter((item) => item.exists).map((item) => item.label));

const latestUpdatedAtLabel = computed(() => {
  const timestamps = memoryCards.value
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .map((item) => new Date(item).getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return '暂无';
  return formatTime(new Date(Math.max(...timestamps)).toISOString());
});

const goBack = () => {
  router.back();
};

const triggerLoginDialog = () => {
  window.dispatchEvent(new CustomEvent('open-auth-dialog', { detail: { mode: 'login' } }));
  const buttons = document.querySelectorAll('.header-right button, .auth-container button');
  for (const btn of buttons) {
    if (btn.textContent.includes('登录') && !btn.textContent.includes('立即')) {
      btn.click();
      return;
    }
  }
  MessagePlugin.info('请点击右上角的“登录”按钮');
};

const fillDrafts = (rows) => {
  const nextMap = {};
  const nextDrafts = {};

  for (const item of Array.isArray(rows) ? rows : []) {
    if (!item || typeof item.memory_key !== 'string') continue;
    nextMap[item.memory_key] = item;
  }

  for (const definition of memoryDefinitions) {
    nextDrafts[definition.key] = extractMemoryText(nextMap[definition.key]);
  }

  memoryMap.value = nextMap;
  draftMap.value = nextDrafts;
};

const normalizeSemanticProfile = (payload) => {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  return {
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : '暂未形成语义画像记忆。',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((item) => typeof item === 'string' && item.trim()) : [],
    highlights: Array.isArray(raw.highlights)
      ? raw.highlights.map((item) => ({
          id: item?.id || `${item?.memory_text || ''}-${item?.updated_at || ''}`,
          memory_text: extractMemoryText({ memory_value: { text: item?.memory_text || '' } }) || '',
          memory_type: typeof item?.memory_type === 'string' ? item.memory_type : 'preference',
          tags: Array.isArray(item?.tags) ? item.tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [],
          salience: Number(item?.salience || 0),
          updated_at: item?.updated_at || '',
        }))
      : [],
    recentMemories: Array.isArray(raw.recent_memories)
      ? raw.recent_memories.map((item) => ({
          id: item?.id || `${item?.memory_text || ''}-${item?.last_recalled_at || ''}`,
          memory_text: extractMemoryText({ memory_value: { text: item?.memory_text || '' } }) || '',
          last_recalled_at: item?.last_recalled_at || '',
          recall_count: Number(item?.recall_count || 0),
        }))
      : [],
    stats: {
      total_memories: Number(stats.total_memories || 0),
      active_tags: Number(stats.active_tags || 0),
      recalled_last_30d: Number(stats.recalled_last_30d || 0),
    },
  };
};

const loadMemoryProfile = async () => {
  profileLoading.value = true;
  try {
    const response = await fetch('/api/ai-chat/memory/profile');
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || result.message || '加载语义画像失败');
    }
    semanticProfile.value = normalizeSemanticProfile(result.semantic_profile);
  } catch (error) {
    semanticProfile.value = createEmptySemanticProfile();
    MessagePlugin.error(error.message || '加载语义画像失败');
  } finally {
    profileLoading.value = false;
  }
};

const refreshMemoryCenter = async () => {
  await Promise.all([loadMemories(), loadMemoryProfile()]);
};

const loadMemories = async () => {
  loading.value = true;
  try {
    const response = await fetch('/api/ai-chat/memory');
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || result.message || '加载长期记忆失败');
    }
    fillDrafts(result.memories || []);
  } catch (error) {
    MessagePlugin.error(error.message || '加载长期记忆失败');
  } finally {
    loading.value = false;
  }
};

const canSave = (item) => {
  if (loading.value || clearingAll.value) return false;
  if (savingKey.value && savingKey.value !== item.key) return false;
  const draft = normalizeText(draftMap.value[item.key]);
  if (!draft) return false;
  return draft !== normalizeText(item.storedText);
};

const handleSave = async (item) => {
  const text = normalizeText(draftMap.value[item.key]);
  if (!text) {
    MessagePlugin.warning('请输入记忆内容');
    return;
  }

  savingKey.value = item.key;
  try {
    const response = await fetch(`/api/ai-chat/memory/${item.key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, confidence: 1 }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || result.message || '保存失败');
    }
    memoryMap.value = {
      ...memoryMap.value,
      [item.key]: result.memory,
    };
    draftMap.value = {
      ...draftMap.value,
      [item.key]: extractMemoryText(result.memory),
    };
    await loadMemoryProfile();
    MessagePlugin.success(item.exists ? '长期记忆已更新' : '长期记忆已添加');
  } catch (error) {
    MessagePlugin.error(error.message || '保存失败');
  } finally {
    savingKey.value = '';
  }
};

const deleteMemory = async (item) => {
  deletingKey.value = item.key;
  try {
    const response = await fetch(`/api/ai-chat/memory/${item.key}`, {
      method: 'DELETE',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || result.message || '删除失败');
    }
    const nextMap = { ...memoryMap.value };
    delete nextMap[item.key];
    memoryMap.value = nextMap;
    draftMap.value = {
      ...draftMap.value,
      [item.key]: '',
    };
    await loadMemoryProfile();
    MessagePlugin.success('长期记忆已删除');
  } catch (error) {
    MessagePlugin.error(error.message || '删除失败');
  } finally {
    deletingKey.value = '';
  }
};

const confirmDelete = (item) => {
  const dialog = DialogPlugin.confirm({
    header: '删除长期记忆',
    body: `确定删除“${item.label}”吗？后续对话将不再参考这项偏好。`,
    confirmBtn: '删除',
    cancelBtn: '取消',
    theme: 'warning',
    onConfirm: async () => {
      await deleteMemory(item);
      dialog.destroy();
    },
    onClose: () => dialog.destroy(),
  });
};

const handleSecondaryAction = (item) => {
  if (item.exists) {
    confirmDelete(item);
    return;
  }
  draftMap.value = {
    ...draftMap.value,
    [item.key]: '',
  };
};

const confirmClearAll = () => {
  const dialog = DialogPlugin.confirm({
    header: '清空全部长期记忆',
    body: '确定清空所有长期记忆吗？这会影响后续所有 AI 对话的个性化上下文。',
    confirmBtn: '全部清空',
    cancelBtn: '取消',
    theme: 'warning',
    onConfirm: async () => {
      clearingAll.value = true;
      try {
        const response = await fetch('/api/ai-chat/memory', {
          method: 'DELETE',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || result.message || '清空失败');
        }
        fillDrafts([]);
        await loadMemoryProfile();
        MessagePlugin.success('长期记忆已清空');
      } catch (error) {
        MessagePlugin.error(error.message || '清空失败');
      } finally {
        clearingAll.value = false;
        dialog.destroy();
      }
    },
    onClose: () => dialog.destroy(),
  });
};

const formatTime = (value) => {
  if (!value) return '暂无';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '暂无';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatConfidence = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '1.00';
  return num.toFixed(2);
};

const memoryTypeLabel = (value) => {
  const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (type === 'constraint') return '约束';
  if (type === 'experience') return '经验';
  if (type === 'interest') return '兴趣';
  return '偏好';
};

onMounted(async () => {
  await refreshAuthState({ refreshSession: true });
  if (isLoggedIn.value) {
    await refreshMemoryCenter();
  } else {
    loading.value = false;
    profileLoading.value = false;
  }
});

watch(isLoggedIn, async (loggedIn) => {
  if (!authReady.value) return;
  if (!loggedIn) {
    fillDrafts([]);
    loading.value = false;
    semanticProfile.value = createEmptySemanticProfile();
    profileLoading.value = false;
    return;
  }
  await refreshMemoryCenter();
});
</script>

<style scoped>
.memory-center-view {
  width: 100%;
  min-height: calc(100vh - var(--header-height));
}

.memory-background {
  width: 100%;
  min-height: calc(100vh - var(--header-height));
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.03) 0%, rgba(168, 237, 234, 0.05) 100%);
  padding: 24px 0 40px;
}

.memory-content {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
  padding: 26px 28px;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(227, 240, 251, 0.92) 0%, rgba(244, 249, 255, 0.88) 55%, rgba(230, 243, 248, 0.9) 100%);
  border: 1px solid rgba(255, 255, 255, 0.56);
  box-shadow: var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

.header-copy {
  max-width: 840px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(170, 202, 233, 0.42);
  color: #2b5d89;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-title {
  margin: 14px 0 10px;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.1;
  color: var(--text-primary);
}

.page-subtitle {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.header-actions {
  flex-shrink: 0;
  align-self: flex-start;
}

.state-card,
.toolbar-card,
.overview-card,
.memory-card,
.aside-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.state-card {
  min-height: 220px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.state-card-login {
  padding: 24px;
}

.overview-grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.overview-card {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 22px;
}

.overview-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.22), transparent 65%);
  pointer-events: none;
}

.overview-card.is-primary {
  background: linear-gradient(145deg, rgba(0, 132, 255, 0.12), rgba(255, 255, 255, 0.78));
}

.overview-label {
  position: relative;
  z-index: 1;
  color: #5d6b82;
  font-size: 13px;
}

.overview-value {
  position: relative;
  z-index: 1;
  margin-top: 10px;
  font-size: 36px;
  font-weight: 700;
  color: #0f172a;
}

.overview-value-sm {
  font-size: 22px;
  line-height: 1.4;
}

.overview-meta {
  position: relative;
  z-index: 1;
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.toolbar-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-radius: 22px;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.toolbar-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar-desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.memory-layout {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(280px, 0.92fr);
  gap: 18px;
  align-items: start;
}

.semantic-shell {
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.semantic-hero,
.semantic-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.semantic-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-radius: 24px;
  padding: 22px 24px;
  background: linear-gradient(140deg, rgba(21, 101, 192, 0.12), rgba(255, 255, 255, 0.86) 55%, rgba(14, 165, 233, 0.08));
}

.semantic-kicker {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #43658f;
}

.semantic-title {
  margin: 10px 0 8px;
  font-size: 28px;
  color: var(--text-primary);
}

.semantic-desc {
  margin: 0;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.semantic-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(90px, 1fr));
  gap: 12px;
  min-width: 320px;
}

.semantic-stat {
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(160, 193, 225, 0.4);
}

.semantic-stat span {
  display: block;
  font-size: 12px;
  color: #5d6b82;
}

.semantic-stat strong {
  display: block;
  margin-top: 8px;
  font-size: 24px;
  color: #0f172a;
}

.semantic-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 1fr 1fr;
  gap: 16px;
}

.semantic-card {
  border-radius: 22px;
  padding: 18px;
}

.semantic-card-summary {
  grid-column: span 1;
}

.semantic-card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.semantic-summary {
  margin: 14px 0 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--text-secondary);
}

.semantic-tags,
.semantic-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.semantic-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.semantic-item {
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(205, 220, 234, 0.6);
}

.semantic-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.semantic-item-meta {
  font-size: 12px;
  color: #6b7280;
}

.semantic-item-text {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
}

.semantic-empty {
  font-size: 12px;
  color: #6b7280;
}

.semantic-loading {
  margin-top: 16px;
  min-height: 64px;
  display: flex;
  align-items: center;
}

.memory-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.memory-card {
  border-radius: 22px;
  padding: 20px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.memory-card.is-active {
  border-color: rgba(0, 132, 255, 0.24);
}

.memory-card.is-dirty {
  box-shadow: 0 14px 40px rgba(0, 132, 255, 0.14);
}

.memory-card:hover {
  transform: translateY(-2px);
}

.memory-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.memory-card-kicker {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b7a90;
}

.memory-card-title {
  margin: 8px 0 6px;
  font-size: 20px;
  color: var(--text-primary);
}

.memory-card-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.memory-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin: 14px 0 12px;
  font-size: 12px;
  color: #6b7280;
}

.memory-textarea {
  margin-bottom: 10px;
}

.memory-card-footnote {
  min-height: 44px;
  font-size: 12px;
  line-height: 1.7;
  color: #6b7280;
}

.memory-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}

.memory-aside {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: calc(var(--header-height) + 18px);
}

.aside-card {
  border-radius: 22px;
  padding: 18px;
}

.aside-card-emphasis {
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.78), rgba(0, 132, 255, 0.08));
}

.aside-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.aside-paragraph,
.aside-line {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.active-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.aside-empty {
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 1100px) {
  .overview-grid,
  .semantic-grid,
  .memory-grid,
  .memory-layout {
    grid-template-columns: 1fr;
  }

  .memory-aside {
    position: static;
  }

  .semantic-hero {
    flex-direction: column;
  }

  .semantic-stats {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 768px) {
  .memory-content {
    padding: 0 16px;
  }

  .page-header,
  .toolbar-card,
  .semantic-hero,
  .memory-card-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .page-header {
    padding: 20px;
  }

  .overview-value {
    font-size: 30px;
  }

  .overview-value-sm {
    font-size: 20px;
  }

  .semantic-stats {
    grid-template-columns: 1fr;
  }
}
</style>

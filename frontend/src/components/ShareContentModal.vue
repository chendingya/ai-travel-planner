<template>
  <t-dialog
    v-model:visible="isVisible"
    header="✨ 生成分享文案"
    width="900px"
    :close-btn="true"
    @close="handleClose"
  >
    <div class="share-modal-container">
      <!-- 配置区域 -->
      <div class="config-section">
        <div class="config-group">
          <label class="config-label">选择平台</label>
          <div class="platform-buttons">
            <t-button
              v-for="p in platforms"
              :key="p.value"
              :variant="selectedPlatform === p.value ? 'primary' : 'outline'"
              @click="selectedPlatform = p.value"
              :disabled="loading"
              class="platform-btn"
            >
              {{ p.label }}
            </t-button>
          </div>
        </div>

        <div class="config-group">
          <label class="config-label">情感基调</label>
          <div class="emotion-buttons">
            <t-button
              v-for="e in emotions"
              :key="e.value"
              :variant="selectedEmotion === e.value ? 'primary' : 'outline'"
              @click="selectedEmotion = e.value"
              :disabled="loading"
              size="small"
              class="emotion-btn"
            >
              {{ e.label }}
            </t-button>
          </div>
        </div>

        <div class="config-group">
          <label class="config-label">重点地点（可选，勾选1-3个）</label>
          <div class="highlights-list">
            <div
              v-for="(location, idx) in availableLocations"
              :key="idx"
              class="highlight-item"
            >
              <t-checkbox
                v-model="selectedHighlights"
                :value="location"
                :disabled="!selectedHighlights.includes(location) && selectedHighlights.length >= 3"
              >
                {{ location }}
              </t-checkbox>
            </div>
          </div>
        </div>

        <div class="config-actions">
          <t-button
            theme="primary"
            @click="generateContent"
            :loading="loading"
            size="large"
            class="generate-btn"
          >
            {{ loading ? '生成中...' : '生成文案' }}
          </t-button>
        </div>
      </div>

      <!-- 结果区域 -->
      <div v-if="generatedContent" class="result-section">
        <div class="result-header">
          <h3>📝 {{ platformName }}文案</h3>
          <div class="result-actions">
            <t-button
              icon="copy"
              variant="outline"
              size="small"
              @click="copyToClipboard"
            >
              复制文案
            </t-button>
            <t-button
              icon="reload"
              variant="outline"
              size="small"
              @click="generateContent"
              :disabled="loading"
            >
              重新生成
            </t-button>
          </div>
        </div>

        <div class="result-content">
          <t-textarea
            v-model="generatedContent"
            placeholder="文案内容"
            :autosize="{ minRows: 10, maxRows: 20 }"
            class="content-textarea"
          />
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading && !generatedContent" class="loading-state">
        <t-loading text="正在为您生成文案..." />
      </div>

      <!-- 错误状态 -->
      <div v-if="error" class="error-state">
        <t-alert theme="error" :title="error" />
      </div>
    </div>
  </t-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  plan: {
    type: Object,
    required: true
  },
  destination: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['update:visible']);

const isVisible = ref(props.visible);

const platforms = [
  { label: '🔴 小红书', value: 'xiaohongshu' },
  { label: '💚 朋友圈', value: 'moments' },
  { label: '🎵 抖音/视频号', value: 'douyin' }
];

const emotions = [
  { label: '🌱 种草', value: '种草' },
  { label: '🌿 治愈', value: '治愈' },
  { label: '📚 攻略', value: '攻略' },
  { label: '✨ emo', value: 'emo' },
  { label: '😂 吐槽', value: '吐槽' }
];

const selectedPlatform = ref('xiaohongshu');
const selectedEmotion = ref('种草');
const selectedHighlights = ref([]);
const generatedContent = ref('');
const loading = ref(false);
const error = ref('');

const platformName = computed(() => {
  const p = platforms.find(x => x.value === selectedPlatform.value);
  return p?.label || '';
});

const availableLocations = computed(() => {
  if (!props.plan?.daily_itinerary) return [];
  const locations = new Set();
  props.plan.daily_itinerary.forEach(day => {
    (day.activities || []).forEach(activity => {
      if (activity.location) locations.add(activity.location);
      if (activity.description) locations.add(activity.description);
    });
  });
  return Array.from(locations).slice(0, 10);
});

const generateContent = async () => {
  if (selectedHighlights.value.length === 0) {
    MessagePlugin.warning('请选择至少1个重点地点');
    return;
  }

  loading.value = true;
  error.value = '';
  generatedContent.value = '';

  try {
    const response = await fetch('/api/generate-share-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: props.destination,
        duration: props.plan.duration || 0,
        dailyItinerary: props.plan.daily_itinerary || [],
        platform: selectedPlatform.value,
        emotion: selectedEmotion.value,
        highlights: selectedHighlights.value,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '生成失败');
    }

    const data = await response.json();
    generatedContent.value = data.content;
    MessagePlugin.success('文案生成成功！');
  } catch (err) {
    error.value = err.message || '生成分享文案时发生错误';
    console.error('Error generating content:', err);
  } finally {
    loading.value = false;
  }
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(generatedContent.value);
    MessagePlugin.success('已复制到剪贴板');
  } catch (err) {
    MessagePlugin.error('复制失败');
  }
};

const handleClose = () => {
  emit('update:visible', false);
};

// 监听 props.visible 变化
watch(() => props.visible, (newVal) => {
  isVisible.value = newVal;
});

// 监听 isVisible 变化
watch(isVisible, (newVal) => {
  if (!newVal) {
    emit('update:visible', false);
  }
});
</script>

<style scoped>
.share-modal-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background: var(--td-bg-color-demo);
  border-radius: 8px;
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-label {
  font-weight: 600;
  color: var(--td-text-color-primary);
  font-size: 14px;
}

.platform-buttons,
.emotion-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.platform-btn {
  min-width: 120px;
}

.emotion-btn {
  min-width: 100px;
}

.highlights-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.highlight-item {
  display: flex;
  align-items: center;
}

.config-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.generate-btn {
  width: 100%;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--td-bg-color-demo);
  border-radius: 8px;
  border: 1px solid var(--td-border-level-1-color);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.content-textarea {
  width: 100%;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.error-state {
  padding: 16px;
}

.result-content {
  width: 100%;
}
</style>

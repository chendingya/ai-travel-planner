<template>
  <div class="planner-container">
    <div class="planner-header">
      <h2 class="planner-title">
        <t-icon name="compass" size="28px" />
        规划你的旅行
      </h2>
      <p class="planner-subtitle">填写以下信息，AI 将为您生成专属旅行方案</p>
    </div>

    <t-form 
      ref="formRef"
      :data="form" 
      label-align="top"
      :rules="formRules"
      @submit="getPlan"
      class="planner-form"
    >
      <t-form-item label="目的地" name="destination">
        <t-input 
          v-model="form.destination" 
          placeholder="例如：日本东京"
          clearable
        >
          <template #suffix-icon>
            <t-button 
              variant="text" 
              shape="circle"
              @click="startRecognition('destination')"
              :disabled="!isSupported"
            >
              <t-icon name="microphone" />
            </t-button>
          </template>
        </t-input>
      </t-form-item>

      <t-row :gutter="16">
        <t-col :span="12">
          <t-form-item label="时长（天）" name="duration">
            <t-input-number 
              v-model="form.duration" 
              :min="1"
              :max="30"
              theme="normal"
              style="width: 100%"
            />
          </t-form-item>
        </t-col>
        <t-col :span="12">
          <t-form-item label="预算（元）" name="budget">
            <t-input-number 
              v-model="form.budget" 
              :min="0"
              :max="1000000"
              theme="normal"
              style="width: 100%"
            />
          </t-form-item>
        </t-col>
      </t-row>

      <t-form-item label="人数" name="travelers">
        <t-input-number 
          v-model="form.travelers" 
          :min="1"
          :max="20"
          theme="normal"
        />
      </t-form-item>

      <t-form-item label="偏好与需求" name="preferences">
        <t-textarea
          v-model="form.preferences"
          placeholder="例如：喜欢美食和动漫，带小孩，需要无障碍设施..."
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
        <template #tips>
          <div class="form-tips">
            <t-icon name="info-circle" size="14px" />
            详细描述您的偏好，AI 将生成更符合您需求的方案
          </div>
        </template>
      </t-form-item>

      <t-form-item>
        <t-space direction="vertical" style="width: 100%">
          <t-button 
            theme="primary" 
            type="submit"
            block
            size="large"
            :loading="loading"
          >
            <t-icon name="rocket" v-if="!loading" />
            {{ loading ? '正在生成方案...' : '生成旅行方案' }}
          </t-button>
          
          <t-button 
            v-if="isListening"
            theme="warning" 
            variant="outline"
            block
            @click="stop"
          >
            <t-icon name="stop-circle" />
            停止语音识别
          </t-button>
        </t-space>
      </t-form-item>
    </t-form>
  </div>
</template>

<script setup>
import { useSpeechRecognition } from '@vueuse/core';
import { ref, watch, onMounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { usePlannerStore } from '../stores/planner';

const emit = defineEmits(['locations-updated', 'fly-to', 'plan-generated']);
const store = usePlannerStore();

// local reactive refs, but initialized from store
const form = ref(Object.assign({}, store.form))

const formRules = {
  destination: [{ required: true, message: '请输入目的地', type: 'error' }],
  duration: [{ required: true, message: '请输入旅行时长', type: 'error' }],
  budget: [{ required: true, message: '请输入预算', type: 'error' }],
  travelers: [{ required: true, message: '请输入人数', type: 'error' }],
};

const plan = ref(store.plan || null);
const loading = ref(false);
const targetField = ref(null);

onMounted(() => {
  // ensure store loaded from localStorage
  store.initFromStorage()
  // sync local form/plan with store
  Object.assign(form.value, store.form)
  if (store.plan) plan.value = store.plan
});

const { isSupported, isListening, result, start, stop } = useSpeechRecognition();

watch(result, (newResult) => {
  if (targetField.value) {
    form.value[targetField.value] = newResult;
  }
});

// watch form and plan and persist to store
watch(form, (v) => {
  store.setForm(v)
}, { deep: true })

watch(plan, (v) => {
  store.setPlan(v)
}, { deep: true })

const startRecognition = (field) => {
  if (!isSupported.value) {
    MessagePlugin.warning('您的浏览器不支持语音识别功能');
    return;
  }
  targetField.value = field;
  start();
  MessagePlugin.info('开始语音识别，请说话...');
};

const getPlan = async () => {
  loading.value = true;
  try {
    const response = await fetch('http://localhost:3001/api/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form.value),
    });
    
    if (!response.ok) {
      throw new Error('生成方案失败');
    }
    
    const data = await response.json();
    
    let parsedPlan;
    
    // 判断后端返回的是结构化 JSON 还是原始文本
    if (data.isStructured && data.plan.daily_itinerary) {
      // 后端已返回结构化 JSON，直接使用
      parsedPlan = {
        daily_itinerary: data.plan.daily_itinerary.map(day => ({
          theme: day.theme || `第 ${day.day} 天`,
          activities: day.activities.map(activity => ({
            time: activity.time || '',
            description: `${activity.location || ''} - ${activity.description || ''}`.trim(),
            coords: activity.latitude && activity.longitude 
              ? [activity.latitude, activity.longitude] 
              : null
          }))
        })),
        budget_breakdown: data.plan.budget_breakdown,
        tips: data.plan.tips
      };
    } else {
      // 降级处理：后端返回原始文本（兼容旧版或 AI 未按格式输出）
      const raw = data.plan || '';
      let mainText = raw;
      const cutoffMatch = raw.match(/\n\s*【[\s\S]*$/);
      if (cutoffMatch) {
        mainText = raw.slice(0, cutoffMatch.index).trim();
      }

      const dayBlocks = mainText.split(/\n(?=Day\s*\d+|第\s*\d+\s*天)/i).map(s => s.trim()).filter(Boolean);

      const daily_itinerary = dayBlocks.map((block, idx) => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        let theme = `第 ${idx + 1} 天`;
        let contentLines = lines;

        if (/^Day\s*\d+/i.test(lines[0]) || /^第\s*\d+\s*天/.test(lines[0])) {
          theme = lines[0];
          contentLines = lines.slice(1);
        }

        const metaKeywords = ['旅行天数', '目的地', '预算', '团队人数', '人数', '偏好', '喜欢', '元人民币', '天', '人', '签证', '机票', '交通卡', '语言'];
        const filtered = contentLines.filter(line => {
          if (/^-\s*/.test(line)) {
            const stripped = line.replace(/^-\s*/, '');
            if (metaKeywords.some(kw => stripped.includes(kw))) return false;
          }
          if (line.length < 20 && metaKeywords.some(kw => line.includes(kw))) return false;
          if (/^\d+\s*[天人元]/.test(line)) return false;
          if (/^[#*]+/.test(line)) return false; // 过滤 markdown 标题
          return true;
        });

        const activities = [];
        for (const line of filtered) {
          if (/^【|^\[|^\{/.test(line)) continue;
          if (!line || line.length < 3) continue;

          const parts = line.split(/[-–—]/).map(p => p.trim()).filter(Boolean);
          if (parts.length > 1 && !line.includes(':') && !line.includes('：')) {
            for (const part of parts) {
              if (part.length < 3 || metaKeywords.some(kw => part.includes(kw))) continue;
              activities.push({ time: '', description: part, coords: null });
            }
          } else {
            if (line.includes(':')) {
              const [time, ...desc] = line.split(':');
              activities.push({ time: time.trim(), description: desc.join(':').trim(), coords: null });
            } else if (line.includes('：')) {
              const [time, ...desc] = line.split('：');
              activities.push({ time: time.trim(), description: desc.join('：').trim(), coords: null });
            } else {
              activities.push({ time: '', description: line, coords: null });
            }
          }
        }

        return { theme, activities };
      });

      parsedPlan = { daily_itinerary };
    }
    
  plan.value = parsedPlan;
    MessagePlugin.success('旅行方案生成成功！');

    // 收集地图坐标
    const mapLocations = [];
    const geocode = async (query) => {
      if (!query) return null;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.length > 0) {
          return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        }
        return null;
      } catch (err) {
        console.error('Geocode error:', err);
        return null;
      }
    };

    for (const day of parsedPlan.daily_itinerary) {
      for (const activity of day.activities) {
        if (activity.coords) {
          mapLocations.push({ name: activity.description, coords: activity.coords });
        } else {
          const query = form.value.destination ? `${form.value.destination} ${activity.description}` : activity.description;
          const coords = await geocode(query);
          if (coords) {
            activity.coords = coords; // 更新活动坐标
            mapLocations.push({ name: activity.description, coords });
          }
        }
      }
    }

    // persist locations to store and emit
    store.setLocations(mapLocations)
    emit('locations-updated', mapLocations);
    
    // 发射plan-generated事件,切换到方案详情页
    emit('plan-generated');
    } catch (error) {
    console.error('Error generating plan:', error);
    MessagePlugin.error('生成旅行方案时出错，请稍后重试');
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.planner-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.planner-header {
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
}

.planner-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.planner-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.planner-form {
  margin-bottom: 24px;
}

/* 按钮内图标与文字水平垂直居中对齐 */
.planner-form :deep(.t-button__text) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px;
}
.planner-form :deep(.t-button__text) .t-icon {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  vertical-align: middle !important;
}

.planner-form :deep(.t-form__item) {
  margin-bottom: 20px;
}

.planner-form :deep(.t-input),
.planner-form :deep(.t-textarea__inner),
.planner-form :deep(.t-input-number) {
  width: 100%;
}

.form-tips {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

@media (max-width: 768px) {
  .planner-container {
    padding: 16px;
  }
  
  .planner-title {
    font-size: 20px;
  }
}
</style>
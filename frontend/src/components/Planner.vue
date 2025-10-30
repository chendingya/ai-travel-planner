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

    <!-- 生成的计划 -->
    <div v-if="plan" class="plan-result">
      <div class="result-header">
        <h3 class="result-title">
          <t-icon name="check-circle" />
          您的专属旅行方案
        </h3>
        <t-button 
          theme="success" 
          variant="outline"
          @click="savePlan"
          :loading="saving"
        >
          <t-icon name="save" />
          保存方案
        </t-button>
      </div>

      <t-collapse :default-value="['0']" class="plan-collapse">
        <t-collapse-panel 
          v-for="(day, index) in plan.daily_itinerary" 
          :key="index"
          :value="String(index)"
          :header="`第 ${index + 1} 天：${day.theme || '精彩行程'}`"
        >
          <t-timeline class="day-timeline">
            <t-timeline-item 
              v-for="(activity, i) in day.activities" 
              :key="i"
              :label="activity.time"
            >
              <div class="activity-item" @click="flyToLocation(activity.coords)">
                <div class="activity-content">{{ activity.description }}</div>
                <t-tag 
                  v-if="activity.coords" 
                  theme="primary" 
                  variant="light"
                  size="small"
                >
                  <t-icon name="location" size="12px" />
                  点击定位
                </t-tag>
              </div>
            </t-timeline-item>
          </t-timeline>
        </t-collapse-panel>
      </t-collapse>
    </div>
  </div>
</template>

<script setup>
import { useSpeechRecognition } from '@vueuse/core';
import { ref, watch } from 'vue';
import { supabase } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';

const emit = defineEmits(['locations-updated', 'fly-to']);

const form = ref({
  destination: '',
  duration: 5,
  budget: 10000,
  travelers: 1,
  preferences: '',
});

const formRules = {
  destination: [{ required: true, message: '请输入目的地', type: 'error' }],
  duration: [{ required: true, message: '请输入旅行时长', type: 'error' }],
  budget: [{ required: true, message: '请输入预算', type: 'error' }],
  travelers: [{ required: true, message: '请输入人数', type: 'error' }],
};

const plan = ref(null);
const loading = ref(false);
const saving = ref(false);
const targetField = ref(null);

const { isSupported, isListening, result, start, stop } = useSpeechRecognition();

watch(result, (newResult) => {
  if (targetField.value) {
    form.value[targetField.value] = newResult;
  }
});

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
    
        // 更健壮的解析：只解析真实的行程 Day 段，过滤元数据和后续预算/交通等区块
    const raw = data.plan || '';
    
    // 第一步：去掉后面的描述性区块（例如【交通】【住宿】等）
    let mainText = raw;
    const cutoffMatch = raw.match(/\n\s*【[\s\S]*$/);
    if (cutoffMatch) {
      mainText = raw.slice(0, cutoffMatch.index).trim();
    }

    // 第二步：以 "Day N" 或 "第 N 天" 为分隔符拆分成日程块
    const dayBlocks = mainText.split(/\n(?=Day\s*\d+|第\s*\d+\s*天)/i).map(s => s.trim()).filter(Boolean);

    const daily_itinerary = dayBlocks.map((block, idx) => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      let theme = `第 ${idx + 1} 天`;
      let contentLines = lines;

      // 如果首行是 Day 标题，提取主题并去掉首行
      if (/^Day\s*\d+/i.test(lines[0]) || /^第\s*\d+\s*天/.test(lines[0])) {
        theme = lines[0];
        contentLines = lines.slice(1);
      }

      // 第三步：过滤掉元数据行（如 "- 旅行天数"、"- 目的地"、"2天"、"日本东京" 等单行元数据）
      const metaKeywords = ['旅行天数', '目的地', '预算', '团队人数', '人数', '偏好', '喜欢', '元人民币', '天', '人'];
      const filtered = contentLines.filter(line => {
        // 如果是纯列表项（以 - 开头且后面是元数据关键词），跳过
        if (/^-\s*/.test(line)) {
          const stripped = line.replace(/^-\s*/, '');
          if (metaKeywords.some(kw => stripped.includes(kw))) return false;
        }
        // 如果行很短且包含元数据关键词（例如 "2天" "10人" "10000元人民币"），跳过
        if (line.length < 20 && metaKeywords.some(kw => line.includes(kw))) return false;
        // 如果整行只是数字+单位（如 "2天"），跳过
        if (/^\d+\s*[天人元]/.test(line)) return false;
        return true;
      });

      // 第四步：将每一行按分隔符拆成若干活动（例如 a-b-c）
      const activities = [];
      for (const line of filtered) {
        // 跳过可能的元数据行（以【或[ 开头）
        if (/^【|^\[|^\{/.test(line)) continue;
        if (!line) continue;

        // 如果有多个分隔符（-、,、/ 等），拆成多个活动
        const parts = line.split(/[-–—,，、；;\/\\]/).map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          for (const part of parts) {
            // 再次过滤短元数据片段
            if (part.length < 3 || metaKeywords.some(kw => part.includes(kw))) continue;
            activities.push({ time: '', description: part });
          }
        } else {
          // 如果含有冒号 time: description 则分离
          if (line.includes(':')) {
            const [time, ...desc] = line.split(':');
            activities.push({ time: time.trim(), description: desc.join(':').trim() });
          } else if (line.includes('：')) {
            const [time, ...desc] = line.split('：');
            activities.push({ time: time.trim(), description: desc.join('：').trim() });
          } else {
            activities.push({ time: '', description: line });
          }
        }
      }

      return { theme, activities };
    });

    const parsedPlan = { daily_itinerary };
    
    plan.value = parsedPlan;
    MessagePlugin.success('旅行方案生成成功！');

    // 尝试收集活动坐标：优先使用已有 coords 字段，若无则调用 Nominatim 进行地理编码
    const mapLocations = [];

    // 简单的地理编码函数（使用 OpenStreetMap Nominatim）
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

    // 为每个活动获取坐标（若活动已有 coords 则直接使用）
    for (const day of parsedPlan.daily_itinerary) {
      for (const activity of day.activities) {
        if (activity.coords) {
          mapLocations.push({ name: activity.description, coords: activity.coords });
        } else {
          // 尝试根据描述地名进行地理编码，优先加上目的地上下文以提高命中率
          const query = form.value.destination ? `${form.value.destination} ${activity.description}` : activity.description;
          const coords = await geocode(query);
          if (coords) {
            mapLocations.push({ name: activity.description, coords });
          }
        }
      }
    }

    emit('locations-updated', mapLocations);

  } catch (error) {
    console.error('Error generating plan:', error);
    MessagePlugin.error('生成旅行方案时出错，请稍后重试');
  } finally {
    loading.value = false;
  }
};

const savePlan = async () => {
  saving.value = true;
  try {
    // 更稳健地获取用户信息（兼容不同 supabase SDK 版本）
    let user = null;
    try {
      const userRes = await supabase.auth.getUser();
      if (userRes && userRes.data && userRes.data.user) user = userRes.data.user;
    } catch (e) {
      // ignore
    }
    if (!user) {
      try {
        const sess = await supabase.auth.getSession();
        if (sess && sess.data && sess.data.session && sess.data.session.user) user = sess.data.session.user;
      } catch (e) {
        // ignore
      }
    }

    if (!user) {
      MessagePlugin.warning('请先登录以保存您的方案');
      saving.value = false;
      return;
    }

    // 插入数据到 plans 表
    const payload = {
      user_id: user.id,
      destination: form.value.destination,
      duration: form.value.duration,
      budget: form.value.budget,
      travelers: form.value.travelers,
      preferences: form.value.preferences,
      plan_details: plan.value,
    };

    const { data: insertData, error } = await supabase.from('plans').insert([payload]);
    if (error) {
      console.error('Supabase insert error:', error);
      MessagePlugin.error(error.message || '保存方案失败，请确认您已登录');
      saving.value = false;
      return;
    }

    MessagePlugin.success('方案保存成功！');
  } catch (error) {
    console.error('Error saving plan:', error);
    MessagePlugin.error(error.message || '保存方案失败，请确认您已登录');
  } finally {
    saving.value = false;
  }
};

const flyToLocation = (coords) => {
  if (coords) {
    emit('fly-to', coords);
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

.plan-result {
  margin-top: 32px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.result-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plan-collapse {
  background: transparent;
}

.day-timeline {
  padding: 12px 0;
}

.activity-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
}

.activity-item:hover {
  background-color: #f6f9ff;
}

.activity-content {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .planner-container {
    padding: 16px;
  }
  
  .planner-title {
    font-size: 20px;
  }
  
  .result-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
}
</style>
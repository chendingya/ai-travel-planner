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
    
    const parsedPlan = {
      daily_itinerary: data.plan.split('\n\nDay').map((dayString, index) => {
        if (index === 0) {
          const lines = dayString.split('\n');
          const theme = lines[0].replace(/Day \d+: /,'');
          const activities = lines.slice(1).filter(line => line.trim()).map(line => {
            const [time, ...description] = line.split(':');
            return { time: time.trim(), description: description.join(':').trim() };
          });
          return { theme, activities };
        }
        const lines = dayString.split('\n');
        const theme = lines[0].replace(/\d+: /,'');
        const activities = lines.slice(1).filter(line => line.trim()).map(line => {
            const [time, ...description] = line.split(':');
            return { time: time.trim(), description: description.join(':').trim() };
        });
        return { theme, activities };
      })
    };
    
    plan.value = parsedPlan;
    MessagePlugin.success('旅行方案生成成功！');

    const mapLocations = [];
    parsedPlan.daily_itinerary.forEach(day => {
      day.activities.forEach(activity => {
        if (activity.coords) {
          mapLocations.push({ name: activity.description, coords: activity.coords });
        }
      });
    });
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      MessagePlugin.warning('请先登录以保存您的方案');
      saving.value = false;
      return;
    }

    const { data, error } = await supabase
      .from('plans')
      .insert([
        {
          user_id: session.user.id,
          destination: form.value.destination,
          duration: form.value.duration,
          budget: form.value.budget,
          travelers: form.value.travelers,
          preferences: form.value.preferences,
          plan_details: plan.value,
        },
      ]);
      
    if (error) throw error;
    MessagePlugin.success('方案保存成功！');
  } catch (error) {
    console.error('Error saving plan:', error);
    MessagePlugin.error('保存方案失败，请确认您已登录');
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
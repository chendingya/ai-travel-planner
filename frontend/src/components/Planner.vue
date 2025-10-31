<template>
  <div class="planner-container">
    <div class="planner-header">
      <h2 class="planner-title">
        <t-icon name="compass" size="28px" />
        规划你的旅行
      </h2>
      <p class="planner-subtitle">填写以下信息，AI 将为您生成专属旅行方案</p>
    </div>

    <div class="planner-form">
      <!-- 快捷输入区域 -->
      <div class="quick-input-section">
        <div class="section-title">
          <t-icon name="chat" />
          快捷输入
          <span class="section-tip">（语音或文字输入，自动解析）</span>
        </div>
        <div class="quick-input-wrapper">
          <t-textarea
            v-model="quickInput"
            placeholder="例如：我想去日本东京玩5天，预算1万元，2个人，喜欢美食和动漫..."
            :autosize="{ minRows: 3, maxRows: 6 }"
            class="quick-input"
          />
          <div class="input-actions">
            <t-button 
              :theme="isQuickListening ? 'warning' : 'primary'"
              variant="outline"
              @click="startQuickRecognition"
              :disabled="!isSupported"
            >
              <t-icon :name="isQuickListening ? 'stop-circle-1' : 'microphone'" />
              {{ isQuickListening ? '停止录音' : '语音输入（中文）' }}
            </t-button>
            <t-button 
              theme="success"
              @click="parseQuickInput"
              :loading="parsing"
              :disabled="!quickInput.trim()"
            >
              <t-icon name="check-circle" v-if="!parsing" />
              {{ parsing ? '解析中...' : '自动解析' }}
            </t-button>
          </div>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="divider">
        <span>或手动填写</span>
      </div>

      <!-- 手动输入表单 -->
      <div class="manual-form">
        <div class="form-row">
          <div class="form-item">
            <label class="form-label">目的地</label>
            <div class="input-with-voice">
              <t-input 
                v-model="form.destination" 
                placeholder="例如：日本东京"
                class="form-input"
              />
              <t-button 
                variant="text" 
                shape="circle"
                @click="startFieldRecognition('destination')"
                :disabled="!isSupported"
                :class="['voice-btn', { 'listening': isFieldListening && currentField === 'destination' }]"
              >
                <t-icon :name="isFieldListening && currentField === 'destination' ? 'stop-circle-1' : 'microphone'" />
              </t-button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-item half">
            <label class="form-label">时长（天）</label>
            <t-input-number 
              v-model="form.duration" 
              :min="1"
              :max="30"
              theme="normal"
              class="form-input"
            />
          </div>
          <div class="form-item half">
            <label class="form-label">预算（元）</label>
            <t-input-number 
              v-model="form.budget" 
              :min="0"
              :max="1000000"
              theme="normal"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-item">
            <label class="form-label">人数</label>
            <t-input-number 
              v-model="form.travelers" 
              :min="1"
              :max="20"
              theme="normal"
              class="form-input"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-item">
            <label class="form-label">偏好与需求</label>
            <t-textarea
              v-model="form.preferences"
              placeholder="例如：喜欢美食和动漫，带小孩，需要无障碍设施..."
              :autosize="{ minRows: 3, maxRows: 6 }"
              class="form-input"
            />
            <div class="form-tip">
              <t-icon name="info-circle" size="14px" />
              详细描述您的偏好，AI 将生成更符合您需求的方案
            </div>
          </div>
        </div>

        <div class="form-actions">
          <t-button 
            theme="primary" 
            size="large"
            block
            @click="handleSubmit"
            :loading="loading"
            :disabled="!isFormValid"
          >
            <t-icon name="rocket" v-if="!loading" />
            {{ loading ? '正在生成方案...' : '生成旅行方案' }}
          </t-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSpeechRecognition } from '@vueuse/core';
import { ref, watch, onMounted, computed } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { usePlannerStore } from '../stores/planner';

const emit = defineEmits(['locations-updated', 'fly-to', 'plan-generated']);
const store = usePlannerStore();

// 表单数据
const form = ref({
  destination: '',
  duration: 3,
  budget: 5000,
  travelers: 2,
  preferences: ''
});

// 快捷输入
const quickInput = ref('');
const parsing = ref(false);

const plan = ref(store.plan || null);
const loading = ref(false);
const targetField = ref(null);

// 语音识别 - 快捷输入
const {
  isSupported,
  isListening: isQuickListening,
  result: quickResult,
  start: startQuick,
  stop: stopQuick
} = useSpeechRecognition({ 
  continuous: true,
  lang: 'zh-CN' // 设置为中文
});

// 语音识别 - 单字段
const {
  isListening: isFieldListening,
  result: fieldResult,
  start: startField,
  stop: stopField
} = useSpeechRecognition({
  lang: 'zh-CN' // 设置为中文
});

// 表单验证
const isFormValid = computed(() => {
  return form.value.destination.trim() !== '' &&
         form.value.duration > 0 &&
         form.value.budget > 0 &&
         form.value.travelers > 0;
});

onMounted(() => {
  store.initFromStorage();
  Object.assign(form.value, store.form);
  if (store.plan) plan.value = store.plan;
});

// 监听快捷输入语音结果
watch(quickResult, (newResult) => {
  if (newResult) {
    quickInput.value = newResult;
  }
});

// 监听单字段语音结果
watch(fieldResult, (newResult) => {
  if (targetField.value && newResult) {
    form.value[targetField.value] = newResult;
    stopField();
    targetField.value = null;
  }
});

// 持久化表单和方案
watch(form, (v) => {
  store.setForm(v);
}, { deep: true });

watch(plan, (v) => {
  store.setPlan(v);
}, { deep: true });

// 开始快捷输入语音识别
const startQuickRecognition = () => {
  if (!isSupported.value) {
    MessagePlugin.warning('您的浏览器不支持语音识别功能');
    return;
  }
  
  if (isQuickListening.value) {
    // 如果正在录音，则停止
    stopQuick();
    MessagePlugin.info('语音识别已停止');
  } else {
    // 开始新的录音
    startQuick();
    MessagePlugin.info('开始语音识别，请说话...（支持中文）');
  }
};

// 开始单字段语音识别
const startFieldRecognition = (field) => {
  if (!isSupported.value) {
    MessagePlugin.warning('您的浏览器不支持语音识别功能');
    return;
  }
  targetField.value = field;
  startField();
  MessagePlugin.info('开始语音识别，请说话...（支持中文）');
};

// 解析快捷输入文本
const parseQuickInput = async () => {
  if (!quickInput.value.trim()) {
    MessagePlugin.warning('请先输入内容');
    return;
  }

  parsing.value = true;
  try {
    console.log('📤 发送解析请求:', quickInput.value);
    
    // 使用 AI 解析文本
    const response = await fetch('http://localhost:3001/api/parse-travel-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: quickInput.value }),
    });

    console.log('📥 收到响应状态:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ API 错误:', errorData);
      throw new Error(errorData.message || '解析失败');
    }

    const data = await response.json();
    console.log('✅ 解析结果:', data);
    
    // 填充表单
    let filledCount = 0;
    if (data.destination) {
      form.value.destination = data.destination;
      filledCount++;
    }
    if (data.duration) {
      form.value.duration = parseInt(data.duration);
      filledCount++;
    }
    if (data.budget) {
      form.value.budget = parseInt(data.budget);
      filledCount++;
    }
    if (data.travelers) {
      form.value.travelers = parseInt(data.travelers);
      filledCount++;
    }
    if (data.preferences) {
      form.value.preferences = data.preferences;
      filledCount++;
    }

    if (filledCount > 0) {
      MessagePlugin.success(`解析成功！已自动填写 ${filledCount} 个字段`);
    } else {
      MessagePlugin.warning('未能从输入中提取有效信息，请手动填写表单');
    }
  } catch (error) {
    console.error('❌ 解析错误:', error);
    MessagePlugin.error(`解析失败: ${error.message}，将使用简单匹配`);
    
    // 降级方案：简单正则匹配
    const text = quickInput.value;
    let matchCount = 0;
    
    // 提取目的地
    const destMatch = text.match(/(?:去|到|想去|想到)([^\s，,。.]+?)(?:玩|旅游|旅行|游玩)/);
    if (destMatch) {
      form.value.destination = destMatch[1].trim();
      matchCount++;
    }
    
    // 提取天数
    const durationMatch = text.match(/(\d+)(?:天|日)/);
    if (durationMatch) {
      form.value.duration = parseInt(durationMatch[1]);
      matchCount++;
    }
    
    // 提取预算
    const budgetMatch = text.match(/(?:预算|花费|费用|价格)(?:大概|大约|约)?(\d+)(?:元|块|万)?/);
    if (budgetMatch) {
      let budget = parseInt(budgetMatch[1]);
      if (text.includes('万')) budget *= 10000;
      form.value.budget = budget;
      matchCount++;
    }
    
    // 提取人数
    const travelersMatch = text.match(/(\d+)(?:个)?人/);
    if (travelersMatch) {
      form.value.travelers = parseInt(travelersMatch[1]);
      matchCount++;
    }
    
    // 提取偏好
    const preferenceKeywords = ['喜欢', '爱好', '偏好', '想要', '需要', '带'];
    for (const keyword of preferenceKeywords) {
      const idx = text.indexOf(keyword);
      if (idx !== -1) {
        form.value.preferences = text.substring(idx).trim();
        matchCount++;
        break;
      }
    }
    
    if (matchCount > 0) {
      MessagePlugin.warning(`使用简单匹配填写了 ${matchCount} 个字段，请检查并补充信息`);
    } else {
      MessagePlugin.error('无法识别输入内容，请手动填写表单');
    }
  } finally {
    parsing.value = false;
  }
};

// 提交表单
const handleSubmit = async () => {
  if (!isFormValid.value) {
    MessagePlugin.warning('请填写完整的旅行信息');
    return;
  }
  
  await getPlan();
};

// 生成方案
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
    
    if (data.isStructured && data.plan.daily_itinerary) {
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
          if (/^[#*]+/.test(line)) return false;
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
            activity.coords = coords;
            mapLocations.push({ name: activity.description, coords });
          }
        }
      }
    }

    store.setLocations(mapLocations);
    emit('locations-updated', mapLocations);
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
  overflow: visible;
  box-sizing: border-box;
  padding: 0;
  background: transparent;
}

.planner-header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-bottom: 32px;
  padding: 32px 24px;
  background: linear-gradient(135deg, var(--td-brand-color-8) 0%, var(--td-brand-color-6) 30%, var(--td-brand-color-4) 70%, var(--td-brand-color-2) 100%);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: none;
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  text-align: center;
}

.planner-header:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

.planner-title {
  font-size: 28px;
  font-weight: 600;
  color: white;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}

.planner-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

.planner-form {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: none;
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  padding: 32px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.planner-form:hover {
  box-shadow: var(--glass-shadow-hover);
  transform: translateY(-2px);
}

/* 快捷输入区域 */
.quick-input-section {
  margin-bottom: 32px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.section-tip {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 4px;
}

.quick-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-input :deep(.t-textarea__inner) {
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 14px;
  transition: all 0.3s ease;
}

.quick-input :deep(.t-textarea__inner:hover) {
  border-color: rgba(0, 0, 0, 0.12);
}

.quick-input :deep(.t-textarea__inner:focus) {
  border-color: rgba(0, 0, 0, 0.15);
  box-shadow: none;
  outline: none;
}

.input-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* 分隔线 */
.divider {
  display: flex;
  align-items: center;
  margin: 32px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(0, 0, 0, 0.1), transparent);
}

.divider span {
  padding: 0 16px;
  background: var(--glass-bg);
  border-radius: 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

/* 手动表单 */
.manual-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item.half {
  flex: 1;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.input-with-voice {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-with-voice .form-input {
  flex: 1;
}

.voice-btn {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  padding: 0 !important;
  transition: all 0.3s ease;
}

.voice-btn.listening {
  color: #e34d59 !important;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

.form-input :deep(.t-input),
.form-input :deep(.t-textarea__inner),
.form-input :deep(.t-input-number) {
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: all 0.3s ease;
}

.form-input :deep(.t-input:hover),
.form-input :deep(.t-textarea__inner:hover),
.form-input :deep(.t-input-number:hover) {
  border-color: rgba(0, 0, 0, 0.12);
}

.form-input :deep(.t-input:focus),
.form-input :deep(.t-textarea__inner:focus),
.form-input :deep(.t-input-number:focus) {
  border-color: rgba(0, 0, 0, 0.15);
  box-shadow: none;
  outline: none;
}

.form-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 12px;
  background: rgba(0, 132, 255, 0.05);
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
  margin-top: 4px;
}

.form-actions {
  margin-top: 12px;
}

.form-actions :deep(.t-button) {
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  height: 50px;
}

@media (max-width: 768px) {
  .planner-container {
    padding: 0;
  }
  
  .planner-header {
    padding: 24px 16px;
  }
  
  .planner-form {
    padding: 24px;
  }
  
  .planner-title {
    font-size: 20px;
  }
  
  .form-row {
    flex-direction: column;
  }
  
  .input-actions {
    flex-direction: column;
  }
  
  .input-actions :deep(.t-button) {
    width: 100%;
  }
}
</style>
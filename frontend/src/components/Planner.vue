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
            placeholder="例如：我想去北京玩5天，预算1万元，2个人，喜欢美食和动漫..."
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
                :class="['voice-btn', { 'listening': isFieldListening && targetField === 'destination' }]"
              >
                <t-icon :name="isFieldListening && targetField === 'destination' ? 'stop-circle-1' : 'microphone'" />
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
import { supabase } from '../supabase';

// 登录状态
const isLoggedIn = ref(false);

// 检查登录状态
const checkLoginStatus = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    isLoggedIn.value = !!session;
  } catch (error) {
    console.error('检查登录状态失败:', error);
    isLoggedIn.value = false;
  }
};

// 触发登录弹窗
const triggerLogin = () => {
  const buttons = document.querySelectorAll('.header-right button, .auth-container button');
  for (const btn of buttons) {
    if (btn.textContent.includes('登录') && !btn.textContent.includes('立即')) {
      btn.click();
      return;
    }
  }
  MessagePlugin.info('请点击右上角的"登录"按钮进行登录');
};

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
// 语音会话增量缓存
const quickPrevResult = ref('');
const fieldPrevResult = ref('');

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
  interimResults: true,
  lang: 'zh-CN' // 设置为中文
});

// 语音识别 - 单字段
const {
  isListening: isFieldListening,
  result: fieldResult,
  start: startField,
  stop: stopField
} = useSpeechRecognition({
  continuous: true,
  interimResults: true,
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

// 简单的增量合并算法：尽量不覆盖，优先拼接新增部分
const appendDelta = (current, prev, next) => {
  const cur = current || '';
  const oldR = prev || '';
  const neu = next || '';
  if (!neu) return cur;
  // 已包含 -> 不处理
  if (cur.includes(neu)) return cur;
  // 新结果包含旧结果 -> 追加新差量
  if (oldR && neu.startsWith(oldR)) {
    return cur + neu.slice(oldR.length);
  }
  // 旧结果包含新结果（可能是临时结果回退）-> 忽略
  if (oldR && oldR.startsWith(neu)) {
    return cur;
  }
  // 计算 current 末尾与 neu 开头的最大重叠
  const max = Math.min(cur.length, neu.length);
  for (let k = max; k > 0; k--) {
    if (cur.slice(-k) === neu.slice(0, k)) {
      return cur + neu.slice(k);
    }
  }
  // 无重叠，追加并加空格
  const sep = cur && !/\s$/.test(cur) ? ' ' : '';
  return cur + sep + neu;
};

// 监听快捷输入语音结果
watch(quickResult, (newResult) => {
  if (!newResult) return;
  if (isQuickListening.value) {
    quickInput.value = appendDelta(quickInput.value, quickPrevResult.value, newResult);
    quickPrevResult.value = newResult;
  }
});

// 监听单字段语音结果
watch(fieldResult, (newResult) => {
  if (!newResult || !targetField.value) return;
  if (isFieldListening.value) {
    const field = targetField.value;
    form.value[field] = appendDelta(form.value[field], fieldPrevResult.value, newResult);
    fieldPrevResult.value = newResult;
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
    // 正在录音 -> 停止，不清空已有文本
    stopQuick();
    MessagePlugin.info('语音识别已停止');
    // 结束会话，重置增量缓存
    quickPrevResult.value = '';
  } else {
    // 开启新会话：覆盖前面的内容（需求）
    quickInput.value = '';
    quickPrevResult.value = '';
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
  // 同一字段再次点击 -> 停止当前录音
  if (isFieldListening.value && targetField.value === field) {
    stopField();
    MessagePlugin.info('语音识别已停止');
    targetField.value = null;
    fieldPrevResult.value = '';
    return;
  }
  // 开启新会话：覆盖该字段原有内容
  targetField.value = field;
  form.value[field] = '';
  fieldPrevResult.value = '';
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
    
    // 标记提取情况
    let filledCount = 0;
    let hasDestination = false, hasDuration = false, hasBudget = false, hasTravelers = false, hasPreferences = false;

    if (data.destination) {
      form.value.destination = data.destination;
      hasDestination = true; filledCount++;
    }
    if (data.duration) {
      form.value.duration = parseInt(data.duration);
      hasDuration = true; filledCount++;
    }
    if (data.budget) {
      form.value.budget = parseInt(data.budget);
      hasBudget = true; filledCount++;
    }
    if (data.travelers) {
      form.value.travelers = parseInt(data.travelers);
      hasTravelers = true; filledCount++;
    }
    if (data.preferences) {
      form.value.preferences = data.preferences;
      hasPreferences = true; filledCount++;
    }

    // 未提取到的字段清空（按你的需求）
    if (!hasDestination) form.value.destination = '';
    if (!hasDuration) form.value.duration = null;
    if (!hasBudget) form.value.budget = null;
    if (!hasTravelers) form.value.travelers = null;
    if (!hasPreferences) form.value.preferences = '';

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
  let hasDestination = false, hasDuration = false, hasBudget = false, hasTravelers = false, hasPreferences = false;
    
    // 提取目的地
    const destMatch = text.match(/(?:去|到|想去|想到)([^\s，,。.]+?)(?:玩|旅游|旅行|游玩)/);
    if (destMatch) {
      form.value.destination = destMatch[1].trim();
      hasDestination = true; matchCount++;
    }
    
    // 提取天数
    const durationMatch = text.match(/(\d+)(?:天|日)/);
    if (durationMatch) {
      form.value.duration = parseInt(durationMatch[1]);
      hasDuration = true; matchCount++;
    }
    
    // 提取预算
    const budgetMatch = text.match(/(?:预算|花费|费用|价格)(?:大概|大约|约)?(\d+)(?:元|块|万)?/);
    if (budgetMatch) {
      let budget = parseInt(budgetMatch[1]);
      if (text.includes('万')) budget *= 10000;
      form.value.budget = budget;
      hasBudget = true; matchCount++;
    }
    
    // 提取人数
    const travelersMatch = text.match(/(\d+)(?:个)?人/);
    if (travelersMatch) {
      form.value.travelers = parseInt(travelersMatch[1]);
      hasTravelers = true; matchCount++;
    }
    
    // 提取偏好
    const preferenceKeywords = ['喜欢', '爱好', '偏好', '想要', '需要', '带'];
    for (const keyword of preferenceKeywords) {
      const idx = text.indexOf(keyword);
      if (idx !== -1) {
        form.value.preferences = text.substring(idx).trim();
        hasPreferences = true; matchCount++;
        break;
      }
    }
    // 未提取到的字段清空
    if (!hasDestination) form.value.destination = '';
    if (!hasDuration) form.value.duration = null;
    if (!hasBudget) form.value.budget = null;
    if (!hasTravelers) form.value.travelers = null;
    if (!hasPreferences) form.value.preferences = '';

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
  // 检查登录状态
  await checkLoginStatus();
  if (!isLoggedIn.value) {
    MessagePlugin.warning('请先登录后再使用智能规划功能');
    triggerLogin();
    return;
  }
  
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
      const normalizeHotel = (hotel, dayIndex) => {
        if (!hotel) {
          return null;
        }
        if (typeof hotel === 'string') {
          hotel = { name: hotel };
        }
        return {
          name: hotel.name || '',
          city: hotel.city || '',
          district: hotel.district || '',
          address: hotel.address || '',
          notes: hotel.notes || hotel.why || '',
          days: hotel.days || hotel.day_range || hotel.day || `D${dayIndex}`,
          check_in: hotel.check_in || '',
          check_out: hotel.check_out || '',
          price_range: hotel.price_range || '',
          contact: hotel.contact || hotel.phone || '',
          coords: Array.isArray(hotel.coords) ? hotel.coords : null
        };
      };

      const normalizeActivity = (activity) => {
        if (!activity) {
          return { time: '', description: '', coords: null };
        }
        const displayParts = [];
        if (activity.location) displayParts.push(activity.location);
        if (activity.description) displayParts.push(activity.description);
        const display = displayParts.join(' - ').trim() || activity.location || activity.description || '';
        return {
          time: activity.time || '',
          location: activity.location || '',
          city: activity.city || '',
          district: activity.district || '',
          address: activity.address || '',
          notes: activity.notes || '',
          originalDescription: activity.description || '',
          description: display,
          // 仅保留模型已校验的坐标，地图组件会再次核对
          coords: Array.isArray(activity.coords) ? activity.coords : null
        };
      };

      parsedPlan = {
        daily_itinerary: data.plan.daily_itinerary.map((day, index) => ({
          day: day.day || index + 1,
          theme: day.theme || `第 ${day.day || index + 1} 天`,
          hotel: normalizeHotel(day.hotel, index + 1),
          activities: (day.activities || []).map(normalizeActivity)
        })),
        accommodation: Array.isArray(data.plan.accommodation)
          ? data.plan.accommodation.map((hotel, idx) => normalizeHotel(hotel, idx + 1)).filter(Boolean)
          : [],
        restaurants: Array.isArray(data.plan.restaurants) ? data.plan.restaurants : [],
        transport: data.plan.transport || {},
        budget_breakdown: data.plan.budget_breakdown,
        tips: data.plan.tips || []
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

  // 构建地图位置（只携带顺序与名称，坐标交由地图组件按需定位）
  const mapLocations = [];
  let seq = 1;
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
        const displayName = activity.location || activity.originalDescription || activity.description;
        const geocodeQuery = [activity.location, activity.district, activity.city, activity.address]
          .filter(Boolean)
          .join(' ');
        mapLocations.push({
          name: displayName,
          coords: activity.coords || null,
          order: seq++,
          geocodeQuery: geocodeQuery || displayName
        });
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
  position: relative;
  overflow: hidden;
  text-align: center;
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
  font-size: 14px;
}

.quick-input :deep(.t-textarea__inner:focus),
.quick-input :deep(.t-textarea:focus-within),
.quick-input :deep(.t-textarea.t-is-focused) {
  box-shadow: none !important;
  outline: none !important;
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
}

.form-input :deep(.t-input:focus),
.form-input :deep(.t-input__inner:focus),
.form-input :deep(.t-textarea__inner:focus),
.form-input :deep(.t-input-number:focus-within),
.form-input :deep(.t-input__wrap:focus-within),
.form-input :deep(.t-input.t-is-focused),
.form-input :deep(.t-input-number.t-is-focused),
.form-input :deep(.t-textarea.t-is-focused) {
  box-shadow: none !important;
  outline: none !important;
}

/* 确保所有内部元素也没有阴影 */
.form-input :deep(.t-input:focus-within .t-input__inner),
.form-input :deep(.t-input-number:focus-within .t-input__inner) {
  box-shadow: none !important;
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
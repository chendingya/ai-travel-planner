<template>
  <div class="provider-config-view">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">
          <t-icon name="setting-1" />
          提供商管理
        </h1>
        <p class="page-subtitle">手动维护 Text/Pic 生成提供商（OpenAI-compatible）</p>
      </div>
      <div class="header-actions">
        <GlassButton icon="arrow-left" theme="dark" size="sm" @click="goBack">
          返回
        </GlassButton>
      </div>
    </div>

    <div class="page-content">
      <div v-if="!authReady || loading" class="state-card">
        <t-loading text="加载配置中..." />
      </div>

      <div v-else-if="!isLoggedIn" class="state-card">
        <t-alert theme="warning" message="请先登录后再管理提供商配置。" />
        <t-button theme="primary" variant="outline" @click="triggerLoginDialog">
          去登录
        </t-button>
      </div>

      <div v-else class="editor-wrapper">
        <div class="meta-bar">
          <t-tag theme="primary" variant="light">来源: {{ sourceLabel }}</t-tag>
          <span class="meta-text">最后更新人: {{ state.updatedBy || '未知' }}</span>
          <span class="meta-text">最后更新时间: {{ formatTime(state.updatedAt) }}</span>
        </div>

        <t-tabs v-model="activeTab" class="provider-tabs">
          <t-tab-panel value="text" label="Text Providers">
            <div class="tab-tools">
              <t-button theme="primary" variant="outline" @click="addTextProvider">
                <template #icon><t-icon name="add" /></template>
                新增文本提供商
              </t-button>
            </div>
            <div v-if="state.textProviders.length === 0" class="empty-card">暂无文本提供商</div>
            <div v-for="(provider, index) in state.textProviders" :key="provider.id || `text-${index}`" class="provider-card">
              <div class="provider-card-header">
                <h3>文本提供商 #{{ index + 1 }}</h3>
                <div class="provider-card-actions">
                  <t-button size="small" variant="outline" :loading="isTesting('text', index)" @click="testProvider('text', index)">
                    测试连接
                  </t-button>
                  <t-button size="small" theme="danger" variant="text" @click="removeTextProvider(index)">
                    删除
                  </t-button>
                </div>
              </div>

              <div class="form-grid">
                <t-input v-model="provider.name" placeholder="name，例如: gitcode" clearable>
                  <template #prefix-icon><t-icon name="server" /></template>
                </t-input>
                <t-input v-model="provider.baseURL" placeholder="baseURL，例如: https://api.example.com/v1" clearable>
                  <template #prefix-icon><t-icon name="link" /></template>
                </t-input>
                <t-input-number v-model="provider.priority" :min="1" theme="normal" placeholder="priority" />
                <div class="switch-field">
                  <span>启用</span>
                  <t-switch v-model="provider.enabled" />
                </div>
              </div>

              <div class="secret-block">
                <div class="secret-head">
                  <span>API Key</span>
                  <div v-if="provider.hasApiKey" class="secret-toggle">
                    <span>替换密钥</span>
                    <t-switch
                      :model-value="provider.replaceApiKey"
                      @update:model-value="(value) => onReplaceApiKeyToggle(provider, value)"
                    />
                  </div>
                </div>
                <div v-if="provider.hasApiKey && !provider.replaceApiKey" class="secret-mask">
                  <t-icon name="lock-on" />
                  <span>{{ provider.apiKeyMasked || '已配置（脱敏）' }}</span>
                </div>
                <t-input
                  v-else
                  :model-value="provider.apiKey"
                  @update:model-value="(value) => onApiKeyInput(provider, value)"
                  type="password"
                  placeholder="输入 API Key"
                  clearable
                />
                <div v-if="hasPendingApiKey(provider)" class="secret-hint">
                  已输入新的 API Key，需要点击页面底部的“校验并保存”才会真正替换旧密钥。
                </div>
              </div>

              <div class="model-block">
                <div class="model-head">
                  <span>Models</span>
                  <t-button size="small" variant="outline" @click="addTextModel(index)">
                    <template #icon><t-icon name="add" /></template>
                    新增模型
                  </t-button>
                </div>
                <div
                  v-for="(modelItem, modelIndex) in provider.models"
                  :key="modelItem.id || `text-${index}-model-${modelIndex}`"
                  class="model-row"
                >
                  <t-input v-model="modelItem.model" placeholder="model，例如: qwen-max" clearable />
                  <t-input-number v-model="modelItem.priority" :min="1" theme="normal" />
                  <div class="model-row-action">
                    <t-button
                      class="model-delete-button"
                      size="small"
                      theme="danger"
                      variant="text"
                      @click="removeTextModel(index, modelIndex)"
                    >
                      删除
                    </t-button>
                  </div>
                </div>
              </div>

              <div class="result-line" :class="{ ok: provider._test?.ok, fail: provider._test && !provider._test.ok }" v-if="provider._test">
                {{ provider._test.message }}
              </div>
            </div>
          </t-tab-panel>

          <t-tab-panel value="image" label="Pic Providers">
            <div class="tab-tools">
              <t-button theme="primary" variant="outline" @click="addImageProvider">
                <template #icon><t-icon name="add" /></template>
                新增图片提供商
              </t-button>
            </div>
            <div v-if="state.imageProviders.length === 0" class="empty-card">暂无图片提供商</div>
            <div v-for="(provider, index) in state.imageProviders" :key="provider.id || `image-${index}`" class="provider-card">
              <div class="provider-card-header">
                <h3>图片提供商 #{{ index + 1 }}</h3>
                <div class="provider-card-actions">
                  <t-button size="small" variant="outline" :loading="isTesting('image', index)" @click="testProvider('image', index)">
                    测试连接
                  </t-button>
                  <t-button size="small" theme="danger" variant="text" @click="removeImageProvider(index)">
                    删除
                  </t-button>
                </div>
              </div>

              <div class="form-grid">
                <t-input v-model="provider.name" placeholder="name，例如: modelscope" clearable />
                <t-input v-model="provider.baseURL" placeholder="baseURL，例如: https://api.example.com/v1" clearable />
                <t-input v-model="provider.model" placeholder="model，例如: gpt-image-1" clearable />
                <t-input-number v-model="provider.priority" :min="1" theme="normal" />
                <div class="switch-field">
                  <span>启用</span>
                  <t-switch v-model="provider.enabled" />
                </div>
              </div>

              <div class="secret-block">
                <div class="secret-head">
                  <span>API Key</span>
                  <div v-if="provider.hasApiKey" class="secret-toggle">
                    <span>替换密钥</span>
                    <t-switch
                      :model-value="provider.replaceApiKey"
                      @update:model-value="(value) => onReplaceApiKeyToggle(provider, value)"
                    />
                  </div>
                </div>
                <div v-if="provider.hasApiKey && !provider.replaceApiKey" class="secret-mask">
                  <t-icon name="lock-on" />
                  <span>{{ provider.apiKeyMasked || '已配置（脱敏）' }}</span>
                </div>
                <t-input
                  v-else
                  :model-value="provider.apiKey"
                  @update:model-value="(value) => onApiKeyInput(provider, value)"
                  type="password"
                  placeholder="输入 API Key"
                  clearable
                />
                <div v-if="hasPendingApiKey(provider)" class="secret-hint">
                  已输入新的 API Key，需要点击页面右上角或底部的“校验并保存”才会真正替换旧密钥。
                </div>
              </div>

              <div class="result-line" :class="{ ok: provider._test?.ok, fail: provider._test && !provider._test.ok }" v-if="provider._test">
                {{ provider._test.message }}
              </div>
            </div>
          </t-tab-panel>
        </t-tabs>

        <div class="save-actions" :class="{ dirty: hasUnsavedChanges }">
          <div class="save-status">
            {{ hasUnsavedChanges ? '当前有未保存改动' : '当前没有未保存改动' }}
          </div>
          <t-button variant="outline" @click="reloadConfig" :disabled="saving">重新加载</t-button>
          <t-button theme="primary" :loading="saving" :disabled="!hasUnsavedChanges" @click="saveConfig">校验并保存</t-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthState } from '../composables/useAuthState';
import GlassButton from '../components/GlassButton.vue';

const router = useRouter();
const { user: sessionUser, authReady, refreshAuthState } = useAuthState();

const isLoggedIn = computed(() => Boolean(sessionUser.value));
const activeTab = ref('text');
const loading = ref(true);
const saving = ref(false);
const testingKeys = ref(new Set());
const lastSavedSnapshot = ref('');

const state = reactive({
  source: 'env',
  updatedBy: '',
  updatedAt: '',
  textProviders: [],
  imageProviders: [],
});

const sourceLabel = computed(() => (state.source === 'supabase' ? 'Supabase' : '环境变量'));

const buildPayload = () => ({
  textProviders: state.textProviders.map(toTextPayload),
  imageProviders: state.imageProviders.map(toImagePayload),
});

const createSnapshot = () => JSON.stringify(buildPayload());

const hasUnsavedChanges = computed(() => {
  if (!authReady.value || !isLoggedIn.value || loading.value) return false;
  return createSnapshot() !== lastSavedSnapshot.value;
});

const createTextProvider = () => ({
  id: '',
  name: '',
  enabled: true,
  baseURL: '',
  priority: state.textProviders.length + 1,
  apiKey: '',
  hasApiKey: false,
  apiKeyMasked: '',
  keepApiKey: false,
  replaceApiKey: true,
  models: [{ id: '', model: '', priority: 1 }],
  _test: null,
});

const createImageProvider = () => ({
  id: '',
  name: '',
  enabled: true,
  baseURL: '',
  model: '',
  priority: state.imageProviders.length + 1,
  apiKey: '',
  hasApiKey: false,
  apiKeyMasked: '',
  keepApiKey: false,
  replaceApiKey: true,
  _test: null,
});

const normalizeTextProvider = (provider) => ({
  id: provider.id || '',
  name: provider.name || '',
  enabled: provider.enabled !== false,
  baseURL: provider.baseURL || '',
  priority: Number(provider.priority) > 0 ? Number(provider.priority) : 1,
  apiKey: provider.apiKey || '',
  hasApiKey: provider.hasApiKey === true,
  apiKeyMasked: provider.apiKeyMasked || '',
  keepApiKey: provider.keepApiKey === true,
  replaceApiKey: provider.hasApiKey === true ? provider.keepApiKey !== true : true,
  models: (Array.isArray(provider.models) ? provider.models : []).map((item) => ({
    id: item.id || '',
    model: item.model || '',
    priority: Number(item.priority) > 0 ? Number(item.priority) : 1,
  })),
  _test: null,
});

const normalizeImageProvider = (provider) => ({
  id: provider.id || '',
  name: provider.name || '',
  enabled: provider.enabled !== false,
  baseURL: provider.baseURL || '',
  model: provider.model || '',
  priority: Number(provider.priority) > 0 ? Number(provider.priority) : 1,
  apiKey: provider.apiKey || '',
  hasApiKey: provider.hasApiKey === true,
  apiKeyMasked: provider.apiKeyMasked || '',
  keepApiKey: provider.keepApiKey === true,
  replaceApiKey: provider.hasApiKey === true ? provider.keepApiKey !== true : true,
  _test: null,
});

const formatTime = (value) => {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const testingKey = (kind, index) => `${kind}:${index}`;
const isTesting = (kind, index) => testingKeys.value.has(testingKey(kind, index));

const setProviders = (payload) => {
  state.source = payload?.source || 'env';
  state.updatedBy = payload?.updatedBy || '';
  state.updatedAt = payload?.updatedAt || '';
  state.textProviders = (Array.isArray(payload?.textProviders) ? payload.textProviders : []).map(normalizeTextProvider);
  state.imageProviders = (Array.isArray(payload?.imageProviders) ? payload.imageProviders : []).map(normalizeImageProvider);
  lastSavedSnapshot.value = createSnapshot();
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

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || '请求失败';
    const err = new Error(message);
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data;
};

const reloadConfig = async () => {
  loading.value = true;
  try {
    const data = await fetchJson('/api/provider-config');
    setProviders(data);
  } catch (error) {
    if (error.status === 401) {
      MessagePlugin.warning('请先登录后再查看配置');
      return;
    }
    MessagePlugin.error(error.message || '配置加载失败');
  } finally {
    loading.value = false;
  }
};

const toTextPayload = (provider) => ({
  id: provider.id || '',
  name: (provider.name || '').trim(),
  enabled: !!provider.enabled,
  baseURL: (provider.baseURL || '').trim(),
  priority: Number(provider.priority) > 0 ? Number(provider.priority) : 1,
  apiKey: provider.apiKey || '',
  hasApiKey: provider.hasApiKey === true,
  keepApiKey: provider.hasApiKey === true ? provider.replaceApiKey !== true : false,
  models: (Array.isArray(provider.models) ? provider.models : []).map((item) => ({
    id: item.id || '',
    model: (item.model || '').trim(),
    priority: Number(item.priority) > 0 ? Number(item.priority) : 1,
  })),
});

const toImagePayload = (provider) => ({
  id: provider.id || '',
  name: (provider.name || '').trim(),
  enabled: !!provider.enabled,
  baseURL: (provider.baseURL || '').trim(),
  model: (provider.model || '').trim(),
  priority: Number(provider.priority) > 0 ? Number(provider.priority) : 1,
  apiKey: provider.apiKey || '',
  hasApiKey: provider.hasApiKey === true,
  keepApiKey: provider.hasApiKey === true ? provider.replaceApiKey !== true : false,
});

const summarizeResults = (results = []) => {
  if (!Array.isArray(results) || results.length === 0) {
    return { ok: true, message: '已通过测试' };
  }
  const failed = results.filter((item) => !item.ok);
  if (failed.length === 0) {
    return { ok: true, message: `测试通过（${results.length}项）` };
  }
  const first = failed[0];
  return { ok: false, message: first.message || '测试失败' };
};

const applyServerValidation = (details = [], results = []) => {
  state.textProviders.forEach((provider) => {
    provider._test = null;
  });
  state.imageProviders.forEach((provider) => {
    provider._test = null;
  });

  const merged = [
    ...(Array.isArray(details) ? details : []),
    ...(Array.isArray(results) ? results.filter((item) => item && item.ok === false) : []),
  ];

  merged.forEach((item) => {
    const kind = item?.kind === 'image' ? 'image' : 'text';
    const providerName = String(item?.provider || '').trim();
    const message = String(item?.message || '校验失败').trim();
    if (kind === 'text') {
      const hit = state.textProviders.find((provider) => (provider.name || '').trim() === providerName);
      if (hit) hit._test = { ok: false, message };
    } else {
      const hit = state.imageProviders.find((provider) => (provider.name || '').trim() === providerName);
      if (hit) hit._test = { ok: false, message };
    }
  });
};

const testProvider = async (kind, index) => {
  const key = testingKey(kind, index);
  testingKeys.value.add(key);
  try {
    const provider = kind === 'text' ? state.textProviders[index] : state.imageProviders[index];
    const payload = kind === 'text' ? toTextPayload(provider) : toImagePayload(provider);
    const data = await fetchJson('/api/provider-config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, provider: payload }),
    });
    provider._test = summarizeResults(data.results || []);
    if (provider._test.ok) MessagePlugin.success('测试通过');
    else MessagePlugin.error(provider._test.message || '测试失败');
  } catch (error) {
    const provider = kind === 'text' ? state.textProviders[index] : state.imageProviders[index];
    provider._test = { ok: false, message: error.message || '测试失败' };
    MessagePlugin.error(provider._test.message);
  } finally {
    testingKeys.value.delete(key);
  }
};

const saveConfig = async () => {
  if (!hasUnsavedChanges.value) {
    MessagePlugin.info('当前没有需要保存的改动');
    return;
  }
  saving.value = true;
  try {
    const payload = buildPayload();
    const data = await fetchJson('/api/provider-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setProviders(data.config || {});
    MessagePlugin.success('配置已保存并热更新');
  } catch (error) {
    const details = error.payload?.details;
    const results = error.payload?.results;
    applyServerValidation(details, results);
    if (Array.isArray(details) && details.length) {
      MessagePlugin.error(details[0].message || error.message || '保存失败');
    } else {
      MessagePlugin.error(error.message || '保存失败');
    }
  } finally {
    saving.value = false;
  }
};

const onReplaceApiKeyToggle = (provider, value) => {
  const nextValue = value === true;
  if (!nextValue && hasPendingApiKey(provider)) {
    MessagePlugin.warning('新的 API Key 还未保存，请先点击“校验并保存”，或清空输入后再取消替换');
    return;
  }
  provider.replaceApiKey = nextValue;
  provider.keepApiKey = !provider.replaceApiKey;
};

const onApiKeyInput = (provider, value) => {
  provider.apiKey = typeof value === 'string' ? value : '';
  if (provider.apiKey.trim()) {
    provider.replaceApiKey = true;
    provider.keepApiKey = false;
    return;
  }

  if (provider.hasApiKey) {
    provider.keepApiKey = provider.replaceApiKey !== true;
  } else {
    provider.keepApiKey = false;
  }
};

const hasPendingApiKey = (provider) => {
  const apiKey = typeof provider?.apiKey === 'string' ? provider.apiKey.trim() : '';
  return !!apiKey;
};

const addTextProvider = () => {
  state.textProviders.push(createTextProvider());
};

const removeTextProvider = (index) => {
  state.textProviders.splice(index, 1);
};

const addTextModel = (providerIndex) => {
  const provider = state.textProviders[providerIndex];
  if (!provider) return;
  provider.models.push({
    id: '',
    model: '',
    priority: provider.models.length + 1,
  });
};

const removeTextModel = (providerIndex, modelIndex) => {
  const provider = state.textProviders[providerIndex];
  if (!provider) return;
  provider.models.splice(modelIndex, 1);
};

const addImageProvider = () => {
  state.imageProviders.push(createImageProvider());
};

const removeImageProvider = (index) => {
  state.imageProviders.splice(index, 1);
};

const goBack = () => {
  router.back();
};

onMounted(async () => {
  await refreshAuthState({ refreshSession: true });
  if (!isLoggedIn.value) {
    loading.value = false;
    return;
  }
  await reloadConfig();
});
</script>

<style scoped>
.provider-config-view {
  min-height: calc(100vh - var(--header-height));
}

.page-header {
  background: linear-gradient(135deg, #0066cc 0%, #0084ff 45%, #66b8ff 100%);
  padding: 28px 24px;
  margin-top: 24px;
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 132, 255, 0.22);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  color: #fff;
}

.page-title {
  margin: 0;
  font-size: 28px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-subtitle {
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.9);
}

.page-content {
  padding: 24px 0 12px;
}

.state-card {
  border-radius: 16px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-direction: column;
}

.editor-wrapper {
  border-radius: 16px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  padding: 18px;
}

.meta-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.meta-text {
  color: var(--text-secondary);
  font-size: 13px;
}

.tab-tools {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}

.provider-card {
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
}

.provider-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.provider-card-header h3 {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
}

.provider-card-actions {
  display: flex;
  gap: 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.switch-field {
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.7);
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.secret-block,
.model-block {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(0, 132, 255, 0.15);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
}

.secret-head,
.model-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-size: 13px;
}

.secret-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.secret-mask {
  min-height: 38px;
  border-radius: 8px;
  background: rgba(0, 132, 255, 0.08);
  color: #0f4c8a;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  font-size: 13px;
}

.model-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 64px;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

.model-row:last-child {
  margin-bottom: 0;
}

.model-row-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
}

.model-delete-button {
  padding: 0;
}

.result-line {
  margin-top: 10px;
  font-size: 12px;
}

.result-line.ok {
  color: #2ba471;
}

.result-line.fail {
  color: #e34d59;
}

.save-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
  position: sticky;
  bottom: 12px;
  z-index: 10;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 132, 255, 0.12);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.save-actions.dirty {
  border-color: rgba(0, 132, 255, 0.28);
  box-shadow: 0 10px 30px rgba(0, 132, 255, 0.14);
}

.save-status {
  margin-right: auto;
  font-size: 13px;
  color: var(--text-secondary);
}

.secret-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #0052d9;
}

.empty-card {
  padding: 20px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px dashed rgba(0, 132, 255, 0.3);
  color: var(--text-secondary);
  text-align: center;
}

@media (max-width: 768px) {
  .page-header {
    padding: 20px 16px;
    flex-direction: column;
    align-items: flex-start;
  }

  .page-title {
    font-size: 24px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .model-row {
    grid-template-columns: 1fr;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .save-actions {
    bottom: 8px;
  }

  .save-status {
    width: 100%;
    margin-right: 0;
  }
}
</style>

<template>
  <div class="auth-container">
    <t-dropdown v-if="user" trigger="click">
      <t-button variant="text" class="user-button">
        <t-icon name="user" />
        <span class="user-email">{{ userDisplayName }}</span>
      </t-button>
      <t-dropdown-menu>
        <t-dropdown-item @click="handleLogout">
          <t-icon name="logout" />
          退出登录
        </t-dropdown-item>
      </t-dropdown-menu>
    </t-dropdown>

    <t-button v-else theme="primary" variant="outline" @click="showLoginDialog = true">
      <t-icon name="login" />
      登录
    </t-button>

    <t-dialog
      v-model:visible="showLoginDialog"
      :header="authMode === 'login' ? '账号登录' : '账号注册'"
      :footer="false"
      width="400px"
      :z-index="10000"
      attach="body"
    >
      <div class="auth-mode-switch">
        <t-button
          :theme="authMode === 'login' ? 'primary' : 'default'"
          :variant="authMode === 'login' ? 'base' : 'outline'"
          size="small"
          @click="switchMode('login')"
        >
          登录
        </t-button>
        <t-button
          :theme="authMode === 'register' ? 'primary' : 'default'"
          :variant="authMode === 'register' ? 'base' : 'outline'"
          size="small"
          @click="switchMode('register')"
        >
          注册
        </t-button>
      </div>

      <t-form @submit="handleSubmit">
        <template v-if="authMode === 'login'">
          <t-form-item label="账号/邮箱">
            <t-input
              v-model="loginIdentifier"
              placeholder="请输入账号或邮箱"
              clearable
              required
            >
              <template #prefix-icon>
                <t-icon name="user" />
              </template>
            </t-input>
          </t-form-item>
          <t-form-item label="密码">
            <t-input
              v-model="loginPassword"
              type="password"
              placeholder="请输入密码"
              clearable
              required
            >
              <template #prefix-icon>
                <t-icon name="lock-on" />
              </template>
            </t-input>
          </t-form-item>
        </template>

        <template v-else>
          <t-form-item label="账号">
            <t-input
              v-model="registerUsername"
              placeholder="仅支持字母、数字、下划线（3-32位）"
              clearable
              required
            >
              <template #prefix-icon>
                <t-icon name="user" />
              </template>
            </t-input>
          </t-form-item>
          <t-form-item label="邮箱">
            <t-input
              v-model="registerEmail"
              placeholder="请输入您的邮箱"
              clearable
              required
            >
              <template #prefix-icon>
                <t-icon name="mail" />
              </template>
            </t-input>
          </t-form-item>
          <t-form-item label="密码">
            <t-input
              v-model="registerPassword"
              type="password"
              placeholder="请输入密码（至少6位）"
              clearable
              required
            >
              <template #prefix-icon>
                <t-icon name="lock-on" />
              </template>
            </t-input>
          </t-form-item>
          <t-form-item label="确认密码">
            <t-input
              v-model="confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              clearable
              required
            >
              <template #prefix-icon>
                <t-icon name="lock-on" />
              </template>
            </t-input>
          </t-form-item>
        </template>

        <t-form-item>
          <t-button theme="primary" type="submit" block size="large" :loading="loading">
            {{ submitButtonText }}
          </t-button>
        </t-form-item>
        <div class="login-tips">
          <t-icon name="info-circle" size="14px" />
          {{ authMode === 'login' ? '使用账号或邮箱 + 密码直接登录' : '注册后可直接使用账号密码登录' }}
        </div>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { supabase } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';

const user = ref(null);
const showLoginDialog = ref(false);
const loading = ref(false);
const authMode = ref('login');

const loginIdentifier = ref('');
const loginPassword = ref('');

const registerUsername = ref('');
const registerEmail = ref('');
const registerPassword = ref('');
const confirmPassword = ref('');

let authSubscription = null;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

const userDisplayName = computed(() => {
  const username = user.value?.user_metadata?.username;
  if (typeof username === 'string' && username.trim()) return username.trim();
  return user.value?.email || '';
});

const submitButtonText = computed(() => {
  if (loading.value) return authMode.value === 'login' ? '登录中...' : '注册中...';
  return authMode.value === 'login' ? '登录' : '注册并登录';
});

const switchMode = (mode) => {
  authMode.value = mode;
};

const requestAuth = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.message || '请求失败，请稍后重试');
  }
  return result;
};

const applySession = async (session) => {
  if (!session?.access_token || !session?.refresh_token) return false;
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  return true;
};

const handleLogin = async () => {
  const identifier = loginIdentifier.value.trim();
  const password = loginPassword.value;

  if (!identifier || !password) {
    MessagePlugin.warning('请输入账号/邮箱和密码');
    return;
  }

  loading.value = true;
  try {
    const data = await requestAuth('/api/auth/login', {
      identifier,
      password,
    });

    const hasSession = await applySession(data.session);
    if (!hasSession) {
      throw new Error('登录会话无效，请稍后重试');
    }
    MessagePlugin.success('登录成功');
    showLoginDialog.value = false;
    loginIdentifier.value = '';
    loginPassword.value = '';
  } catch (error) {
    MessagePlugin.error(error.message || '登录失败，请稍后再试');
  } finally {
    loading.value = false;
  }
};

const handleRegister = async () => {
  const username = registerUsername.value.trim();
  const email = registerEmail.value.trim().toLowerCase();
  const password = registerPassword.value;

  if (!username || !email || !password || !confirmPassword.value) {
    MessagePlugin.warning('请完整填写注册信息');
    return;
  }

  if (!USERNAME_REGEX.test(username)) {
    MessagePlugin.warning('账号仅支持 3-32 位字母、数字或下划线');
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    MessagePlugin.warning('请输入有效的邮箱地址');
    return;
  }

  if (password.length < 6) {
    MessagePlugin.warning('密码长度不能少于 6 位');
    return;
  }

  if (password !== confirmPassword.value) {
    MessagePlugin.warning('两次输入的密码不一致');
    return;
  }

  loading.value = true;
  try {
    const data = await requestAuth('/api/auth/register', {
      username,
      email,
      password,
    });

    const hasSession = await applySession(data.session);
    if (hasSession) {
      MessagePlugin.success(data.message || '注册并登录成功');
      showLoginDialog.value = false;
    } else {
      MessagePlugin.success(data.message || '注册成功，请登录');
      authMode.value = 'login';
      loginIdentifier.value = email;
      loginPassword.value = '';
    }

    registerUsername.value = '';
    registerEmail.value = '';
    registerPassword.value = '';
    confirmPassword.value = '';
  } catch (error) {
    MessagePlugin.error(error.message || '注册失败，请稍后再试');
  } finally {
    loading.value = false;
  }
};

const handleSubmit = async (ctx) => {
  if (ctx && typeof ctx.preventDefault === 'function') ctx.preventDefault();
  if (authMode.value === 'login') {
    await handleLogin();
  } else {
    await handleRegister();
  }
};

const handleLogout = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    user.value = null;
    MessagePlugin.success('已退出登录');
  } catch (error) {
    MessagePlugin.error('退出登录失败');
  }
};

const checkUser = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    user.value = session?.user || null;
  } catch (error) {
    console.warn('获取用户会话失败:', error.message);
    user.value = null;
  }
};

onMounted(() => {
  checkUser();

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user || null;
  });

  authSubscription = data?.subscription || null;
});

onUnmounted(() => {
  if (authSubscription && typeof authSubscription.unsubscribe === 'function') {
    authSubscription.unsubscribe();
  }
  authSubscription = null;
});
</script>

<style scoped>
.auth-container {
  display: flex;
  align-items: center;
}

.user-button {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 8px 16px !important;
  height: auto !important;
}

.user-button :deep(.t-button__text) {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
}

.user-button :deep(.t-icon) {
  display: inline-flex !important;
  align-items: center !important;
  font-size: 16px;
}

.user-email {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1;
  vertical-align: middle;
}

.auth-mode-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.auth-mode-switch :deep(.t-button) {
  flex: 1;
}

.login-tips {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 12px;
  text-align: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .user-email {
    max-width: 100px;
  }
}
</style>

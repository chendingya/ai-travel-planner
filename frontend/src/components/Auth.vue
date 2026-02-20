<template>
  <div class="auth-container">
    <t-skeleton v-if="!authReady" class="auth-entry-skeleton" :loading="true" animation="gradient">
      <template #content>
        <div class="auth-skeleton-pill"></div>
      </template>
    </t-skeleton>

    <t-dropdown
      v-else-if="user"
      trigger="click"
      placement="bottom-right"
      :popup-props="{ overlayInnerClassName: 'auth-dropdown-popup', overlayInnerStyle: { marginTop: '8px' } }"
    >
      <t-button variant="text" class="user-button">
        <t-icon name="user" />
        <span class="user-email">{{ userDisplayName }}</span>
      </t-button>
      <t-dropdown-menu>
        <t-dropdown-item @click="goToProfile">
          <t-icon name="user" />
          个人中心
        </t-dropdown-item>
        <t-dropdown-item @click="handleLogout">
          <t-icon name="logout" />
          退出登录
        </t-dropdown-item>
      </t-dropdown-menu>
    </t-dropdown>

    <t-button v-else theme="primary" class="login-entry-button" @click="openDialog('login')">
      <t-icon name="login" />
      登录
    </t-button>

    <t-dialog
      v-model:visible="showLoginDialog"
      :header="authMode === 'login' ? '账号登录' : '账号注册'"
      :footer="false"
      width="min(460px, 92vw)"
      :z-index="10000"
      attach="body"
    >
      <div class="auth-mode-switch">
        <t-button
          class="mode-button"
          :class="{ 'mode-button--active': authMode === 'login' }"
          theme="default"
          variant="text"
          size="small"
          @click="switchMode('login')"
        >
          登录
        </t-button>
        <t-button
          class="mode-button"
          :class="{ 'mode-button--active': authMode === 'register' }"
          theme="default"
          variant="text"
          size="small"
          @click="switchMode('register')"
        >
          注册
        </t-button>
      </div>

      <t-form class="auth-form" label-align="top" @submit="handleSubmit">
        <template v-if="authMode === 'login'">
          <div class="auth-field">
            <div class="auth-field-label">账号/邮箱</div>
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
            <div class="field-feedback" :class="{ 'is-visible': showLoginIdentifierError }">
              {{ showLoginIdentifierError ? loginIdentifierError : '' }}
            </div>
          </div>

          <div class="auth-field">
            <div class="auth-field-label">密码</div>
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
            <div class="field-feedback" :class="{ 'is-visible': showLoginPasswordError }">
              {{ showLoginPasswordError ? loginPasswordError : '' }}
            </div>
          </div>
        </template>

        <template v-else>
          <div class="auth-field">
            <div class="auth-field-label">账号</div>
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
            <div class="field-feedback" :class="{ 'is-visible': showRegisterUsernameError }">
              {{ showRegisterUsernameError ? registerUsernameError : '' }}
            </div>
          </div>

          <div class="auth-field">
            <div class="auth-field-label">邮箱</div>
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
            <div class="field-feedback" :class="{ 'is-visible': showRegisterEmailError }">
              {{ showRegisterEmailError ? registerEmailError : '' }}
            </div>
          </div>

          <div class="auth-field">
            <div class="auth-field-label">密码</div>
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
            <div class="field-feedback" :class="{ 'is-visible': showRegisterPasswordError }">
              {{ showRegisterPasswordError ? registerPasswordError : '' }}
            </div>
          </div>

          <div class="auth-field">
            <div class="auth-field-label">确认密码</div>
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
            <div class="field-feedback" :class="{ 'is-visible': showConfirmPasswordError }">
              {{ showConfirmPasswordError ? confirmPasswordError : '' }}
            </div>
          </div>
        </template>

        <div class="auth-submit">
          <t-button theme="primary" type="submit" block size="large" :loading="loading" :disabled="!canSubmit">
            {{ submitButtonText }}
          </t-button>
        </div>
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
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthState } from '../composables/useAuthState';

const router = useRouter();
const { user, authReady, refreshAuthState, setSessionFromServer, signOutAndSync } = useAuthState();

const showLoginDialog = ref(false);
const loading = ref(false);
const authMode = ref('login');

const loginIdentifier = ref('');
const loginPassword = ref('');

const registerUsername = ref('');
const registerEmail = ref('');
const registerPassword = ref('');
const confirmPassword = ref('');
const loginSubmitTried = ref(false);
const registerSubmitTried = ref(false);

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

const loginIdentifierError = computed(() => {
  const value = loginIdentifier.value.trim();
  if (!value) return '请输入账号或邮箱';
  return '';
});

const loginPasswordError = computed(() => {
  if (!loginPassword.value) return '请输入密码';
  return '';
});

const registerUsernameError = computed(() => {
  const value = registerUsername.value.trim();
  if (!value) return '请输入账号';
  if (!USERNAME_REGEX.test(value)) return '账号仅支持 3-32 位字母、数字或下划线';
  return '';
});

const registerEmailError = computed(() => {
  const value = registerEmail.value.trim().toLowerCase();
  if (!value) return '请输入邮箱';
  if (!EMAIL_REGEX.test(value)) return '请输入有效的邮箱地址';
  return '';
});

const registerPasswordError = computed(() => {
  if (!registerPassword.value) return '请输入密码';
  if (registerPassword.value.length < 6) return '密码长度不能少于 6 位';
  return '';
});

const confirmPasswordError = computed(() => {
  if (!confirmPassword.value) return '请再次输入密码';
  if (registerPassword.value !== confirmPassword.value) return '两次输入的密码不一致';
  return '';
});

const canLoginSubmit = computed(() => !loginIdentifierError.value && !loginPasswordError.value);
const canRegisterSubmit = computed(
  () => !registerUsernameError.value && !registerEmailError.value && !registerPasswordError.value && !confirmPasswordError.value,
);
const canSubmit = computed(() => (authMode.value === 'login' ? canLoginSubmit.value : canRegisterSubmit.value));
const showLoginIdentifierError = computed(() => Boolean((loginSubmitTried.value || loginIdentifier.value) && loginIdentifierError.value));
const showLoginPasswordError = computed(() => Boolean((loginSubmitTried.value || loginPassword.value) && loginPasswordError.value));
const showRegisterUsernameError = computed(() => Boolean((registerSubmitTried.value || registerUsername.value) && registerUsernameError.value));
const showRegisterEmailError = computed(() => Boolean((registerSubmitTried.value || registerEmail.value) && registerEmailError.value));
const showRegisterPasswordError = computed(() => Boolean((registerSubmitTried.value || registerPassword.value) && registerPasswordError.value));
const showConfirmPasswordError = computed(() => Boolean((registerSubmitTried.value || confirmPassword.value) && confirmPasswordError.value));

const switchMode = (mode) => {
  authMode.value = mode;
  loginSubmitTried.value = false;
  registerSubmitTried.value = false;
};

const openDialog = (mode = 'login') => {
  switchMode(mode === 'register' ? 'register' : 'login');
  showLoginDialog.value = true;
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

    const hasSession = await setSessionFromServer(data.session);
    if (!hasSession) {
      throw new Error('登录会话无效，请稍后重试');
    }
    MessagePlugin.success('登录成功');
    showLoginDialog.value = false;
    loginIdentifier.value = '';
    loginPassword.value = '';
    loginSubmitTried.value = false;
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

    const hasSession = await setSessionFromServer(data.session);
    if (hasSession) {
      MessagePlugin.success(data.message || '注册并登录成功');
      showLoginDialog.value = false;
    } else {
      MessagePlugin.success(data.message || '注册成功，请登录');
      authMode.value = 'login';
      loginIdentifier.value = email;
      loginPassword.value = '';
      loginSubmitTried.value = false;
    }

    registerUsername.value = '';
    registerEmail.value = '';
    registerPassword.value = '';
    confirmPassword.value = '';
    registerSubmitTried.value = false;
  } catch (error) {
    MessagePlugin.error(error.message || '注册失败，请稍后再试');
  } finally {
    loading.value = false;
  }
};

const handleSubmit = async (ctx) => {
  if (ctx && typeof ctx.preventDefault === 'function') ctx.preventDefault();
  if (authMode.value === 'login') {
    loginSubmitTried.value = true;
    if (!canLoginSubmit.value) {
      MessagePlugin.warning(loginIdentifierError.value || loginPasswordError.value || '请完善登录信息');
      return;
    }
    await handleLogin();
  } else {
    registerSubmitTried.value = true;
    if (!canRegisterSubmit.value) {
      MessagePlugin.warning(
        registerUsernameError.value
        || registerEmailError.value
        || registerPasswordError.value
        || confirmPasswordError.value
        || '请完善注册信息',
      );
      return;
    }
    await handleRegister();
  }
};

const handleLogout = async () => {
  const { error } = await signOutAndSync();
  if (!error) {
    MessagePlugin.success('已退出登录');
    return;
  }
  try {
    MessagePlugin.warning(`服务器退出失败，已清理本地登录态：${error.message || '未知错误'}`);
  } catch (_) {
    MessagePlugin.warning('服务器退出失败，已清理本地登录态');
  }
};

const goToProfile = () => {
  router.push('/profile');
};

const handleExternalOpenAuthDialog = (event) => {
  const mode = event?.detail?.mode === 'register' ? 'register' : 'login';
  openDialog(mode);
};

onMounted(() => {
  refreshAuthState();
  window.addEventListener('open-auth-dialog', handleExternalOpenAuthDialog);
});

onUnmounted(() => {
  window.removeEventListener('open-auth-dialog', handleExternalOpenAuthDialog);
});
</script>

<style scoped>
.auth-container {
  display: flex;
  align-items: center;
  min-height: 40px;
}

.auth-entry-skeleton {
  display: inline-flex;
  width: 136px;
}

.auth-skeleton-pill {
  width: 136px;
  height: 40px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
}

.user-button {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 8px 14px !important;
  height: 40px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(0, 132, 255, 0.18) !important;
  background: rgba(255, 255, 255, 0.92) !important;
  box-shadow: 0 6px 18px rgba(15, 37, 70, 0.08) !important;
}

.user-button:hover {
  border-color: rgba(0, 132, 255, 0.36) !important;
  box-shadow: 0 10px 22px rgba(0, 132, 255, 0.18) !important;
}

.login-entry-button {
  height: 40px !important;
  padding: 0 18px !important;
  border-radius: 999px !important;
  box-shadow: 0 8px 18px rgba(0, 132, 255, 0.25) !important;
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
  padding: 4px;
  border-radius: 14px;
  background: rgba(245, 247, 255, 0.95);
  border: 1px solid rgba(0, 132, 255, 0.12);
}

.mode-button {
  flex: 1;
  height: 36px;
  border-radius: 10px;
  color: #4b587c;
  font-weight: 600;
  transition: all 0.2s ease;
}

.mode-button--active {
  color: #ffffff !important;
  background: linear-gradient(135deg, #0084ff, #1677ff) !important;
  box-shadow: 0 8px 16px rgba(0, 132, 255, 0.25) !important;
}

.auth-form :deep(.t-form__item) {
  margin-bottom: 0;
}

.auth-field {
  width: 100%;
  margin-bottom: 8px;
}

.auth-field-label {
  margin-bottom: 8px;
  line-height: 1.4;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.auth-field :deep(.t-input) {
  display: flex;
  width: 100% !important;
}

.auth-field :deep(.t-input__wrap) {
  width: 100%;
}

.auth-submit {
  margin-top: 4px;
  width: 100%;
}

.field-feedback {
  margin-top: 6px;
  min-height: 20px;
  font-size: 12px;
  color: transparent;
  width: 100%;
  line-height: 20px;
  word-break: break-word;
  transition: color 0.12s ease;
}

.field-feedback.is-visible {
  color: #e34d59;
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
  .auth-entry-skeleton,
  .auth-skeleton-pill {
    width: 112px;
  }

  .user-email {
    max-width: 100px;
  }
}

.auth-container :deep(.t-dropdown) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
</style>

<style>
.auth-dropdown-popup {
  border-radius: 14px !important;
}

.auth-dropdown-popup .t-dropdown__menu {
  min-width: 140px;
}
</style>

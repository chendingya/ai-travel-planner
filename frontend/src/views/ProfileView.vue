<template>
  <div class="profile-view full-width">
    <div class="profile-background">
      <div class="profile-content">
        <div class="profile-card">
          <div class="profile-header">
            <h2 class="profile-title">个人中心</h2>
            <p class="profile-subtitle">在这里修改账号名和登录密码</p>
          </div>

          <div v-if="!authReady" class="profile-skeleton">
            <t-skeleton :loading="true" animation="gradient">
              <template #content>
                <div class="skeleton-block"></div>
                <div class="skeleton-row"></div>
                <div class="skeleton-row"></div>
                <div class="skeleton-grid">
                  <div class="skeleton-card"></div>
                  <div class="skeleton-card"></div>
                </div>
              </template>
            </t-skeleton>
          </div>

          <div v-else-if="!isLoggedIn" class="profile-login-tip">
            <t-alert theme="warning" message="请先登录后再管理账号信息。" />
            <t-button theme="primary" variant="outline" @click="triggerLoginDialog">
              去登录
            </t-button>
          </div>

          <template v-else>
            <div class="profile-meta">
              <div class="meta-item">
                <span class="meta-label">当前邮箱</span>
                <span class="meta-value">{{ currentEmail }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">当前账号</span>
                <span class="meta-value">{{ currentUsername || '未设置' }}</span>
              </div>
            </div>

            <div class="profile-grid">
              <section class="profile-section">
                <h3 class="section-title">修改账号名</h3>
                <t-input
                  v-model="username"
                  placeholder="仅支持字母、数字、下划线（3-32位）"
                  clearable
                />
                <div class="field-feedback" :class="{ 'is-visible': showUsernameError }">
                  {{ showUsernameError ? usernameError : '' }}
                </div>
                <div class="section-actions">
                  <t-button
                    theme="primary"
                    :loading="updatingUsername"
                    :disabled="!canSubmitUsername"
                    @click="handleUpdateUsername"
                  >
                    保存账号名
                  </t-button>
                </div>
              </section>

              <section class="profile-section">
                <h3 class="section-title">修改密码</h3>
                <t-input
                  v-model="currentPassword"
                  type="password"
                  placeholder="请输入当前密码"
                  clearable
                />
                <div class="field-feedback" :class="{ 'is-visible': showCurrentPasswordError }">
                  {{ showCurrentPasswordError ? currentPasswordError : '' }}
                </div>
                <t-input
                  v-model="newPassword"
                  type="password"
                  placeholder="请输入新密码（至少6位）"
                  clearable
                />
                <div class="field-feedback" :class="{ 'is-visible': showNewPasswordError }">
                  {{ showNewPasswordError ? newPasswordError : '' }}
                </div>
                <t-input
                  v-model="confirmPassword"
                  type="password"
                  placeholder="请再次输入新密码"
                  clearable
                />
                <div class="field-feedback" :class="{ 'is-visible': showConfirmPasswordError }">
                  {{ showConfirmPasswordError ? confirmPasswordError : '' }}
                </div>
                <div class="section-actions">
                  <t-button
                    theme="primary"
                    :loading="updatingPassword"
                    :disabled="!canSubmitPassword"
                    @click="handleUpdatePassword"
                  >
                    修改密码
                  </t-button>
                </div>
              </section>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { supabase } from '../supabase';
import { useAuthState } from '../composables/useAuthState';

const router = useRouter();
const { user: sessionUser, authReady, refreshAuthState, signOutAndSync, patchUserMetadata } = useAuthState();

const isLoggedIn = computed(() => Boolean(sessionUser.value));
const currentEmail = computed(() => sessionUser.value?.email || '');
const currentUsername = computed(() => sessionUser.value?.user_metadata?.username || '');

const username = ref('');
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');

const updatingUsername = ref(false);
const updatingPassword = ref(false);
const usernameSubmitTried = ref(false);
const passwordSubmitTried = ref(false);

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

const usernameError = computed(() => {
  if (!isLoggedIn.value) return '';
  const value = username.value.trim();
  if (!value) return '请输入账号名';
  if (!USERNAME_REGEX.test(value)) return '账号仅支持 3-32 位字母、数字或下划线';
  if (value === currentUsername.value) return '新账号名与当前一致';
  return '';
});

const canSubmitUsername = computed(() => isLoggedIn.value && !usernameError.value && !updatingUsername.value);

const hasAnyPasswordInput = computed(
  () => Boolean(currentPassword.value || newPassword.value || confirmPassword.value),
);

const currentPasswordError = computed(() => {
  if (!hasAnyPasswordInput.value) return '';
  if (!currentPassword.value) return '请输入当前密码';
  return '';
});

const newPasswordError = computed(() => {
  if (!hasAnyPasswordInput.value) return '';
  if (!newPassword.value) return '请输入新密码';
  if (newPassword.value.length < 6) return '新密码长度不能少于 6 位';
  return '';
});

const confirmPasswordError = computed(() => {
  if (!hasAnyPasswordInput.value) return '';
  if (!confirmPassword.value) return '请再次输入新密码';
  if (confirmPassword.value !== newPassword.value) return '两次输入的新密码不一致';
  return '';
});

const canSubmitPassword = computed(
  () => isLoggedIn.value
    && hasAnyPasswordInput.value
    && !currentPasswordError.value
    && !newPasswordError.value
    && !confirmPasswordError.value
    && !updatingPassword.value,
);

const showUsernameError = computed(() => Boolean((usernameSubmitTried.value || username.value.trim() !== currentUsername.value) && usernameError.value));
const showCurrentPasswordError = computed(() => Boolean((passwordSubmitTried.value || hasAnyPasswordInput.value) && currentPasswordError.value));
const showNewPasswordError = computed(() => Boolean((passwordSubmitTried.value || hasAnyPasswordInput.value) && newPasswordError.value));
const showConfirmPasswordError = computed(() => Boolean((passwordSubmitTried.value || hasAnyPasswordInput.value) && confirmPasswordError.value));

const requestProfileUpdate = async (payload) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('请先登录');
  }

  const response = await fetch('/api/auth/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.message || '更新失败，请稍后重试');
  }
  return result;
};

const handleUpdateUsername = async () => {
  usernameSubmitTried.value = true;
  if (!isLoggedIn.value) {
    MessagePlugin.warning('请先登录');
    return;
  }
  if (!canSubmitUsername.value) {
    MessagePlugin.warning(usernameError.value || '请检查账号名');
    return;
  }
  const nextUsername = username.value.trim();

  updatingUsername.value = true;
  try {
    const result = await requestProfileUpdate({ username: nextUsername });
    const updatedUsername = result?.user?.username || nextUsername;

    patchUserMetadata({ username: updatedUsername });
    try {
      await supabase.auth.updateUser({ data: { username: updatedUsername } });
    } catch (_) {
      // 后端已写入，前端会话刷新失败时也不阻断主流程
    }
    await refreshAuthState({ refreshSession: true });

    MessagePlugin.success('账号名修改成功');
    usernameSubmitTried.value = false;
  } catch (error) {
    MessagePlugin.error(error.message || '账号名修改失败');
  } finally {
    updatingUsername.value = false;
  }
};

const handleUpdatePassword = async () => {
  passwordSubmitTried.value = true;
  if (!isLoggedIn.value) {
    MessagePlugin.warning('请先登录');
    return;
  }
  if (!canSubmitPassword.value) {
    MessagePlugin.warning(currentPasswordError.value || newPasswordError.value || confirmPasswordError.value || '请检查密码');
    return;
  }

  updatingPassword.value = true;
  try {
    await requestProfileUpdate({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });

    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    passwordSubmitTried.value = false;

    const { error: signOutError } = await signOutAndSync();
    MessagePlugin.success('密码修改成功，请重新登录');
    if (signOutError) {
      MessagePlugin.warning('远端退出失败，已清理本地登录态');
    }
    router.push('/');
    triggerLoginDialog();
  } catch (error) {
    MessagePlugin.error(error.message || '密码修改失败');
  } finally {
    updatingPassword.value = false;
  }
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

watch(
  () => sessionUser.value,
  (nextUser) => {
    username.value = nextUser?.user_metadata?.username || '';
    if (!nextUser) {
      usernameSubmitTried.value = false;
      passwordSubmitTried.value = false;
      currentPassword.value = '';
      newPassword.value = '';
      confirmPassword.value = '';
    }
  },
  { immediate: true },
);

onMounted(() => {
  refreshAuthState({ refreshSession: true }).catch(() => {
    // 认证服务异常时，UI 会根据 authReady/isLoggedIn 自动回退
  });
});
</script>

<style scoped>
.profile-view {
  width: 100%;
  min-height: calc(100vh - var(--header-height));
}

.profile-background {
  width: 100%;
  min-height: calc(100vh - var(--header-height));
  background: linear-gradient(135deg, rgba(0, 132, 255, 0.03) 0%, rgba(168, 237, 234, 0.05) 100%);
  padding: 24px 0;
}

.profile-content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

.profile-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow: var(--glass-shadow);
  padding: 28px;
}

.profile-header {
  margin-bottom: 20px;
}

.profile-title {
  margin: 0;
  font-size: 24px;
  color: var(--text-primary);
}

.profile-subtitle {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.profile-skeleton {
  padding: 6px 0;
}

.skeleton-block {
  height: 18px;
  width: 40%;
  border-radius: 9px;
  background: rgba(0, 132, 255, 0.12);
  margin-bottom: 14px;
}

.skeleton-row {
  height: 14px;
  width: 100%;
  border-radius: 8px;
  background: rgba(0, 132, 255, 0.08);
  margin-bottom: 10px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 12px;
}

.skeleton-card {
  height: 160px;
  border-radius: 14px;
  background: rgba(0, 132, 255, 0.08);
}

.profile-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.meta-item {
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  padding: 12px 14px;
}

.meta-label {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 4px;
}

.meta-value {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.profile-section {
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.section-actions {
  margin-top: 4px;
}

.field-feedback {
  margin-top: -4px;
  min-height: 20px;
  font-size: 12px;
  line-height: 20px;
  color: transparent;
  transition: color 0.12s ease;
}

.field-feedback.is-visible {
  color: #e34d59;
}

.profile-login-tip {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 768px) {
  .profile-content {
    padding: 0 16px;
  }

  .profile-card {
    padding: 20px;
  }

  .profile-meta,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .skeleton-grid {
    grid-template-columns: 1fr;
  }
}
</style>

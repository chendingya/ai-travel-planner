<template>
  <div class="auth-container">
    <t-dropdown v-if="user" trigger="click">
      <t-button variant="text" class="user-button">
        <t-icon name="user" />
        <span class="user-email">{{ user.email }}</span>
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
      header="登录 / 注册"
      :footer="false"
      width="400px"
      :z-index="10000"
      attach="body"
    >
      <t-form @submit="handleLogin">
        <t-form-item label="邮箱">
          <t-input
            v-model="email"
            placeholder="请输入您的邮箱"
            clearable
            required
          >
            <template #prefix-icon>
              <t-icon name="mail" />
            </template>
          </t-input>
        </t-form-item>
        <t-form-item>
          <t-button
            theme="primary"
            type="submit"
            block
            size="large"
            :loading="loading"
          >
            {{ loading ? '发送中...' : '发送登录链接' }}
          </t-button>
        </t-form-item>
        <div class="login-tips">
          <t-icon name="info-circle" size="14px" />
          我们将向您的邮箱发送一个登录链接
        </div>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { supabase, checkSupabaseAvailable } from '../supabase';
import { MessagePlugin } from 'tdesign-vue-next';

const email = ref('');
const user = ref(null);
const showLoginDialog = ref(false);
const loading = ref(false);

const handleLogin = async () => {
  if (!email.value) {
    MessagePlugin.warning('请输入邮箱地址');
    return;
  }

  // 检查 Supabase 是否可用
  if (!checkSupabaseAvailable()) {
    MessagePlugin.error('认证服务暂不可用，请检查网络连接或稍后再试');
    return;
  }
  
  loading.value = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.value,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
    MessagePlugin.success('登录链接已发送，请查收邮件！');
    showLoginDialog.value = false;
    email.value = '';
  } catch (error) {
    MessagePlugin.error(error.error_description || error.message || '登录失败，请稍后再试');
  } finally {
    loading.value = false;
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

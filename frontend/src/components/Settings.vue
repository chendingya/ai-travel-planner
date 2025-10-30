<template>
  <div class="settings-container">
    <h2>系统设置</h2>
    
    <div class="setting-section">
      <h3>API 配置</h3>
      <p class="setting-description">
        为了保护您的隐私和安全，API 密钥存储在浏览器本地，不会发送到任何服务器。
      </p>
      
      <div class="form-group">
        <label for="openai-key">OpenAI API 密钥:</label>
        <input 
          type="password" 
          id="openai-key" 
          v-model="settings.openaiKey" 
          placeholder="请输入您的 OpenAI API 密钥"
        >
        <p class="help-text">
          用于生成旅行计划的 AI 功能。您可以从 
          <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI 官网</a> 获取 API 密钥。
        </p>
      </div>
      
      <div class="form-group">
        <label for="supabase-url">Supabase URL:</label>
        <input 
          type="text" 
          id="supabase-url" 
          v-model="settings.supabaseUrl" 
          placeholder="请输入 Supabase 项目 URL"
        >
      </div>
      
      <div class="form-group">
        <label for="supabase-key">Supabase 匿名密钥:</label>
        <input 
          type="password" 
          id="supabase-key" 
          v-model="settings.supabaseKey" 
          placeholder="请输入 Supabase 匿名密钥"
        >
        <p class="help-text">
          用于连接到 Supabase 数据库进行用户认证和数据存储。
        </p>
      </div>
      
      <button @click="saveSettings" class="save-button">保存设置</button>
    </div>
    
    <div class="setting-section">
      <h3>安全说明</h3>
      <ul class="security-info">
        <li>所有密钥都安全地存储在浏览器本地，不会上传到任何服务器</li>
        <li>建议定期更换您的 API 密钥</li>
        <li>不要在公共计算机上保存敏感密钥</li>
        <li>如果您怀疑密钥泄露，请立即在提供商处重新生成</li>
      </ul>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  name: 'Settings',
  setup() {
    const settings = ref({
      openaiKey: '',
      supabaseUrl: '',
      supabaseKey: ''
    });

    // 组件挂载时从本地存储加载设置
    onMounted(() => {
      const savedSettings = localStorage.getItem('travelPlannerSettings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          settings.value = {
            openaiKey: parsed.openaiKey || '',
            supabaseUrl: parsed.supabaseUrl || '',
            supabaseKey: parsed.supabaseKey || ''
          };
        } catch (e) {
          console.error('加载设置时出错:', e);
        }
      }
    });

    // 保存设置到本地存储
    const saveSettings = () => {
      try {
        localStorage.setItem('travelPlannerSettings', JSON.stringify(settings.value));
        alert('设置已保存！');
      } catch (e) {
        console.error('保存设置时出错:', e);
        alert('保存设置失败，请重试。');
      }
    };

    return {
      settings,
      saveSettings
    };
  }
};
</script>

<style scoped>
.settings-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.setting-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #f9f9f9;
}

.setting-section h3 {
  margin-top: 0;
  color: #333;
}

.setting-description {
  color: #666;
  font-style: italic;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #444;
}

input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

input:focus {
  border-color: #007bff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.help-text {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #666;
}

.help-text a {
  color: #007bff;
  text-decoration: none;
}

.help-text a:hover {
  text-decoration: underline;
}

.save-button {
  padding: 0.75rem 1.5rem;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: bold;
}

.save-button:hover {
  background-color: #218838;
}

.security-info {
  padding-left: 1.5rem;
}

.security-info li {
  margin-bottom: 0.5rem;
  color: #555;
}
</style>
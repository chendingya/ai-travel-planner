let configCache = null;
let loadingPromise = null;

const injectConfigScript = () => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = '/config.js';
  script.async = false; // 保证加载完成后立即执行
  script.onload = () => {
    configCache = window.__APP_CONFIG__ || {};
    resolve(configCache);
  };
  script.onerror = () => {
    reject(new Error('配置脚本加载失败')); 
  };
  document.head.appendChild(script);
});

export const loadRuntimeConfig = async () => {
  if (configCache) {
    return configCache;
  }

  if (!loadingPromise) {
    loadingPromise = injectConfigScript().catch((error) => {
      loadingPromise = null;
      throw error;
    });
  }

  return loadingPromise;
};

export const getRuntimeConfig = () => configCache || {};

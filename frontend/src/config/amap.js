// 高德地图配置
export const AMAP_CONFIG = {
  key: import.meta.env.VITE_AMAP_KEY || '',
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE || '',
  version: '2.0',
  plugins: ['AMap.Driving', 'AMap.Marker', 'AMap.InfoWindow'],
};

// 检查高德地图配置
export const checkAmapConfig = () => {
  if (!AMAP_CONFIG.key) {
    console.warn('⚠️ 高德地图 API Key 未配置,请在 .env 文件中设置 VITE_AMAP_KEY');
    return false;
  }
  return true;
};

// 动态加载高德地图脚本
export const loadAmapScript = () => {
  return new Promise((resolve, reject) => {
    if (typeof AMap !== 'undefined') {
      resolve(AMap);
      return;
    }

    if (!checkAmapConfig()) {
      reject(new Error('高德地图 API Key 未配置'));
      return;
    }

    // 设置安全密钥
    if (AMAP_CONFIG.securityJsCode) {
      window._AMapSecurityConfig = {
        securityJsCode: AMAP_CONFIG.securityJsCode,
      };
    }

    const script = document.createElement('script');
    const pluginsStr = AMAP_CONFIG.plugins.join(',');
    script.src = `https://webapi.amap.com/maps?v=${AMAP_CONFIG.version}&key=${AMAP_CONFIG.key}&plugin=${pluginsStr}`;
    script.async = true;
    
    script.onload = () => {
      console.log('✅ 高德地图 API 加载成功');
      resolve(window.AMap);
    };
    
    script.onerror = () => {
      console.error('❌ 高德地图 API 加载失败');
      reject(new Error('高德地图 API 加载失败'));
    };
    
    document.head.appendChild(script);
  });
};

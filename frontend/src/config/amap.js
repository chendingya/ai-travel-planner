// 高德地图配置
export const AMAP_CONFIG = {
  key: import.meta.env.VITE_AMAP_KEY || '',
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE || '',
  version: '2.0',
  plugins: ['AMap.Driving', 'AMap.Marker', 'AMap.InfoWindow'],
};

// 检查高德地图配置
export const checkAmapConfig = () => {
  console.log('🔍 检查高德地图配置...');
  console.log('VITE_AMAP_KEY:', AMAP_CONFIG.key ? `${AMAP_CONFIG.key.substring(0, 10)}...` : '未配置');
  console.log('VITE_AMAP_SECURITY_CODE:', AMAP_CONFIG.securityJsCode ? '已配置' : '未配置');
  
  if (!AMAP_CONFIG.key) {
    console.warn('⚠️ 高德地图 API Key 未配置,请在 .env 文件中设置 VITE_AMAP_KEY');
    return false;
  }
  console.log('✅ 高德地图配置检查通过');
  return true;
};

// 动态加载高德地图脚本
export const loadAmapScript = () => {
  return new Promise((resolve, reject) => {
    // 如果已经加载,直接返回
    if (typeof AMap !== 'undefined') {
      console.log('✅ 高德地图 API 已加载');
      resolve(AMap);
      return;
    }

    // 检查配置
    if (!checkAmapConfig()) {
      const error = new Error('高德地图 API Key 未配置');
      console.error('❌', error.message);
      reject(error);
      return;
    }

    console.log('📦 开始加载高德地图 API...');

    // 设置安全密钥
    if (AMAP_CONFIG.securityJsCode) {
      window._AMapSecurityConfig = {
        securityJsCode: AMAP_CONFIG.securityJsCode,
      };
      console.log('🔐 安全密钥已设置');
    }

    const script = document.createElement('script');
    const pluginsStr = AMAP_CONFIG.plugins.join(',');
    script.src = `https://webapi.amap.com/maps?v=${AMAP_CONFIG.version}&key=${AMAP_CONFIG.key}&plugin=${pluginsStr}`;
    script.async = true;
    
    script.onload = () => {
      console.log('✅ 高德地图 API 脚本加载成功');
      if (typeof AMap !== 'undefined') {
        console.log('✅ AMap 对象已就绪');
        resolve(window.AMap);
      } else {
        const error = new Error('高德地图脚本加载后 AMap 对象不存在');
        console.error('❌', error.message);
        reject(error);
      }
    };
    
    script.onerror = (error) => {
      console.error('❌ 高德地图 API 脚本加载失败', error);
      reject(new Error('高德地图 API 加载失败,请检查网络连接或 API Key 是否正确'));
    };
    
    document.head.appendChild(script);
    console.log('📡 高德地图脚本已插入 DOM');
  });
};

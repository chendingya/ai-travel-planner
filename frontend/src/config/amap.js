import { loadRuntimeConfig, getRuntimeConfig } from '../runtimeConfig'

// 高德地图配置（默认空，待运行时加载）
export const AMAP_CONFIG = {
  key: '',
  securityJsCode: '',
  version: '2.0',
  plugins: ['AMap.Driving', 'AMap.Riding', 'AMap.Marker', 'AMap.InfoWindow'],
};

loadRuntimeConfig()
  .then(() => {
    const { amapKey = '', amapSecurityCode = '' } = getRuntimeConfig();
    AMAP_CONFIG.key = amapKey;
    AMAP_CONFIG.securityJsCode = amapSecurityCode;
  })
  .catch((error) => {
    console.warn('⚠️ 高德地图运行时配置加载失败:', error.message);
  });

// 检查高德地图配置
export const checkAmapConfig = async () => {
  await loadRuntimeConfig();
  console.log('🔍 检查高德地图配置...');
  console.log('PUBLIC_AMAP_KEY:', AMAP_CONFIG.key ? `${AMAP_CONFIG.key.substring(0, 10)}...` : '未配置');
  console.log('PUBLIC_AMAP_SECURITY_CODE:', AMAP_CONFIG.securityJsCode ? '已配置' : '未配置');
  
  if (!AMAP_CONFIG.key) {
    console.warn('⚠️ 高德地图 API Key 未配置,请通过环境变量 PUBLIC_AMAP_KEY 注入');
    return false;
  }
  console.log('✅ 高德地图配置检查通过');
  return true;
};

// 动态加载高德地图脚本
export const loadAmapScript = () => {
  return new Promise(async (resolve, reject) => {
    try {
      await loadRuntimeConfig();
    } catch (error) {
      console.error('❌ 高德地图配置加载失败', error);
      reject(error);
      return;
    }

    // 如果已经加载,直接返回
    if (typeof AMap !== 'undefined') {
      console.log('✅ 高德地图 API 已加载');
      resolve(AMap);
      return;
    }

    // 检查配置
    const isConfigured = await checkAmapConfig();
    if (!isConfigured) {
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

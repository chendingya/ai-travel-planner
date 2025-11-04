import { loadRuntimeConfig, getRuntimeConfig } from '../runtimeConfig';

const API_BASE_URL = 'https://restapi.amap.com/v3';
let cachedApiKey = '';
let keyLoadingPromise = null;

const poiCache = new Map();
const geocodeCache = new Map();
const regeoCache = new Map();

const normalizeCacheKey = (text = '') => text.trim().replace(/\s+/g, ' ').toLowerCase();

const ensureApiKey = async () => {
  if (cachedApiKey) return cachedApiKey;
  if (!keyLoadingPromise) {
    keyLoadingPromise = loadRuntimeConfig()
      .then(() => {
        const { amapRestKey = '', amapKey = '' } = getRuntimeConfig();
        const effectiveKey = amapRestKey || amapKey;
        if (!effectiveKey) {
          throw new Error('未配置高德 Web 服务 API Key');
        }
        if (!amapRestKey && amapKey) {
          console.warn('⚠️ 未检测到专用 Web 服务 Key (PUBLIC_AMAP_REST_KEY)，已回退使用前端 Key。这可能导致 USERKEY_PLAT_NOMATCH 错误。');
        }
        cachedApiKey = effectiveKey;
        return cachedApiKey;
      })
      .catch((error) => {
        keyLoadingPromise = null;
        throw error;
      });
  }
  return keyLoadingPromise;
};

const parseLocation = (location) => {
  if (!location || typeof location !== 'string') return null;
  const parts = location.split(',').map((value) => Number.parseFloat(value));
  if (parts.length !== 2 || parts.some((v) => !Number.isFinite(v))) return null;
  const [lng, lat] = parts;
  return [lat, lng];
};

const requestAmap = async (path, params) => {
  const key = await ensureApiKey();
  const searchParams = new URLSearchParams({ key, output: 'JSON', ...params });
  const url = `${API_BASE_URL}${path}?${searchParams.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`高德服务请求失败: ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== '1') {
    const message = data.info || '未知错误';
    const error = new Error(`高德服务返回错误: ${message}`);
    error.info = message;
    error.infocode = data.infocode;
    if (typeof message === 'string' && message.includes('USERKEY_PLAT_NOMATCH')) {
      error.isKeyMismatch = true;
      error.userMessage = '高德 Web 服务 Key 与调用平台不匹配。请配置 Web 服务类型 Key (PUBLIC_AMAP_REST_KEY)。';
    }
    throw error;
  }
  return data;
};

export const searchPoi = async ({ keywords, city, types, citylimit = true, offset = 20, page = 1 } = {}) => {
  if (!keywords) throw new Error('searchPoi 需要 keywords 参数');

  const cacheKey = `${normalizeCacheKey(keywords)}|${normalizeCacheKey(city)}|${normalizeCacheKey(Array.isArray(types) ? types.join('|') : types || '')}|${citylimit}|${offset}|${page}`;
  if (poiCache.has(cacheKey)) return poiCache.get(cacheKey);

  const params = {
    keywords,
    offset: Math.max(1, Math.min(offset, 25)).toString(),
    page: Math.max(1, page).toString(),
    extensions: 'all',
  };

  if (city) params.city = city;
  if (citylimit) params.citylimit = 'true';
  if (types) params.types = Array.isArray(types) ? types.join('|') : types;

  const data = await requestAmap('/place/text', params);
  const pois = Array.isArray(data.pois) ? data.pois : [];
  const result = pois.map((poi) => ({
    id: poi.id,
    name: poi.name,
    type: poi.type,
    typecode: poi.typecode,
    address: poi.address,
    adcode: poi.adcode,
    citycode: poi.citycode,
    cityname: poi.cityname,
    district: poi.adname,
    location: parseLocation(poi.location),
    raw: poi,
  }));

  poiCache.set(cacheKey, result);
  return result;
};

export const geocodeAddress = async ({ address, city } = {}) => {
  if (!address) throw new Error('geocodeAddress 需要 address 参数');

  const cacheKey = `${normalizeCacheKey(address)}|${normalizeCacheKey(city)}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const params = { address };
  if (city) params.city = city;

  const data = await requestAmap('/geocode/geo', params);
  const geocodes = Array.isArray(data.geocodes) ? data.geocodes : [];
  const [first] = geocodes;
  const result = first
    ? {
        location: parseLocation(first.location),
        level: first.level,
        adcode: first.adcode,
        city: first.city || first.province,
        district: first.district,
        formattedAddress: first.formatted_address,
        raw: first,
      }
    : null;

  geocodeCache.set(cacheKey, result);
  return result;
};

export const reverseGeocode = async ({ location, radius = 1000 } = {}) => {
  if (!Array.isArray(location) || location.length !== 2) {
    throw new Error('reverseGeocode 需要 location 数组参数 [lat, lng]');
  }
  const [lat, lng] = location;
  const cacheKey = `${lng.toFixed(6)}_${lat.toFixed(6)}_${radius}`;
  if (regeoCache.has(cacheKey)) return regeoCache.get(cacheKey);

  const params = {
    location: `${lng},${lat}`,
    radius: Math.max(0, Math.min(radius, 3000)).toString(),
    extensions: 'all',
  };

  const data = await requestAmap('/geocode/regeo', params);
  const regeocode = data.regeocode || {};
  const addressComponent = regeocode.addressComponent || {};
  const result = {
    formattedAddress: regeocode.formatted_address || '',
    province: addressComponent.province || '',
    city: addressComponent.city || addressComponent.province || '',
    district: addressComponent.district || '',
    township: addressComponent.township || '',
    adcode: addressComponent.adcode || '',
    citycode: addressComponent.citycode || '',
    raw: regeocode,
  };

  regeoCache.set(cacheKey, result);
  return result;
};

export const clearAmapCaches = () => {
  poiCache.clear();
  geocodeCache.clear();
  regeoCache.clear();
};

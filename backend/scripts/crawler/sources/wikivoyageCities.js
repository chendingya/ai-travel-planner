/**
 * wikivoyageCities.js
 * 动态从中文 Wikivoyage 分类树中枚举所有中国城市/目的地页面。
 * 同时构建 中文名 ↔ 英文名 映射表（通过 langlinks API）。
 *
 * 策略：
 *   1. 从已知的中国顶级区域分类开始（Category:华东、Category:华南 等）
 *   2. 递归深度 3 层：区域 → 省份 → 城市
 *   3. 过滤掉非城市页面（行政区类分类名、模板等）
 *   4. 对每个中文页面查询对应英文 Wikivoyage 页面标题 (langlinks)
 *   5. 结果缓存到 backend/data/knowledge/city_list_cache.json，避免重复请求
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { get: makeRequest } = require('../utils/httpClient');

const ZH_API  = 'https://zh.wikivoyage.org/w/api.php';
const EN_API  = 'https://en.wikivoyage.org/w/api.php';
const CACHE_PATH = path.join(__dirname, '../../../data/knowledge/city_list_cache.json');

// 中国顶级区域分类（zh.wikivoyage）
const ROOT_CATEGORIES = [
  'Category:华东',
  'Category:华南',
  'Category:华北',
  'Category:华中',
  'Category:西南',
  'Category:西北',
  'Category:中国东北',
  'Category:中国东南',
  'Category:港澳台',
];

// 不应该作为"城市"的页面标题模式
const EXCLUDE_PATTERNS = [
  /^Category:/,
  /^Template:/,
  /^Wikivoyage:/,
  /\//,        // 跳过子区域页面，如「上海/浦东」「北京/朝阳区」
  /中国$/,
  /^中国$/,
  /地区$/,
  /省$/,
  /自治区$/,
  /直辖市$/,
  /特别行政区$/,
  /机场$/,     // 跳过机场专题页
  /国际机场$/,
];

function isExcluded(title) {
  return EXCLUDE_PATTERNS.some((p) => p.test(title));
}

/**
 * 获取一个分类的所有成员（含分页）
 * @returns {{ pages: string[], subcats: string[] }}
 */
async function fetchCategoryMembers(cat) {
  const pages   = [];
  const subcats = [];
  let cont      = undefined;

  do {
    const params = {
      action:    'query',
      list:      'categorymembers',
      cmtitle:   cat,
      cmprop:    'title|type',
      cmlimit:   500,
      format:    'json',
    };
    if (cont) params.cmcontinue = cont;

    const data = await makeRequest(ZH_API, params);
    const members = (data.query && data.query.categorymembers) || [];

    for (const m of members) {
      if (m.type === 'page')   pages.push(m.title);
      else if (m.type === 'subcat') subcats.push(m.title);
    }
    cont = data.continue && data.continue.cmcontinue;
  } while (cont);

  return { pages, subcats };
}

/**
 * 递归收集分类树下所有页面
 */
async function collectPages(cat, depth, visited = new Set()) {
  if (depth < 0 || visited.has(cat)) return [];
  visited.add(cat);

  const { pages, subcats } = await fetchCategoryMembers(cat);
  let result = pages.filter((t) => !isExcluded(t));

  for (const sub of subcats) {
    if (!visited.has(sub)) {
      const subPages = await collectPages(sub, depth - 1, visited);
      result.push(...subPages);
    }
  }
  return result;
}

/**
 * 批量查询中文页面对应的英文 Wikivoyage 页面标题
 * 每次最多查 50 个（API 上限）
 * @param {string[]} zhTitles
 * @returns {Map<string, string>}  zhTitle → enTitle
 */
async function buildLangMap(zhTitles) {
  const map  = new Map();
  const BATCH = 50;

  for (let i = 0; i < zhTitles.length; i += BATCH) {
    const batch = zhTitles.slice(i, i + BATCH);
    const data = await makeRequest(ZH_API, {
      action:    'query',
      titles:    batch.join('|'),
      prop:      'langlinks',
      lllang:    'en',
      lllimit:   500,
      format:    'json',
    });

    const pagesObj = (data.query && data.query.pages) || {};
    for (const page of Object.values(pagesObj)) {
      if (page.missing !== undefined) continue;
      const enLink = (page.langlinks || []).find((l) => l.lang === 'en');
      if (enLink) map.set(page.title, enLink['*']);
    }
  }

  return map;
}

/**
 * 主函数：返回城市列表
 * @returns {Array<{ zh: string, en: string|null }>}
 */
async function getCityList({ forceRefresh = false } = {}) {
  // 读缓存
  if (!forceRefresh && fs.existsSync(CACHE_PATH)) {
    const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    console.log(`[wikivoyageCities] 命中缓存，共 ${cached.length} 个城市`);
    return cached;
  }

  console.log('[wikivoyageCities] 开始从 Wikivoyage 分类树枚举城市...');
  const visited  = new Set();
  let allPages   = [];

  for (const rootCat of ROOT_CATEGORIES) {
    console.log(`  扫描分类: ${rootCat}`);
    const pages = await collectPages(rootCat, 3, visited);
    allPages.push(...pages);
  }

  // 去重
  const unique = [...new Set(allPages)];
  console.log(`[wikivoyageCities] 发现 ${unique.length} 个唯一页面，开始查询英文对应名...`);

  // 构建中英文映射
  const langMap = await buildLangMap(unique);

  const cityList = unique.map((zh) => ({
    zh,
    en: langMap.get(zh) || null,
  }));

  console.log(`[wikivoyageCities] 完成。共 ${cityList.length} 个城市，其中 ${langMap.size} 个有英文对应页`);

  // 写缓存
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cityList, null, 2), 'utf8');

  return cityList;
}

module.exports = { getCityList };

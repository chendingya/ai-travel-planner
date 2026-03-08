/**
 * Wikivoyage 爬虫模块
 * 通过 Wikivoyage Action API 获取中文旅游知识文章（CC-BY-SA 3.0）
 *
 * API 文档：https://www.mediawiki.org/wiki/API:Parsing_wikitext
 * 内容协议：https://creativecommons.org/licenses/by-sa/3.0/
 */

const { get } = require('../utils/httpClient');
const { CRAWL_CONFIG } = require('../config');

const API_BASE = CRAWL_CONFIG.wikivoyageApiBase;

/**
 * 获取城市的 Wikivoyage 原始数据
 * @param {string} city - 城市名称（中文）
 * @returns {Promise<object|null>}
 */
async function fetchCityPage(city) {
  const data = await get(API_BASE, {
    action: 'parse',
    page: city,
    format: 'json',
    prop: 'text|sections',
    redirects: 1,
    formatversion: '2',
  });

  if (!data.parse) return null;

  return {
    title: data.parse.title,
    pageid: data.parse.pageid,
    text: data.parse.text || '',
    sections: data.parse.sections || [],
  };
}

/**
 * 爬取城市页面
 * @param {string} city
 * @returns {Promise<{city, sourceUrl, text, sections}|null>}
 */
async function crawlCity(city) {
  console.log(`  [爬取] ${city} ...`);
  try {
    const page = await fetchCityPage(city);
    if (!page) {
      console.warn(`    ${city}：Wikivoyage 无此页面，跳过`);
      return null;
    }

    return {
      city,
      pageTitle: page.title,
      sourceUrl: `https://zh.wikivoyage.org/wiki/${encodeURIComponent(page.title)}`,
      text: page.text,          // 完整 HTML
      sections: page.sections,  // 分节元数据 [{toclevel, line, anchor, number}]
    };
  } catch (error) {
    if (error.response?.status === 404) {
      console.warn(`    ${city}：页面不存在，跳过`);
      return null;
    }
    throw error;
  }
}

module.exports = { crawlCity };

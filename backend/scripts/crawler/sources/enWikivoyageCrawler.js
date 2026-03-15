/**
 * enWikivoyageCrawler.js
 * 从英文 Wikivoyage 爬取城市页面，作为中文页面内容不足时的回退来源。
 *
 * 工作流：
 *   1. 接受英文页面标题（由 wikivoyageCities 的 langlinks 提供）
 *   2. 使用同一套 contentParser 解析 HTML → chunks
 *   3. 在 chunk 的 metadata 中标注 lang:'en'，供 RAG 过滤使用
 */

'use strict';

const { get } = require('../utils/httpClient');

const EN_API_BASE = 'https://en.wikivoyage.org/w/api.php';

/**
 * 从英文 Wikivoyage 获取城市页面
 * @param {string} enTitle - 英文页面标题，例如 "Beijing"
 * @returns {Promise<{city, pageTitle, sourceUrl, text, sections, lang}|null>}
 */
async function crawlCityEn(enTitle) {
  console.log(`  [EN回退] ${enTitle} ...`);
  try {
    const data = await get(EN_API_BASE, {
      action:        'parse',
      page:          enTitle,
      format:        'json',
      prop:          'text|sections',
      redirects:     1,
      formatversion: '2',
    });

    if (!data.parse) {
      console.warn(`    EN: ${enTitle} 无此页面，跳过`);
      return null;
    }

    return {
      city:      enTitle,             // 英文名；调用方会传入对应中文名覆盖
      pageTitle: data.parse.title,
      sourceUrl: `https://en.wikivoyage.org/wiki/${encodeURIComponent(data.parse.title)}`,
      text:      data.parse.text || '',
      sections:  data.parse.sections || [],
      lang:      'en',                // 标注语言，用于 RAG 过滤
    };
  } catch (err) {
    if (err.response?.status === 404) {
      console.warn(`    EN: ${enTitle} 页面不存在，跳过`);
      return null;
    }
    throw err;
  }
}

module.exports = { crawlCityEn };

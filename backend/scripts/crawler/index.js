#!/usr/bin/env node
/**
 * 知识库爬虫入口
 * 数据来源：Wikivoyage（CC-BY-SA 3.0）
 *
 * ⚠️  国内网络须设置代理后运行（Wikivoyage 在大陆被屏蔽）：
 *   PowerShell:  chcp 65001; $env:HTTPS_PROXY="http://127.0.0.1:7890"
 *   bash:        export HTTPS_PROXY=http://127.0.0.1:7890
 *
 * 用法：
 *   node scripts/crawler/index.js                              # 动态发现所有城市并爬取
 *   node scripts/crawler/index.js --city 北京                  # 只爬取指定城市（中/英文名均可）
 *   node scripts/crawler/index.js --static-cities              # 使用 config.js 中的静态城市列表
 *   node scripts/crawler/index.js --proxy http://127.0.0.1:7890  # 指定代理
 *   node scripts/crawler/index.js --refresh-cities             # 强制刷新城市缓存
 *   node scripts/crawler/index.js --en-threshold 5             # 中文chunk数<N时启用英文回退（默认5）
 *   node scripts/crawler/index.js --dry-run                    # 试运行（不写文件）
 *
 * 输出：backend/data/knowledge/knowledge_<时间戳>.jsonl
 */

// 强制 stdout/stderr 使用 UTF-8，避免 Windows PowerShell 乱码
if (process.stdout.isTTY) process.stdout.setDefaultEncoding('utf8');
if (process.stderr.isTTY) process.stderr.setDefaultEncoding('utf8');

'use strict';

// ─── Windows UTF-8 输出修正（必须在最开始） ──────────────────────────────────
if (process.platform === 'win32') {
  try { require('child_process').execSync('chcp 65001', { stdio: 'ignore' }); } catch (_) {}
}

// ─── CLI 参数解析（必须在所有 require() 之前，让代理 env 对懒加载模块可见） ──────
const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const cityArg        = getArg('--city');
const isDryRun       = args.includes('--dry-run');
const useStaticCities = args.includes('--static-cities');
const forceRefreshCities = args.includes('--refresh-cities');
const enThreshold    = parseInt(getArg('--en-threshold') || '5', 10);

// --proxy 覆盖写入 env，让 httpClient 懒加载时能读到
const proxyArg = getArg('--proxy');
if (proxyArg) process.env.HTTPS_PROXY = proxyArg;

// ─── 模块 require（在代理 env 写入之后） ─────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const { CITIES, CRAWL_CONFIG } = require('./config');
const { crawlCity }            = require('./sources/wikivoyageCrawler');
const { crawlCityEn }          = require('./sources/enWikivoyageCrawler');
const { getCityList }          = require('./sources/wikivoyageCities');
const { parseCityData }        = require('./contentParser');
const { SPECIAL_NOTICES }      = require('./data/specialNotices');
const { saveChunks, saveSummary } = require('./dataExporter');

// ─── 内部 UTF-8 日志（绕过 PowerShell 管道编码问题） ────────────────────────────
const LOG_PATH    = path.join(__dirname, 'crawl.log');
const _logStream  = fs.createWriteStream(LOG_PATH, { flags: 'w', encoding: 'utf8' });
const _origLog    = console.log.bind(console);
const _origWarn   = console.warn.bind(console);
const _origErr    = console.error.bind(console);
const _tee = (fn, ...args) => { const m = args.join(' '); fn(m); _logStream.write(m + '\n'); };
console.log   = (...a) => _tee(_origLog,  ...a);
console.warn  = (...a) => _tee(_origWarn, ...a);
console.error = (...a) => _tee(_origErr,  ...a);

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      AI 旅行助手 知识库爬虫 v2.0        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`数据来源：Wikivoyage（CC-BY-SA 3.0）\n`);
  console.log(`请求间隔：${CRAWL_CONFIG.delayMs} ms`);
  console.log(`英文回退阈值：中文片段 < ${enThreshold} 时启用`);
  console.log(`试运行模式：${isDryRun ? '是（不写入文件）' : '否'}\n`);

  // ── 0. 确定目标城市列表 ────────────────────────────────────────────────────
  let targetCities; // Array<{ zh: string, en: string|null }>

  if (cityArg) {
    // 单城市模式：允许中文或英文名
    targetCities = [{ zh: cityArg, en: null }];
  } else if (useStaticCities) {
    // 静态列表模式（config.js 中的 CITIES 数组，保持向后兼容）
    targetCities = CITIES.map((zh) => ({ zh, en: null }));
    console.log(`[静态列表] 共 ${targetCities.length} 个城市`);
  } else {
    // 动态发现模式：从 Wikivoyage 分类树枚举（带缓存）
    console.log('[动态发现] 正在从 Wikivoyage 分类树获取城市列表...');
    targetCities = await getCityList({ forceRefresh: forceRefreshCities });
  }

  console.log(`目标城市数：${targetCities.length}\n`);

  const allChunks = [];
  const stats = {
    total:      targetCities.length,
    success:    0,
    enFallback: 0,   // 使用了英文回退
    skipped:    0,
    failed:     0,
    chunks:     0,
    errors:     [],
    startedAt:  new Date().toISOString(),
  };

  // ── 1. 逐城市爬取 ──────────────────────────────────────────────────────────
  for (let i = 0; i < targetCities.length; i++) {
    const { zh: city, en: enTitle } = targetCities[i];
    console.log(`[${i + 1}/${targetCities.length}] 处理城市：${city}${enTitle ? ` (${enTitle})` : ''}`);

    try {
      // 1a. 先抓中文页面
      const cityData = await crawlCity(city);
      let chunks     = cityData ? parseCityData(cityData) : [];

      // 1b. 英文回退：中文片段不足时尝试英文页面补充
      if (chunks.length < enThreshold && enTitle) {
        console.log(`    中文片段仅 ${chunks.length} 个，尝试英文回退 (${enTitle})...`);
        const enData = await crawlCityEn(enTitle);
        if (enData) {
          // 复用 contentParser（支持英文 HTML 结构一致）
          // 把城市名替换成中文名，保持一致性
          const enDataWithZh = { ...enData, city };
          const enChunks     = parseCityData(enDataWithZh).map((c) => ({
            ...c,
            lang:   'en',
            source: 'wikivoyage-en',
          }));
          if (enChunks.length > 0) {
            chunks = [...chunks, ...enChunks];
            stats.enFallback++;
            console.log(`    ✓ 英文回退补充 ${enChunks.length} 个片段`);
          }
        }
      }

      if (chunks.length === 0) {
        stats.skipped++;
        continue;
      }

      console.log(`    ✓ 生成 ${chunks.length} 个知识片段`);
      allChunks.push(...chunks);
      stats.success++;
    } catch (error) {
      console.error(`    ✗ 爬取失败：${error.message}`);
      stats.failed++;
      stats.errors.push({ city, error: error.message });
    }
  }

  // ── 2. 合并静态注意事项数据 ─────────────────────────────────────────────────
  const noticesToMerge = cityArg
    ? SPECIAL_NOTICES.filter((n) => n.city === cityArg)
    : SPECIAL_NOTICES;

  if (noticesToMerge.length > 0) {
    const decoratedNotices = noticesToMerge.map((n) => ({
      ...n,
      source:  'manual',
      sourceUrl: null,
      license: '本项目整理',
    }));
    allChunks.push(...decoratedNotices);
    console.log(`\n✓ 合并静态注意事项：${decoratedNotices.length} 条`);
  }

  // ── 3. 统计 & 输出 ──────────────────────────────────────────────────────────
  stats.chunks     = allChunks.length;
  stats.finishedAt = new Date().toISOString();

  console.log('\n─────────────────────────────────────────');
  console.log(`成功：${stats.success} 个城市`);
  console.log(`英文回退：${stats.enFallback} 个城市`);
  console.log(`跳过（无内容）：${stats.skipped} 个城市`);
  console.log(`失败：${stats.failed} 个城市`);
  console.log(`总知识片段：${stats.chunks} 条`);

  if (stats.errors.length > 0) {
    console.log('\n失败列表：');
    stats.errors.forEach((e) => console.log(`  - ${e.city}: ${e.error}`));
  }

  if (!isDryRun && allChunks.length > 0) {
    const outputPath  = saveChunks(allChunks);
    const summaryPath = saveSummary(stats);
    console.log(`\n✓ 已写入：${outputPath}`);
    console.log(`✓ 统计：  ${summaryPath}`);
  } else if (isDryRun) {
    console.log('\n[试运行] 未写入文件。');
  }

  console.log('\n爬取完成。\n');
}

main().catch((err) => {
  console.error('\n致命错误：', err);
  process.exit(1);
});

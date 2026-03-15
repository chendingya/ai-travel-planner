#!/usr/bin/env node
/**
 * filter.js — 知识库内容安全过滤器
 *
 * 对已爬取的 JSONL 知识片段进行两轮过滤：
 *   1. 静态规则过滤（无需联网，速度快）
 *      - 历史政治敏感内容
 *      - 大模型常见审核敏感词
 *   2. LLM 评分过滤（可选，--llm 开启）
 *      - 对通过静态规则的 chunk 调用本地大模型进行内容安全评分
 *
 * 用法：
 *   node filter.js <input.jsonl> [options]
 *   node filter.js knowledge_20260306.jsonl --out knowledge_filtered.jsonl
 *   node filter.js knowledge_20260306.jsonl --dry-run          # 只打印会被过滤的条目
 *   node filter.js knowledge_20260306.jsonl --llm              # 开启 LLM 二次过滤
 *   node filter.js knowledge_20260306.jsonl --log-rejected     # 把被过滤的写入 rejected_*.jsonl
 */

'use strict';

// 强制 stdout/stderr 使用 UTF-8，避免 Windows PowerShell 乱码
if (process.stdout.isTTY) process.stdout.setDefaultEncoding('utf8');
if (process.stderr.isTTY) process.stderr.setDefaultEncoding('utf8');

const fs   = require('fs');
const path = require('path');

// ─── CLI 参数 ────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const inputFile = args.find((a) => !a.startsWith('--'));
const isDryRun  = args.includes('--dry-run');
const useLLM    = args.includes('--llm');
const logRejected = args.includes('--log-rejected');
const outArg    = args[args.indexOf('--out') + 1];

if (!inputFile) {
  console.error('用法: node filter.js <input.jsonl> [--out output.jsonl] [--dry-run] [--llm] [--log-rejected]');
  process.exit(1);
}

const inputPath  = path.resolve(inputFile);
const outputPath = outArg
  ? path.resolve(outArg)
  : inputPath.replace(/\.jsonl$/, '_filtered.jsonl');
const rejectPath = inputPath.replace(/\.jsonl$/, '_rejected.jsonl');

// 安全检查：禁止输出路径与输入路径相同（防止覆盖原始文件）
if (outputPath === inputPath) {
  console.error('错误：输出路径与输入路径相同，将覆盖原始文件，已中止。请用 --out 指定其他路径。');
  process.exit(1);
}

// ─── 内容清洗：去除 MediaWiki 内联 CSS 规则 ──────────────────────────────────
/**
 * 从 content 字段中清除爬虫残留的 MediaWiki CSS 规则字符串，
 * 以及 [dead link] 等维基页面专用标注。
 * 不移除整个 chunk，仅对 content 做文本替换。
 */
function cleanContent(text) {
  if (!text) return text;
  return text
    // 移除 .mw-parser-output 开头的 CSS 规则块（可能连续多个）
    .replace(/(?:\.[\w-]+(?:\s+\.[\w-]+)*)\s*\{[^}]{0,500}\}/g, '')
    // 移除残留的孤立 CSS class 选择器片段
    .replace(/\.mw-parser-output\b[^{\n]*/g, '')
    // 移除 [dead link] 等维基标注
    .replace(/\[dead link\]/gi, '')
    // 清理多余空白
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── 静态规则：政治历史敏感内容 ─────────────────────────────────────────────
/**
 * 匹配以下场景时过滤整个 chunk：
 *   - chunk 为纯历史政治叙述（section 类型 + 内容关键词双重判断）
 *   - 内容包含高风险词组
 *
 * 注意：旅游实用信息（价格、交通、景点介绍）不会被过滤，
 * 即使这些信息出现在"了解"章节下。
 */

// 高风险词组：一旦匹配，无论 type 都过滤
const HIGH_RISK_PHRASES = [
  // 政治事件（明确指向政治评述，非历史陈述的表述）
  /天安门事件/,
  /六四事件|六四镇压/,
  /文化大革命.{0,10}(破坏|摧毁|冲击|浩劫)/,
  /反右运动.{0,10}(迫害|打倒)/,
  /台湾(独立|分裂)/,
  /西藏(独立|分裂)/,
  /新疆(独立|分裂)/,
  /分裂主义/,
  /法轮功/,
  // 领导人政治评述（具体姓名 + 政治动词组合）
  /习近平/,
  // 违禁组织
  /东突/,
];

// 历史政治叙述型内容：chunk 标题含"了解/历史" 且 内容包含历史政治叙述触发词时过滤
// 注意：景点介绍中出现历史词汇是正常的（如「拉贝故居建于1937年日军占领南京期间」），
// 只有在「了解/历史」类专门叙述段落才过滤。
const HISTORY_SECTION_TITLES = /^(了解|历史|政治|政治体制|历史背景|历史沿革)/;
const HISTORY_CONTENT_TRIGGERS = [
  // 政权更迭叙述（含年份 + 政党/军队 + 结果动词）
  /\d{4}年.{0,15}(共产党|国民党|解放军).{0,15}(占领|接管|撤退|解放|控制)/,
  // 孤岛/租界政治叙述
  /租界.{0,10}孤岛时期/,
  /孤岛.{0,10}繁荣/,
  /内战.{0,10}(经济崩溃|物价飞涨|陷入崩溃)/,
  // 政治运动
  /红卫兵|造反派/,
  // 日军侵占叙述（非景点语境——景点语境通常带地名+数字+具体设施名）
  /沦为日军(防区|占领区)/,
  /日军开始占领租界/,
];

// 大模型审核常见敏感词（色情、暴力、违禁品等）
const LLM_MODERATION_PATTERNS = [
  // 违禁品交易
  /购买.*毒品|毒品.*购买/,
  /大麻.*合法|合法.*大麻/,
  /黑市.*枪|枪.*黑市/,
  // 色情
  /红灯区(?!历史|文化)/,
  /卖淫|嫖娼/,
  /性交易/,
  // 赌博（澳门除外，澳门赌场是合法旅游景点）
  /非法赌博/,
  /地下赌场/,
];

/**
 * 静态规则过滤
 * @returns {{ keep: boolean, reason: string|null }}
 */
function staticFilter(chunk) {
  const text = (chunk.title || '') + ' ' + (chunk.content || '');

  // 1. 高风险词组检查
  for (const pattern of HIGH_RISK_PHRASES) {
    if (pattern.test(text)) {
      return { keep: false, reason: `高风险词组: ${pattern}` };
    }
  }

  // 2. 大模型敏感词检查
  for (const pattern of LLM_MODERATION_PATTERNS) {
    if (pattern.test(text)) {
      return { keep: false, reason: `大模型敏感词: ${pattern}` };
    }
  }

  // 3. 历史政治叙述型内容（标题属于「了解/历史」类 + 内容触发词 双重匹配）
  //    只过滤专门讲历史政治的段落，不影响景点介绍中偶尔提到的历史背景
  const sectionTitle = chunk.sectionTitle || chunk.title || '';
  const isHistorySection = HISTORY_SECTION_TITLES.test(sectionTitle);
  if (isHistorySection) {
    for (const pattern of HISTORY_CONTENT_TRIGGERS) {
      if (pattern.test(chunk.content || '')) {
        return { keep: false, reason: `历史政治叙述: ${pattern}` };
      }
    }
  }

  return { keep: true, reason: null };
}

// ─── LLM 过滤（调用本地已有的 AI 服务） ─────────────────────────────────────
/**
 * 通过 LLM 评估内容安全性（0-10 分，<= 3 过滤）
 * 使用项目自身的 LangChain 配置（从 backend 配置读取）
 */
async function llmFilter(chunk) {
  // 动态 require，避免加载整个 LangChain 框架（未开启 --llm 时不需要）
  let ChatOpenAI;
  try {
    ({ ChatOpenAI } = require('@langchain/openai'));
  } catch {
    console.warn('[LLM过滤] @langchain/openai 未安装，跳过 LLM 过滤');
    return { keep: true, reason: null };
  }

  // 读取项目 .env 中的 API KEY
  const envPath = path.join(__dirname, '../../..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }

  const model = new ChatOpenAI({
    modelName:   process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0,
    maxTokens:   50,
  });

  const prompt = `你是内容安全审核员。请评估以下旅游知识片段是否适合在旅游助手中展示。
评分标准（0-10）：
- 10分：纯旅游实用信息（景点、交通、美食、住宿），完全安全
- 5-9分：包含历史背景但无政治倾向，基本安全
- 1-4分：包含明显的政治敏感、暴力或违禁内容，不适合展示
- 0分：严重违规内容

只输出一个数字评分，不要任何解释。

内容：
标题：${chunk.title}
正文：${(chunk.content || '').slice(0, 300)}`;

  try {
    const response = await model.invoke(prompt);
    const score = parseInt((response.content || '').trim(), 10);
    if (!isNaN(score) && score <= 3) {
      return { keep: false, reason: `LLM评分过低: ${score}/10` };
    }
  } catch (err) {
    console.warn(`[LLM过滤] 调用失败，跳过: ${err.message}`);
  }

  return { keep: true, reason: null };
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const raw   = fs.readFileSync(inputPath, 'utf8').trim().split('\n').filter(Boolean);
  const total = raw.length;
  console.log(`\n输入文件: ${inputPath}`);
  console.log(`总片段数: ${total}`);
  console.log(`LLM过滤: ${useLLM ? '开启' : '关闭（仅静态规则）'}`);
  console.log(`试运行: ${isDryRun ? '是' : '否'}\n`);

  const kept     = [];
  const rejected = [];

  for (let i = 0; i < raw.length; i++) {
    let chunk;
    try {
      chunk = JSON.parse(raw[i]);
    } catch {
      console.warn(`第 ${i + 1} 行 JSON 解析失败，跳过`);
      continue;
    }

    // 第一轮：静态规则
    let result = staticFilter(chunk);

    // 第二轮：LLM（仅对通过静态规则且开启了 --llm 的）
    if (result.keep && useLLM) {
      result = await llmFilter(chunk);
    }

    if (result.keep) {
      // 清洗 content 中残留的 MediaWiki CSS 规则
      if (chunk.content) chunk.content = cleanContent(chunk.content);
      kept.push(chunk);
    } else {
      rejected.push({ ...chunk, _filterReason: result.reason });
      if (isDryRun) {
        console.log(`[过滤] ${chunk.city} | ${chunk.title}`);
        console.log(`  原因: ${result.reason}`);
        console.log(`  内容: ${(chunk.content || '').slice(0, 100)}...\n`);
      }
    }
  }

  console.log(`─────────────────────────────────────────`);
  console.log(`保留: ${kept.length} 条`);
  console.log(`过滤: ${rejected.length} 条`);
  console.log(`过滤率: ${((rejected.length / total) * 100).toFixed(1)}%`);

  if (!isDryRun) {
    fs.writeFileSync(outputPath, kept.map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf8');
    console.log(`\n✓ 已写入: ${outputPath}`);

    if (logRejected && rejected.length > 0) {
      fs.writeFileSync(rejectPath, rejected.map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf8');
      console.log(`✓ 过滤记录: ${rejectPath}`);
    }
  } else {
    console.log('\n[试运行] 未写入文件。');
  }
}

main().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});

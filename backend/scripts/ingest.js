'use strict';

/**
 * RAG 向量入库脚本
 * 将 knowledge_*_filtered.jsonl 的每条 chunk 向量化后写入 Supabase travel_knowledge 表
 *
 * 用法：
 *   node ingest.js [--file <path_to_filtered.jsonl>] [--batch 25] [--dry-run]
 *
 * 环境变量（优先级：命令行参数 > .env）：
 *   SUPABASE_URL            Supabase 项目 URL
 *   SUPABASE_SERVICE_ROLE_KEY  Service Role Key（写权限）
 *   QWEN_EMBEDDING_API_KEY  通义千问 DashScope API Key
 *   QWEN_EMBEDDING_MODEL    默认 text-embedding-v3
 *   QWEN_EMBEDDING_DIM      默认 1024
 */

process.stdout.setDefaultEncoding('utf8');
process.stderr.setDefaultEncoding('utf8');

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const crypto  = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ─── CLI 参数解析 ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const isDryRun  = args.includes('--dry-run');
const batchSize = parseInt(getArg('--batch', '25'), 10);  // Qwen 单次最多 25 条

const defaultJsonl = path.resolve(
  __dirname,
  '../data/knowledge/knowledge_20260306_004228_filtered.jsonl',
);
const jsonlFile = getArg('--file', defaultJsonl);

// ─── 配置校验 ─────────────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL || '';
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EMBED_API_KEY     = process.env.QWEN_EMBEDDING_API_KEY || '';
const EMBED_MODEL       = process.env.QWEN_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-8B';
const EMBED_DIM         = parseInt(process.env.QWEN_EMBEDDING_DIM || '1024', 10);
const EMBED_BASE_URL    = process.env.QWEN_EMBEDDING_BASE_URL || 'https://api-inference.modelscope.cn/v1';

if (!isDryRun) {
  if (!SUPABASE_URL)  { console.error('缺少环境变量: SUPABASE_URL');              process.exit(1); }
  if (!SUPABASE_KEY)  { console.error('缺少环境变量: SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  if (!EMBED_API_KEY) { console.error('缺少环境变量: QWEN_EMBEDDING_API_KEY');    process.exit(1); }
}

// ─── Supabase 客户端（轻量 REST，无需 SDK） ───────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const supabase = isDryRun ? null : createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 调用 Qwen Embedding API（OpenAI 兼容接口）
 * @param {string[]} texts  最多 25 条
 * @returns {number[][]}    每条文本对应的向量
 */
async function embedBatch(texts) {
  const body = JSON.stringify({
    model: EMBED_MODEL,
    input: texts,
    // Qwen3-Embedding 支持 Matryoshka 截断，通过 dimensions 参数控制输出维度
    // 若 API 不支持该参数（会报错），可注释掉此行并将 SQL/ragService 改为 4096
    dimensions: EMBED_DIM,
    encoding_format: 'float',
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${EMBED_BASE_URL}/embeddings`);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${EMBED_API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (json.error) {
              reject(new Error(`Embedding API error: ${JSON.stringify(json.error)}`));
              return;
            }
            // 按 index 排序后取 embedding
            const sorted = (json.data || []).sort((a, b) => a.index - b.index);
            resolve(sorted.map(d => d.embedding));
          } catch (e) {
            reject(new Error(`Invalid JSON from Embedding API: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 批量 upsert 到 Supabase
 * 使用 content_hash 唯一索引做幂等写入（已存在则跳过）
 */
async function upsertBatch(rows) {
  const { error } = await supabase
    .from('travel_knowledge')
    .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true });
  if (error) throw new Error(`Supabase upsert error: ${JSON.stringify(error)}`);
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== RAG 向量入库脚本 ===');
  console.log(`输入文件: ${jsonlFile}`);
  console.log(`Embedding 模型: ${EMBED_MODEL}（维度 ${EMBED_DIM}）`);
  console.log(`批次大小: ${batchSize}`);
  console.log(`试运行: ${isDryRun ? '是（不调用 API，不写库）' : '否'}`);
  console.log('');

  if (!fs.existsSync(jsonlFile)) {
    console.error(`文件不存在: ${jsonlFile}`);
    process.exit(1);
  }

  // 读取所有 chunk
  const lines = fs.readFileSync(jsonlFile, 'utf8').split('\n').filter(Boolean);
  const chunks = lines.map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { console.warn(`第 ${i + 1} 行解析失败，跳过`); return null; }
  }).filter(Boolean);

  console.log(`总片段数: ${chunks.length}`);

  if (isDryRun) {
    // 干运行：只显示前 3 条样本
    console.log('\n[试运行] 前 3 条片段样本：');
    chunks.slice(0, 3).forEach((c, i) => {
      console.log(`  ${i + 1}. [${c.city}] ${c.title} — ${(c.content || '').slice(0, 80)}...`);
    });
    console.log('\n[试运行] 完成，未调用 API 和写库。');
    return;
  }

  // 分批处理
  let written = 0;
  let skipped = 0;
  let errors  = 0;
  const totalBatches = Math.ceil(chunks.length / batchSize);

  for (let bi = 0; bi < totalBatches; bi++) {
    const batch = chunks.slice(bi * batchSize, (bi + 1) * batchSize);
    const texts = batch.map(c => c.content || '');

    process.stdout.write(`批次 ${bi + 1}/${totalBatches}（${batch.length} 条）... `);

    try {
      const embeddings = await embedBatch(texts);

      const rows = batch.map((c, i) => ({
        city:          c.city         || '',
        type:          c.type         || 'guide',
        title:         c.title        || '',
        section_title: c.sectionTitle || null,
        content:       c.content      || '',
        tags:          Array.isArray(c.tags) ? c.tags : [],
        source:        c.source       || 'wikivoyage',
        source_url:    c.sourceUrl    || null,
        lang:          c.lang         || 'zh',
        content_hash:  md5(c.content  || ''),
        embedding:     embeddings[i],
      }));

      await upsertBatch(rows);
      written += batch.length;
      console.log(`✓ 写入 ${batch.length} 条`);
    } catch (err) {
      errors += batch.length;
      console.log(`✗ 失败: ${err.message}`);
    }

    // 避免触发 API 限流（DashScope 免费层 QPS 限制较低）
    if (bi < totalBatches - 1) await sleep(300);
  }

  console.log('');
  console.log('─────────────────────────────────────────');
  console.log(`写入成功: ${written} 条`);
  console.log(`写入失败: ${errors} 条`);
  console.log(`合计处理: ${written + errors} 条 / ${chunks.length} 条`);
}

main().catch(err => {
  console.error('致命错误:', err);
  process.exit(1);
});

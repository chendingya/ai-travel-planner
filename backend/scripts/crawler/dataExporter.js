/**
 * 数据导出器
 * 将知识片段写入 JSON Lines 文件（每行一条记录），方便后续批量导入 RAG 向量库
 */

const fs = require('fs');
const path = require('path');
const { CRAWL_CONFIG } = require('./config');

/** 确保输出目录存在 */
function ensureOutputDir() {
  // backend/ 为脚本根目录，从 scripts/crawler/ 往上两级
  const baseDir = path.resolve(__dirname, '../../', CRAWL_CONFIG.outputDir);
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

/**
 * 生成带时间戳的文件名
 * 示例：knowledge_20260305_143022.jsonl
 */
function buildFileName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `knowledge_${ts}.jsonl`;
}

/**
 * 保存知识片段列表到 JSONL 文件
 * @param {Array<object>} chunks
 * @returns {string} 输出文件绝对路径
 */
function saveChunks(chunks) {
  const outputDir = ensureOutputDir();
  const filePath = path.join(outputDir, buildFileName());

  const lines = chunks.map((chunk, idx) =>
    JSON.stringify({
      id: `chunk_${String(idx + 1).padStart(5, '0')}`,
      ...chunk,
      createdAt: new Date().toISOString(),
    })
  );

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}

/**
 * 保存爬取统计信息到 summary.json（覆盖写入）
 * @param {object} stats
 */
function saveSummary(stats) {
  const outputDir = ensureOutputDir();
  const summaryPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(stats, null, 2), 'utf-8');
  return summaryPath;
}

module.exports = { saveChunks, saveSummary };

'use strict';

/**
 * RAG 检索服务
 *
 * 职责：
 *   1. 将用户问题向量化（Qwen text-embedding-v3）
 *   2. 在 Supabase travel_knowledge 表做余弦相似度检索
 *   3. 返回格式化的上下文字符串，注入 LLM systemPrompt
 *
 * 使用示例（在 aiChatService 中）：
 *   const context = await ragService.retrieve('西湖附近有什么好吃的', { city: '杭州' });
 *   if (context) systemPrompt += `\n\n${context}`;
 */

const https = require('https');
const http  = require('http');

class RagService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {{apiKey: string, model?: string, dim?: number, baseURL?: string}} embeddingConfig
   */
  constructor(supabase, embeddingConfig = {}, rerankConfig = {}) {
    this.supabase   = supabase;
    this.apiKey     = embeddingConfig.apiKey     || '';
    this.model      = embeddingConfig.model      || 'Qwen/Qwen3-Embedding-8B';
    this.dim        = embeddingConfig.dim        || 1024;
    this.baseURL    = embeddingConfig.baseURL    || 'https://api-inference.modelscope.cn/v1';

    // ─── Rerank 配置 ─────────────────────────────────────────────────────────
    this.rerankEnabled         = !!(rerankConfig.enabled);
    this.rerankBaseURL         = (rerankConfig.baseURL || 'http://localhost:8001').replace(/\/$/, '');
    this.rerankModel           = rerankConfig.model           || 'BAAI/bge-reranker-v2-m3';
    this.rerankCandidateFactor = rerankConfig.candidateFactor || 3; // 向量召回候选倍数

    // 简单内存缓存，避免同一对话在同一会话中重复 embed 相同问题
    this._cache  = new Map();
    this._cacheMaxSize = 200;
  }

  /** 是否已正确配置（apiKey + supabase 均有效） */
  isAvailable() {
    return !!(this.apiKey && this.supabase);
  }

  // ─── Embedding ──────────────────────────────────────────────────────────────

  /**
   * 调用 Qwen Embedding API，获取单条文本的向量
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedText(text) {
    const normalized = (text || '').slice(0, 8000).trim(); // API 单文本上限约 8192 token
    if (!normalized) throw new Error('embedText: 输入文本为空');

    // 命中缓存
    if (this._cache.has(normalized)) return this._cache.get(normalized);

    const body = JSON.stringify({
      model: this.model,
      input: [normalized],
      dimensions: this.dim,
      encoding_format: 'float',
    });

    const embedding = await new Promise((resolve, reject) => {
      const url = new URL(`${this.baseURL}/embeddings`);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
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
                reject(new Error(`Embedding API: ${JSON.stringify(json.error)}`));
                return;
              }
              const vec = json.data?.[0]?.embedding;
              if (!Array.isArray(vec)) {
                reject(new Error(`Embedding API 返回格式异常: ${raw.slice(0, 200)}`));
                return;
              }
              resolve(vec);
            } catch (e) {
              reject(new Error(`Embedding API JSON 解析失败: ${raw.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    // 写入缓存（LRU 简化版：超限时清空）
    if (this._cache.size >= this._cacheMaxSize) this._cache.clear();
    this._cache.set(normalized, embedding);
    return embedding;
  }

  // ─── Rerank ──────────────────────────────────────────────────────────────────

  /**
   * 调用本地 Rerank 服务对候选片段重新打分排序
   *
   * 兼容以下常见本地部署响应格式：
   *   - infinity-emb : { results: [{index, relevance_score}] }
   *   - TEI           : [{index, score}]
   *   - 简单数组       : { scores: [0.9, 0.72, ...] }
   *
   * @param {string} query
   * @param {Array}  chunks  候选片段（来自向量检索）
   * @returns {Promise<Array>}  按 rerank_score 降序排列的片段
   */
  async rerankChunks(query, chunks) {
    if (!chunks || chunks.length === 0) return chunks;

    const documents = chunks.map(c => (c.content || '').slice(0, 1000));
    const body = JSON.stringify({
      query,
      documents,
      model: this.rerankModel,
      return_documents: false,
    });

    try {
      const url   = new URL(`${this.rerankBaseURL}/rerank`);
      const lib   = url.protocol === 'https:' ? https : http;
      const port  = url.port || (url.protocol === 'https:' ? '443' : '80');

      const scoreItems = await new Promise((resolve, reject) => {
        const req = lib.request(
          {
            hostname: url.hostname,
            port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type':   'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          (res) => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => {
              try {
                const json = JSON.parse(raw);
                if (Array.isArray(json)) {
                  // TEI: [{index, score}] 或 [{index, relevance_score}]
                  resolve(json.map(r => ({ index: r.index, score: r.score ?? r.relevance_score ?? 0 })));
                } else if (Array.isArray(json.results)) {
                  // infinity-emb: {results: [{index, relevance_score}]}
                  resolve(json.results.map(r => ({ index: r.index, score: r.relevance_score ?? r.score ?? 0 })));
                } else if (Array.isArray(json.scores)) {
                  // 简单格式: {scores: [0.9, 0.72]}
                  resolve(json.scores.map((score, index) => ({ index, score })));
                } else {
                  reject(new Error(`Rerank API 未知响应格式: ${raw.slice(0, 200)}`));
                }
              } catch (e) {
                reject(new Error(`Rerank API JSON 解析失败: ${raw.slice(0, 200)}`));
              }
            });
          }
        );
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Rerank API 超时（10s）')); });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      // 按 score 降序重排
      return scoreItems
        .sort((a, b) => b.score - a.score)
        .map(({ index, score }) => ({ ...chunks[index], rerank_score: score }));

    } catch (err) {
      console.warn('[RagService] Rerank 失败，降级为向量相似度排序:', err.message);
      return chunks; // fallback
    }
  }

  // ─── 检索 ────────────────────────────────────────────────────────────────────

  /**
   * 根据用户问题检索相关知识片段
   *
   * 若 rerank 已启用，将多召回 candidateFactor 倍的候选，经 Rerank 精排后返回 topK 条。
   *
   * @param {string} query            用户问题
   * @param {object} opts
   * @param {string}  [opts.city]     限定城市（可选）
   * @param {string}  [opts.type]     限定类型：guide/attraction/transport/food/... （可选）
   * @param {number}  [opts.topK=5]   最终返回片段数
   * @param {number}  [opts.threshold=0.3] 最低相似度（0~1）
   * @returns {Promise<Array>}        片段列表
   */
  async retrieve(query, opts = {}) {
    if (!this.isAvailable()) return [];

    const { city, type, topK = 5, threshold = 0.3 } = opts;

    // Rerank 启用时多取候选，最多 20 条避免过多 token 消耗
    const fetchCount = this.rerankEnabled
      ? Math.min(topK * this.rerankCandidateFactor, 20)
      : topK;

    let embedding;
    try {
      embedding = await this.embedText(query);
    } catch (err) {
      console.error('[RagService] embed error:', err.message);
      return [];
    }

    const { data, error } = await this.supabase.rpc('match_travel_knowledge', {
      query_embedding:     embedding,
      match_count:         fetchCount,
      filter_city:         city   || null,
      filter_type:         type   || null,
      similarity_threshold: threshold,
    });

    if (error) {
      console.error('[RagService] Supabase RPC error:', error.message);
      return [];
    }

    let chunks = data || [];

    if (this.rerankEnabled && chunks.length > 1) {
      chunks = await this.rerankChunks(query, chunks);
    }

    return chunks.slice(0, topK);
  }

  // ─── 格式化上下文 ────────────────────────────────────────────────────────────

  /**
   * 将检索到的片段格式化为注入 systemPrompt 的字符串
   *
   * 格式示例：
   *   === 参考资料（来自旅游知识库）===
   *   [1] 杭州 · 景点 · 西湖 (相似度 0.82)
   *   西湖景区门票免费，可步行游览白堤、苏堤...
   *
   * @param {Array}  chunks
   * @param {number} [maxCharsPerChunk=400] 每条最大字符数（控制总 token 量）
   * @returns {string}
   */
  buildContext(chunks, maxCharsPerChunk = 400) {
    if (!chunks || chunks.length === 0) return '';

    const lines = ['=== 参考资料（来自旅游知识库）==='];
    chunks.forEach((c, i) => {
      // 优先展示 rerank 分数，其次向量相似度
      let scoreStr = '';
      if (typeof c.rerank_score === 'number') {
        scoreStr = ` (rerank ${c.rerank_score.toFixed(3)})`;
      } else if (typeof c.similarity === 'number') {
        scoreStr = ` (相似度 ${c.similarity.toFixed(2)})`;
      }
      const label = [c.city, c.type, c.title].filter(Boolean).join(' · ');
      const body  = (c.content || '').slice(0, maxCharsPerChunk);
      lines.push(`[${i + 1}] ${label}${scoreStr}`);
      lines.push(body);
      lines.push('');
    });
    lines.push('请优先基于以上参考资料回答，如参考资料不足，可结合你的知识补充。');

    return lines.join('\n');
  }

  /**
   * 一步完成：检索 + 格式化，直接返回可注入 systemPrompt 的字符串
   *
   * @param {string} query
   * @param {object} opts  同 retrieve() 的 opts
   * @returns {Promise<string>}  空字符串表示未检索到相关内容或服务不可用
   */
  async retrieveContext(query, opts = {}) {
    const chunks = await this.retrieve(query, opts);
    return this.buildContext(chunks);
  }
}

module.exports = RagService;

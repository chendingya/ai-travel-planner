'use strict';

const https = require('https');
const http  = require('http');

const TYPE_KEYWORDS = {
  food: ['美食', '吃', '餐厅', '小吃', '饮食', '饭店', '馆子', '早餐', '夜宵', '咖啡'],
  attraction: ['景点', '观光', '景区', '打卡', '去哪玩', '游览', '景观', '门票', '寺', '博物馆'],
  transport: ['交通', '怎么去', '路线', '公交', '地铁', '高铁', '火车', '机场', '车站', '打车'],
  shopping: ['购物', '买东西', '商场', '步行街', '商贸', '特产', '伴手礼'],
  activity: ['活动', '演出', '步行', '徒步', '夜游', '展览', '节庆'],
  guide: ['攻略', '推荐', '介绍', '怎么玩', '行程', '安排', '几天', '适合'],
  notice: ['注意', '提醒', '安全', '避坑', '风险', '禁忌', '警示'],
};

const WORD_RE = /[A-Za-z0-9]+|[\u4e00-\u9fff]+/g;

function normalizeText(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function tokenizeText(text) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return [];

  const tokens = [];
  const parts = normalized.match(WORD_RE) || [];
  for (const part of parts) {
    if (/^[\u4e00-\u9fff]+$/.test(part)) {
      if (part.length === 1) {
        tokens.push(part);
        continue;
      }
      for (let index = 0; index < part.length; index += 1) {
        tokens.push(part[index]);
      }
      for (let index = 0; index < part.length - 1; index += 1) {
        tokens.push(part.slice(index, index + 2));
      }
      continue;
    }
    tokens.push(part);
  }
  return tokens;
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function buildDocId(row) {
  const externalId = normalizeText(row?.external_id || row?.externalId);
  if (externalId) return externalId;
  const city = normalizeText(row?.city);
  const type = normalizeText(row?.type);
  const title = normalizeText(row?.title);
  const content = normalizeText(row?.content).slice(0, 120);
  return [city, type, title, content].filter(Boolean).join('||') || `doc-${Math.random().toString(36).slice(2, 10)}`;
}

function buildRerankDocument(row) {
  return [
    normalizeText(row?.city),
    normalizeText(row?.type),
    normalizeText(row?.title),
    normalizeText(row?.section_title || row?.sectionTitle),
    normalizeText(row?.sub_section_title || row?.subSectionTitle),
    normalizeText(row?.poi_name || row?.poiName),
    normalizeText(row?.content),
  ].filter(Boolean).join('\n');
}

function describeIntent(intent) {
  return `city=${intent.city || '-'}, type=${intent.type || '-'}, poi=${intent.poi || '-'}`;
}

class RagService {
  constructor(supabase, embeddingConfig = {}, rerankConfig = {}) {
    this.supabase = supabase;
    this._cache = new Map();
    this._cacheMaxSize = 200;
    this._intentCatalog = null;
    this.reloadConfig(embeddingConfig, rerankConfig);
  }

  reloadConfig(embeddingConfig = {}, rerankConfig = {}) {
    this.embeddingProvider = embeddingConfig.provider || '';
    this.apiKey = embeddingConfig.apiKey || '';
    this.model = embeddingConfig.model || 'Qwen/Qwen3-Embedding-8B';
    this.dim = embeddingConfig.dim || 1024;
    this.baseURL = embeddingConfig.baseURL || 'https://api-inference.modelscope.cn/v1';
    this.kbSlug = embeddingConfig.kbSlug || 'travel-cn-public';
    this.datasetVersion = embeddingConfig.datasetVersion || '';
    this.embeddingEnabled = embeddingConfig.enabled !== false;
    this.defaultTopK = embeddingConfig.topK || 5;
    this.defaultDenseTopK = embeddingConfig.denseTopK || Math.max(this.defaultTopK * 3, 15);
    this.defaultSparseTopK = embeddingConfig.sparseTopK || Math.max(this.defaultTopK * 3, 15);
    this.defaultRrfTopK = embeddingConfig.rrfTopK || Math.max(this.defaultTopK * 6, 30);
    this.defaultRrfK = embeddingConfig.rrfK || 60;
    this.defaultThreshold = embeddingConfig.threshold || 0.35;
    this.defaultSparseThreshold = embeddingConfig.sparseThreshold || 0.05;
    this.intentCatalogPageSize = embeddingConfig.intentCatalogPageSize || 1000;
    this.intentCatalogTtlMs = embeddingConfig.intentCatalogTtlMs || 10 * 60 * 1000;

    this.rerankProvider = rerankConfig.provider || '';
    this.rerankEnabled = !!rerankConfig.enabled;
    this.rerankBaseURL = (rerankConfig.baseURL || 'http://localhost:8001').replace(/\/$/, '');
    this.rerankPath = rerankConfig.path || '/rerank';
    this.rerankModel = rerankConfig.model || 'BAAI/bge-reranker-v2-m3';
    this.rerankApiKey = rerankConfig.apiKey || '';
    this.rerankCandidateFactor = rerankConfig.candidateFactor || 3;
    this.rerankTimeoutMs = rerankConfig.timeoutMs || 10000;

    this._cache.clear();
    this._intentCatalog = null;
    return this.getStatus();
  }

  getStatus() {
    return {
      enabled: this.isAvailable(),
      embeddingProvider: this.embeddingProvider || '',
      embeddingModel: this.model || '',
      dim: this.dim,
      rerankEnabled: !!this.rerankEnabled,
      rerankProvider: this.rerankProvider || '',
      rerankModel: this.rerankModel || '',
      denseTopK: this.defaultDenseTopK,
      sparseTopK: this.defaultSparseTopK,
      rrfTopK: this.defaultRrfTopK,
    };
  }

  isAvailable() {
    return !!(this.embeddingEnabled && this.apiKey && this.supabase);
  }

  async embedText(text) {
    const normalized = (text || '').slice(0, 8000).trim();
    if (!normalized) throw new Error('embedText: 输入文本为空');

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
          port: url.port || (url.protocol === 'https:' ? '443' : '80'),
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

    if (this._cache.size >= this._cacheMaxSize) this._cache.clear();
    this._cache.set(normalized, embedding);
    return embedding;
  }

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
      const url = new URL(`${this.rerankBaseURL}${this.rerankPath.startsWith('/') ? this.rerankPath : `/${this.rerankPath}`}`);
      const lib = url.protocol === 'https:' ? https : http;
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');

      const scoreItems = await new Promise((resolve, reject) => {
        const req = lib.request(
          {
            hostname: url.hostname,
            port,
            path: `${url.pathname}${url.search || ''}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.rerankApiKey ? { Authorization: `Bearer ${this.rerankApiKey}` } : {}),
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
                  resolve(json.map(r => ({ index: r.index, score: r.score ?? r.relevance_score ?? 0 })));
                } else if (Array.isArray(json.results)) {
                  resolve(json.results.map(r => ({ index: r.index, score: r.relevance_score ?? r.score ?? 0 })));
                } else if (Array.isArray(json.scores)) {
                  resolve(json.scores.map((score, index) => ({ index, score })));
                } else if (Array.isArray(json.data)) {
                  resolve(json.data.map((item, index) => ({ index: item.index ?? index, score: item.score ?? item.relevance_score ?? 0 })));
                } else {
                  reject(new Error(`Rerank API 未知响应格式: ${raw.slice(0, 200)}`));
                }
              } catch (e) {
                reject(new Error(`Rerank API JSON 解析失败: ${raw.slice(0, 200)}`));
              }
            });
          }
        );
        req.setTimeout(this.rerankTimeoutMs, () => {
          req.destroy();
          reject(new Error(`Rerank API 超时（${this.rerankTimeoutMs}ms）`));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      return scoreItems
        .sort((a, b) => b.score - a.score)
        .map(({ index, score }) => ({ ...chunks[index], rerank_score: score }));

    } catch (err) {
      console.warn('[RagService] Rerank 失败，降级为 RRF 排序:', err.message);
      return chunks;
    }
  }

  async ensureIntentCatalogLoaded() {
    const now = Date.now();
    if (this._intentCatalog && now - this._intentCatalog.at < this.intentCatalogTtlMs) {
      return this._intentCatalog;
    }

    const cityNames = new Set();
    const poiNames = new Set();
    let from = 0;

    while (true) {
      let query = this.supabase
        .from('travel_knowledge')
        .select('city, poi_name')
        .eq('kb_slug', this.kbSlug)
        .range(from, from + this.intentCatalogPageSize - 1);

      if (this.datasetVersion) {
        query = query.eq('dataset_version', this.datasetVersion);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`加载意图词典失败: ${error.message || error}`);
      }

      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const city = normalizeText(row?.city);
        const poi = normalizeText(row?.poi_name);
        if (city) cityNames.add(city);
        if (poi.length >= 2) poiNames.add(poi);
      }

      if (rows.length < this.intentCatalogPageSize) break;
      from += this.intentCatalogPageSize;
    }

    this._intentCatalog = {
      at: now,
      cityNames: [...cityNames].sort((a, b) => b.length - a.length),
      poiNames: [...poiNames].sort((a, b) => b.length - a.length),
    };

    return this._intentCatalog;
  }

  inferQueryType(queryText) {
    const query = normalizeText(queryText);
    let bestType = null;
    let bestHits = 0;
    for (const [typeName, keywords] of Object.entries(TYPE_KEYWORDS)) {
      const hits = keywords.reduce((count, keyword) => count + (query.includes(keyword) ? 1 : 0), 0);
      if (hits > bestHits) {
        bestType = typeName;
        bestHits = hits;
      }
    }
    return bestType;
  }

  inferQueryCity(queryText, cityNames) {
    const query = normalizeText(queryText);
    return cityNames.find(city => city && query.includes(city)) || null;
  }

  inferQueryPoi(queryText, poiNames) {
    const query = normalizeText(queryText);
    return poiNames.find(name => name && query.includes(name)) || null;
  }

  async parseQueryIntent(queryText, opts = {}) {
    const overrideCity = normalizeText(opts.city);
    const overrideType = normalizeText(opts.type);
    if (overrideCity && overrideType) {
      return { city: overrideCity, type: overrideType, poi: null };
    }

    const catalog = await this.ensureIntentCatalogLoaded().catch(() => ({ cityNames: [], poiNames: [] }));
    const city = overrideCity || this.inferQueryCity(queryText, catalog.cityNames || []);
    const type = overrideType || this.inferQueryType(queryText);
    const poi = this.inferQueryPoi(queryText, catalog.poiNames || []);
    return { city: city || null, type: type || null, poi: poi || null };
  }

  candidateScopes(intent) {
    const city = intent.city || null;
    const typeName = intent.type || null;
    const scopedType = typeName === 'guide' ? null : typeName;
    const scopes = [];
    if (city && scopedType) scopes.push({ scopeName: 'city+type', city, type: scopedType });
    if (city) scopes.push({ scopeName: 'city', city, type: null });
    if (scopedType) scopes.push({ scopeName: 'type', city: null, type: scopedType });
    scopes.push({ scopeName: 'global', city: null, type: null });
    return scopes;
  }

  async sparseRetrieve(queryText, city, typeName, opts = {}) {
    try {
      const matchCount = opts.sparseTopK || this.defaultSparseTopK;
      const sparseThreshold = opts.sparseThreshold ?? this.defaultSparseThreshold;
      const queryTerms = uniq(tokenizeText(queryText));
      const payload = {
        query_text: queryText,
        query_terms: queryTerms,
        match_count: matchCount,
        filter_kb_slug: this.kbSlug,
        filter_city: city || null,
        filter_type: typeName || null,
        filter_dataset_version: this.datasetVersion || null,
        sparse_threshold: sparseThreshold,
      };
      const { data, error } = await this.supabase.rpc('match_travel_knowledge_sparse', payload);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((row) => ({
        ...row,
        doc_id: buildDocId(row),
        sparse_score: Number(row?.sparse_score || 0),
      }));
    } catch (error) {
      console.warn('[RagService] sparse retrieve failed:', error?.message || error);
      return [];
    }
  }

  async denseRetrieve(queryText, city, typeName, opts = {}) {
    try {
      const vector = await this.embedText(queryText);
      const payload = {
        query_embedding: vector,
        match_count: opts.denseTopK || this.defaultDenseTopK,
        filter_kb_slug: this.kbSlug,
        filter_city: city || null,
        filter_type: typeName || null,
        filter_dataset_version: this.datasetVersion || null,
        similarity_threshold: opts.threshold ?? this.defaultThreshold,
      };
      const { data, error } = await this.supabase.rpc('match_travel_knowledge', payload);
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((row) => ({
        ...row,
        doc_id: buildDocId(row),
        sparse_score: Number(row?.sparse_score || 0),
      }));
    } catch (error) {
      console.warn('[RagService] dense retrieve failed:', error?.message || error);
      return [];
    }
  }

  rrfFuse(sparseRows, denseRows, topK, rrfK) {
    const scores = new Map();
    const merged = new Map();
    const addRows = (rows, sourceName) => {
      rows.forEach((row, index) => {
        const rank = index + 1;
        const docId = buildDocId(row);
        scores.set(docId, (scores.get(docId) || 0) + (1 / (rrfK + rank)));
        if (!merged.has(docId)) {
          merged.set(docId, { ...row, doc_id: docId, sources: [sourceName] });
          return;
        }
        const current = merged.get(docId);
        const nextSources = uniq([...(current.sources || []), sourceName]);
        merged.set(docId, {
          ...current,
          ...Object.fromEntries(
            Object.entries(row).filter(([, value]) => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length))
          ),
          sources: nextSources,
        });
      });
    };

    addRows(sparseRows, 'sparse');
    addRows(denseRows, 'dense');

    return [...merged.values()]
      .map((row) => ({ ...row, rrf_score: scores.get(row.doc_id) || 0 }))
      .sort((a, b) => b.rrf_score - a.rrf_score)
      .slice(0, topK);
  }

  async search(query, opts = {}) {
    if (!this.isAvailable()) {
      return {
        query,
        intent: { city: null, type: null, poi: null },
        scopeName: 'disabled',
        filterCity: null,
        filterType: null,
        sparseRows: [],
        denseRows: [],
        fusedRows: [],
        finalRows: [],
      };
    }

    const queryText = normalizeText(query);
    if (!queryText) {
      return {
        query,
        intent: { city: null, type: null, poi: null },
        scopeName: 'empty',
        filterCity: null,
        filterType: null,
        sparseRows: [],
        denseRows: [],
        fusedRows: [],
        finalRows: [],
      };
    }

    const intent = await this.parseQueryIntent(queryText, opts);
    const topK = opts.topK || this.defaultTopK;
    const scopes = this.candidateScopes(intent);

    let scopeName = 'global';
    let filterCity = null;
    let filterType = null;
    let sparseRows = [];
    let denseRows = [];

    for (const scope of scopes) {
      const [nextSparse, nextDense] = await Promise.all([
        this.sparseRetrieve(queryText, scope.city, scope.type, opts),
        this.denseRetrieve(queryText, scope.city, scope.type, opts),
      ]);
      if (nextSparse.length || nextDense.length) {
        scopeName = scope.scopeName;
        filterCity = scope.city;
        filterType = scope.type;
        sparseRows = nextSparse;
        denseRows = nextDense;
        break;
      }
    }

    let fusedRows = this.rrfFuse(
      sparseRows,
      denseRows,
      opts.rrfTopK || this.defaultRrfTopK,
      opts.rrfK || this.defaultRrfK
    );

    if (this.rerankEnabled && fusedRows.length > 1) {
      const rerankCandidates = fusedRows.slice(0, Math.min(fusedRows.length, Math.max(topK * this.rerankCandidateFactor, topK)));
      const reranked = await this.rerankChunks(queryText, rerankCandidates);
      const rerankScores = new Map(reranked.map((row) => [row.doc_id, row.rerank_score]));
      fusedRows = fusedRows
        .map((row) => ({ ...row, rerank_score: rerankScores.get(row.doc_id) }))
        .sort((a, b) => {
          const left = typeof a.rerank_score === 'number' ? a.rerank_score : a.rrf_score || 0;
          const right = typeof b.rerank_score === 'number' ? b.rerank_score : b.rrf_score || 0;
          return right - left;
        });
    }

    return {
      query: queryText,
      intent,
      scopeName,
      filterCity,
      filterType,
      sparseRows,
      denseRows,
      fusedRows,
      finalRows: fusedRows.slice(0, topK),
    };
  }

  async retrieve(query, opts = {}) {
    const result = await this.search(query, opts);
    return result.finalRows;
  }

  buildContext(chunks, maxCharsPerChunk = 400) {
    if (!chunks || chunks.length === 0) return '';

    const lines = ['=== 参考资料（来自旅游知识库）==='];
    chunks.forEach((c, i) => {
      let scoreStr = '';
      if (typeof c.rerank_score === 'number') {
        scoreStr = ` (rerank ${c.rerank_score.toFixed(3)})`;
      } else if (typeof c.rrf_score === 'number') {
        scoreStr = ` (RRF ${c.rrf_score.toFixed(3)})`;
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

  async retrieveContext(query, opts = {}) {
    const result = await this.search(query, opts);
    return this.buildContext(result.finalRows);
  }

  buildSearchSummary(result, opts = {}) {
    const finalRows = Array.isArray(result?.finalRows) ? result.finalRows : [];
    const previewChars = Number(opts.previewChars) > 0 ? Number(opts.previewChars) : 220;
    const includeContent = opts.includeContent !== false;

    if (!finalRows.length) {
      return {
        text: [
          '未检索到相关旅游知识。',
          `检索意图: ${describeIntent(result?.intent || {})}`,
          `检索范围: ${result?.scopeName || 'global'}`,
        ].join('\n'),
        items: [],
      };
    }

    const lines = [
      `检索意图: ${describeIntent(result.intent || {})}`,
      `命中范围: ${result.scopeName || 'global'} (city=${result.filterCity || '-'}, type=${result.filterType || '-'})`,
      `Sparse=${result.sparseRows?.length || 0}, Dense=${result.denseRows?.length || 0}, Final=${finalRows.length}`,
      '',
    ];

    finalRows.forEach((row, index) => {
      const score = typeof row.rerank_score === 'number'
        ? `rerank=${row.rerank_score.toFixed(4)}`
        : typeof row.rrf_score === 'number'
          ? `rrf=${row.rrf_score.toFixed(4)}`
          : typeof row.similarity === 'number'
            ? `dense=${row.similarity.toFixed(4)}`
            : 'score=n/a';
      const meta = [normalizeText(row.city), normalizeText(row.type), normalizeText(row.title)].filter(Boolean).join(' | ');
      const sourceText = Array.isArray(row.sources) && row.sources.length ? ` | src=${row.sources.join(',')}` : '';
      lines.push(`${index + 1}. ${meta} | ${score}${sourceText}`);
      if (includeContent) {
        lines.push(normalizeText(row.content).slice(0, previewChars));
      }
      lines.push('');
    });

    return {
      text: lines.join('\n').trim(),
      items: finalRows,
    };
  }
}

module.exports = RagService;

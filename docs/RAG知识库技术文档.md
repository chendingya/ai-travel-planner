# RAG 知识库技术文档

> 本文档描述「拾光绘旅」AI 旅行规划项目中 RAG（Retrieval-Augmented Generation）知识库的完整技术实现，涵盖数据采集、分块、过滤、向量化、检索、上下文注入各环节，并附面试常见问题解答。

---

## 目录

1. [整体架构](#1-整体架构)
2. [数据采集与预处理](#2-数据采集与预处理)
3. [分块（Chunking）策略](#3-分块chunking策略)
4. [内容过滤流水线](#4-内容过滤流水线)
5. [向量化（Embedding）](#5-向量化embedding)
6. [向量数据库设计](#6-向量数据库设计)
7. [检索层实现](#7-检索层实现)
8. [上下文注入与提示词工程](#8-上下文注入与提示词工程)
9. [Rerank：现状与改进规划](#9-rerank现状与改进规划)
10. [面试常见问题解答](#10-面试常见问题解答)

---

## 1. 整体架构

```
原始网页（Wikivoyage）
       ↓
  [爬虫层] Node.js + Axios + Cheerio
  wikivoyageCrawler.js / enWikivoyageCrawler.js
       ↓
  [解析层] contentParser.js
  HTML → 三级粒度结构化 Chunk（JSONL）
       ↓
  [过滤层] filter.js
  政治敏感 / LLM 审核词 / MediaWiki CSS 清洗
       ↓
  knowledge_*_filtered.jsonl（5585 条）
       ↓
  [入库层] ingest.js
  Qwen3-Embedding-8B（ModelScope）→ 1024 维向量
       ↓
  [向量库] Supabase PostgreSQL + pgvector
  travel_knowledge 表（IVFFlat 索引，余弦距离）
       ↓
  [检索层] ragService.js（线上当前）
  embed(用户问题) → match_travel_knowledge RPC → Top-K 片段
       ↓
  [评测层] test_rag_local_qwen.py（本地测试）
  query 解析 → city/type 级联过滤 → BM25 → Dense → RRF → Qwen3-Reranker-4B
       ↓
  [生成层] aiChatService.js
  片段注入 systemPrompt → LLM（DeepSeek / Qwen 等）
       ↓
  最终回答
```

**关键数字：**

| 指标 | 值 |
|------|-----|
| 覆盖城市 | ~1000 个（动态发现） |
| 原始 chunk 数 | 5597 条 |
| 过滤后 chunk 数 | 5585 条 |
| Embedding 模型 | Qwen3-Embedding-8B |
| 向量维度 | 1024（Matryoshka 截断） |
| 检索算法 | IVFFlat 近似近邻（余弦距离） |
| 默认召回 Top-K | 5 |
| 相似度阈值 | 0.35 |

---

## 2. 数据采集与预处理

### 2.1 数据来源

- **主来源**：中文 Wikivoyage（`zh.wikivoyage.org`），调用 MediaWiki `parse` API 获取渲染后的 HTML
- **补充来源**：英文 Wikivoyage（`en.wikivoyage.org`），作为中文页面内容不足（< 5 chunks）时的 fallback
- **协议**：CC-BY-SA 3.0，可免费商用，需署名

### 2.2 城市列表动态发现

不依赖静态预设城市表，通过以下策略动态发现：
1. 初始种子城市约 60 个（华北/华东/华南/西南等主要旅游城市）
2. 调用 Wikivoyage Category API 自动发现更多中文城市页面
3. 通过 `EXCLUDE_PATTERNS` 排除子区域页（`上海/浦东`、`北京/朝阳区` 等带斜杠的路径）
4. 城市列表缓存于 `city_list_cache.json`，`--refresh-cities` 参数强制刷新

本次实际爬取：**约 1002 个城市页面** → 过滤子区域后有效城市约 800+。

### 2.3 HTML 清洗

Wikivoyage 返回的是 MediaWiki 渲染后的 HTML，包含大量噪声：

| 噪声类型 | 处理方式 |
|---------|---------|
| 编辑按钮（`.mw-editsection`） | Cheerio `remove()` |
| 引用标注（`[1][2]`） | 正则 `/\[\d+\]/g` |
| 图片/图例（`figure, .thumb`） | Cheerio `remove()` |
| MediaWiki 内联 CSS 规则块 | 正则 `/\.[\w-]+\s*\{[^}]{0,400}\}/g` |
| `[dead link]` 注释 | 正则清除 |
| 连续空白 | `/\s+/g → ' '` |

> **踩坑记录**：Wikivoyage 英文页面的某些模板（如 `article-status`、`listing-directions`）会把 CSS 规则直接写入 `<div>` 文本节点而非 `<style>` 标签，导致 `$.root().text()` 提取出 `.mw-parser-output .listing-phone-symbol{text-decoration:none}` 这类字符串。最终在 `htmlToText()` 加正则后置清洗解决。

---

## 3. 分块（Chunking）策略

### 3.1 三级粒度设计

这是本项目 RAG 设计中最核心的决策。同一内容按三个粒度并行切分，覆盖不同类型的用户问题：

```
h2 章节（宽泛问题）
├── h3 子章节（中等精度问题）
│   └── POI Listing 条目（精确问题）
└── POI Listing 条目
```

| 粒度 | 示例 chunk | 适合的用户问题 |
|------|-----------|--------------|
| **h2 章节** | `杭州美食推荐：杭州以龙井虾仁、西湖醋鱼…（全章节）` | "杭州有什么好吃的？" |
| **h3 子章节** | `杭州美食 - 湖滨商圈：湖滨路沿线…` | "西湖边哪里吃饭好？" |
| **POI 条目** | `杭州景点：外婆家餐厅。地址：…。开放时间：…` | "外婆家餐厅在哪，几点开门？" |

三级粒度同时存在于向量库中，检索时根据语义相似度自动选择最合适的粒度，无需人工干预。

### 3.2 分块参数

```javascript
MAX_CHUNK_LENGTH = 800   // 约 500 token，适合大多数 Embedding 模型窗口
CHUNK_OVERLAP    = 120   // 约 75 token 重叠，防止关键信息落在切割边界
```

**分块算法**（按句子边界切割 + 重叠）：

```
输入：长度超过 800 字符的 content
1. 按句子结束符（。！？；\n）分割为 sentences 数组
2. 遍历 sentences，累积到 buffer
3. 当 buffer + sentence > 800 时：
   a. 将当前 buffer 保存为一个 chunk（标题加「续N」后缀）
   b. 取 buffer 末尾 120 字符作为 overlap 前缀
   c. 新 buffer = overlap + sentence
4. 最后的 buffer 保存为最后一个 chunk
```

**为什么按句子切而不是固定字符数切？**
固定字符数切割会在词语中间截断（如把「西湖风景区」切成「西湖风」和「景区」），破坏语义。按句子结束符切割保证每块内容语义完整。

### 3.3 自包含设计

每个 chunk 的 `content` 都包含足够的上下文，脱离其他 chunk 也可独立理解：

```
chunk.content = "{城市}{类型}：{正文}"
例：  "杭州景点介绍：西湖风景名胜区，位于浙江省杭州市…"
```

h3 子章节额外在前缀里带父 h2 标题：

```
chunk.content = "{城市}{h2} - {h3}：{正文}"
例：  "杭州美食 - 湖滨商圈：湖滨路沿线餐厅密集…"
```

这样即使检索结果中只有这一条 chunk，LLM 也能正确理解「这是关于杭州美食湖滨商圈的内容」。

### 3.4 去重

同一城市的 h2 章节文本与其 h3 子章节存在内容重叠。对比每条 chunk 内容前 120 字符的指纹（去空白后小写），过滤掉重复项。

整个 pipeline 约产生 **7000+ 原始 chunk**，去重后为 **5597 条**，过滤后 **5585 条**。

---

## 4. 内容过滤流水线

过滤脚本：`backend/scripts/crawler/filter.js`，在入库前对所有 chunk 做安全清洗。

### 4.1 三层过滤

**第一层：高风险政治词组**

精确匹配，一旦命中无论 chunk 类型立即过滤：

```
/天安门事件/、/六四事件|六四镇压/
/文化大革命.{0,10}(破坏|摧毁|冲击|浩劫)/
/台湾(独立|分裂)/、/西藏(独立|分裂)/、/新疆(独立|分裂)/
/分裂主义/、/法轮功/、/习近平/、/东突/
```

**第二层：历史政治叙述（双重门控）**

要求 **section 标题** + **内容关键词** 同时满足才过滤，避免景点介绍中的历史描写被误杀：

```javascript
// 门控 1：章节标题
HISTORY_SECTION_TITLES = /^(了解|历史|政治|政治体制|历史背景|历史沿革)/

// 门控 2：政权更迭等叙述触发词
/\d{4}年.{0,15}(共产党|国民党|解放军).{0,15}(占领|接管|撤退|解放|控制)/
/红卫兵|造反派/
/日军开始占领租界/
```

**设计难点**：「南京大屠杀」一词在遇难者纪念馆（景点）的介绍中合法出现，但在「南京 - 了解」历史叙述章节中属于政治敏感内容。双重门控正是为解决此类边界问题。

**第三层：LLM 审核敏感词**

```
/购买.*毒品|毒品.*购买/
/红灯区(?!历史|文化)/   ← 使用负向前瞻，保留历史文化语境
/卖淫|嫖娼/、/性交易/
/非法赌博/、/地下赌场/
```

### 4.2 内容清洗（非删除）

对保留的 chunk，对 `content` 字段执行原地清洗：
- 去除 MediaWiki CSS 规则字符串（`.mw-parser-output .xxx{...}`）
- 去除 `[dead link]` 标注
- 合并多余空白

### 4.3 过滤结果

| 类型 | 数量 |
|------|-----|
| 输入 | 5597 条 |
| 过滤（含政治叙述、红灯区） | 12 条（0.2%） |
| 输出 | 5585 条 |

过滤率极低（0.2%），说明 Wikivoyage 作为开放旅游百科整体内容质量较高，敏感内容主要集中在各城市「了解 - 历史」子章节。

---

## 5. 向量化（Embedding）

### 5.1 模型选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 模型 | `Qwen/Qwen3-Embedding-8B` | 中文语义理解最强的开源 Embedding 模型之一 |
| 服务商 | ModelScope API Inference | 支持直接调用无需自建 GPU；对 Qwen 系列优化 |
| 向量维度 | 1024（Matryoshka 截断） | 原生 7168 维；1024 可保留 95%+ 检索性能，存储/计算节省 7× |

**Matryoshka 表示学习（MRL）**：模型训练时对嵌套向量前缀施加多尺度监督，使较短前缀仍保留完整语义，允许调用方传 `dimensions` 参数指定截断长度而无需重新训练。

### 5.2 API 调用（`backend/scripts/ingest.js`）

```javascript
const resp = await fetch('https://api-inference.modelscope.cn/v1/embeddings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`
  },
  body: JSON.stringify({
    model: 'Qwen/Qwen3-Embedding-8B',
    input: batchTexts,          // 最多 25 条
    dimensions: 1024,           // Matryoshka 截断
    encoding_format: 'float'
  })
});
```

### 5.3 批量入库策略

| 参数 | 值 | 说明 |
|------|-----|------|
| `BATCH_SIZE` | 25 | ModelScope API 单批最大输入限制 |
| 批间延迟 | 300ms | 防止触发限速（rate limit） |
| 总批次 | ~224 | 5585 条 ÷ 25 |
| 预计耗时 | ~70s（纯等待） | 不含网络延迟 |

### 5.4 幂等性设计

每条 chunk 在入库前计算 `MD5(content)` 作为 `content_hash`，写入 Supabase 时使用：

```sql
ON CONFLICT (content_hash) DO UPDATE SET
  embedding = EXCLUDED.embedding,
  updated_at = NOW();
```

效果：重复运行 `npm run ingest` 不产生重复数据，且可增量更新（例如爬虫更新内容后重跑）。

### 5.5 Embedding 缓存（retrieval 端）

`ragService.js` 内置查询端缓存：

```javascript
this._cache = new Map();   // key: query text, value: embedding array
MAX_CACHE_SIZE = 200;      // 超出后删除最旧条目（LRU-simple）
```

**设计取舍**：Map 实现简单 O(1) 查找，但无 LRU 优先级。真实生产中应替换为 `lru-cache` 库。缓存存在于单进程内存中，重启失效，适合开发/轻量部署。

---

## 6. 向量数据库设计

### 6.1 表结构（`rag-setup.sql`）

```sql
CREATE TABLE travel_knowledge (
  id           BIGSERIAL PRIMARY KEY,
  city         TEXT NOT NULL,            -- 城市名
  country      TEXT,                     -- 国家
  type         TEXT,                     -- section 类型（eat/sleep/see 等）
  title        TEXT,                     -- chunk 来源标题
  content      TEXT NOT NULL,            -- 原始文本
  content_hash TEXT UNIQUE NOT NULL,     -- MD5，用于幂等 upsert
  source_url   TEXT,                     -- Wikivoyage 页面 URL
  embedding    VECTOR(1024),             -- 嵌入向量
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2 索引选型：IVFFlat vs HNSW

| 指标 | IVFFlat | HNSW |
|------|---------|------|
| 索引构建速度 | 快 | 慢 |
| 构建内存占用 | 低 | 高（需较多内存） |
| 查询精度 | 略低（依赖 lists 设置） | 高 |
| 查询延迟 | 低 | 极低 |
| 支持增量插入 | 需要重建 | 原生支持 |
| pgvector 版本要求 | 较早版本即支持 | 0.5.0+ |

**本项目选择 IVFFlat**，理由：
1. 数据量约 5000–10000 条，体量不大，IVFFlat 在此规模下精度差异可忽略
2. 部署在 Supabase 托管实例，不确定 pgvector 版本，IVFFlat 兼容性更好
3. 开发阶段数据会多次重建（爬虫迭代），IVFFlat 构建更快

```sql
CREATE INDEX ON travel_knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- lists = sqrt(行数) 是经验公式; 本项目 sqrt(5585) ≈ 75，取 100 略保守
```

### 6.3 相似度度量：余弦距离

选择 **cosine distance** 而非内积（dot product）或 L2，因为：
- 余弦相似度对向量 **模长归一化**，使长文短文 chunk 之间可公平比较
- Qwen3-Embedding 官方建议 cosine 或 dot；chunk 文本长度差异较大时 cosine 更稳定

### 6.4 RPC 检索函数

```sql
CREATE OR REPLACE FUNCTION match_travel_knowledge(
  query_embedding    VECTOR(1024),
  match_count        INT DEFAULT 5,
  filter_city        TEXT DEFAULT NULL,
  filter_type        TEXT DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.35
)
RETURNS TABLE (
  id BIGINT, city TEXT, country TEXT, type TEXT,
  title TEXT, content TEXT, source_url TEXT, similarity FLOAT
) AS $$
  SELECT id, city, country, type, title, content, source_url,
         1 - (embedding <=> query_embedding) AS similarity
  FROM travel_knowledge
  WHERE (filter_city IS NULL OR city = filter_city)
    AND (filter_type IS NULL OR type = filter_type)
    AND 1 - (embedding <=> query_embedding) > similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE SQL STABLE;
```

**`<=>` 算子**：pgvector 的余弦距离算子（值越小越相似）；`1 - 距离 = 相似度`。

### 6.5 RLS 权限策略

```sql
-- KBase 公开可读，写入需要 service_role（后端入库 key）
CREATE POLICY "public_read" ON travel_knowledge FOR SELECT USING (TRUE);
CREATE POLICY "service_write" ON travel_knowledge FOR ALL
  USING (auth.role() = 'service_role');
```

---

## 7. 检索层实现

文件：`backend/src/services/ragService.js`

### 7.1 检索流程

**线上当前实现**：

```
用户消息
  │
  ▼
embedText(query)          ← 查缓存命中则跳过 API 调用
  │
  ▼
match_travel_knowledge()  ← Supabase RPC, cosine ANN
  │
  ▼
阈值过滤 (similarity > 0.35)
  │
  ▼
buildContext()            ← 格式化为结构化文本
  │
  ▼
注入 systemPrompt
```

**本地评测脚本流程**（`backend/scripts/test_rag_local_qwen.py`）：

```
用户问题
  │
  ▼
query 解析              ← 抽取 city / type / poi
  │
  ▼
级联过滤                ← city+type → city → type → global
  │
  ├──────────────┐
  ▼              ▼
BM25 稀疏召回      Dense 向量召回
Top-20           Top-20
  │              │
  └──────┬───────┘
         ▼
RRF 融合 Top-30
         │
         ▼
Qwen3-Reranker-4B 精排
         │
         ▼
最终 Top-5
```

说明：

- `ragService.js` 当前生产链路仍以纯向量召回为主
- `test_rag_local_qwen.py` 用于离线评测和调参，验证 hybrid 检索方案在真实数据上的收益
- 之所以先在测试脚本落地，是为了先把召回质量和参数摸清，再决定是否迁移到线上服务

### 7.2 检索参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `topK` | 5 | 最多返回 5 条 chunk |
| `threshold` | 0.35 | 相似度阈值；低于此值视为不相关 |
| `filter_city` | null | 可选：限定城市（精确匹配） |
| `filter_type` | null | 可选：限定章节类型（eat/do/see/sleep/…） |

阈值 0.35 是经验值：
- 过低（如 0.1）会引入太多噪声 chunk，导致 LLM 回答跑偏
- 过高（如 0.6）在跨语言或长尾城市查询时召回率不足
- 0.35 在 Qwen3-Embedding-8B + 中英混合数据集上实测表现稳定

### 7.3 城市 Pre-filter 设计

优先从 AI 对话上下文（`options.city`）提取城市信息，传入 RPC 的 `filter_city`，在向量索引上进行 **元数据前置过滤**：

```
无 filter_city：全库 ANN 搜索（5000+ 条）
有 filter_city：仅在该城市分区内 ANN 搜索（通常 30–200 条）
```

效果：检索精度和速度均有提升，避免「巴黎的交通」query 召回「北京的交通」chunk。

### 7.4 可用性保障

```javascript
isAvailable() {
  return !!(this.supabase && this.apiKey);
}
```

若 `QWEN_EMBEDDING_API_KEY` 未配置或 Supabase 连接失败，`ragService` 不会抛出异常，而是使 `isAvailable()` 返回 `false`，`aiChatService` 跳过 RAG 注入，正常回退到纯 LLM 模式。

### 7.5 错误处理

```javascript
try {
  const ragContext = await this.ragService.retrieveContext(message, opts);
  if (ragContext) systemPrompt += `\n\n${ragContext}`;
} catch (ragErr) {
  logger.warn('RAG 检索失败，降级为无知识库模式', ragErr.message);
  // 不 rethrow，对话正常继续
}
```

### 7.6 Hybrid 检索测试脚本

新增测试脚本：`backend/scripts/test_rag_local_qwen.py`

职责：

1. 校验 `JSONL -> Supabase` 的入库完整性
2. 对本地知识库执行 BM25 稀疏召回
3. 对 Supabase 执行 Dense 向量召回
4. 用 RRF 融合稀疏 / 稠密候选
5. 用本地 `Qwen3-Reranker-4B` 对融合结果精排

脚本默认参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `dense_top_k` | 20 | Dense 召回候选数 |
| `sparse_top_k` | 20 | BM25 召回候选数 |
| `rrf_top_k` | 30 | 融合后进入 rerank 的候选数 |
| `top_k` | 5 | 最终输出条数 |
| `threshold` | 0.15 | Dense 初检阈值，低于线上默认值，用于放大候选池 |
| `rrf_k` | 60 | RRF 融合常数 |

本地 reranker：

- 模型：`/home/wushiwei/projects_z/cdy/Qwen/Qwen3-Reranker-4B`
- 推理方式：`AutoModelForCausalLM` + `yes/no` 二分类打分
- 输入格式：`Instruct + Query + Document`

推荐运行方式：

```bash
cd /home/wushiwei/projects_z/cdy/RAG/ai-travel-planner

/home/wushiwei/anaconda3/bin/conda run -n llm python backend/scripts/test_rag_local_qwen.py \
  --supabase-url 'YOUR_SUPABASE_URL' \
  --supabase-key 'YOUR_SERVICE_ROLE_KEY'
```

显存不足时可降级：

```bash
/home/wushiwei/anaconda3/bin/conda run -n llm python backend/scripts/test_rag_local_qwen.py \
  --supabase-url 'YOUR_SUPABASE_URL' \
  --supabase-key 'YOUR_SERVICE_ROLE_KEY' \
  --reranker-batch-size 1
```

---

## 8. 上下文注入与提示词工程

### 8.1 上下文格式

`buildContext()` 将检索到的 chunk 格式化为结构化文本块，注入到 systemPrompt 末尾：

```
---以下为来自旅游知识库的参考资料（按相关度排序）---

【1】城市: 巴黎 | 类型: eat | 相关度: 0.72
标题: 美食与餐厅
内容: 巴黎拥有世界顶级的美食文化，从米其林星级餐厅到街头可颂，...（最多400字）

【2】城市: 巴黎 | 类型: eat | 相关度: 0.65
标题: 素食选择
内容: 对于素食者，巴黎近年来涌现出大量...

---知识库参考资料结束---
请优先参考以上资料回答用户问题，如资料不足可结合自身知识补充。
```

### 8.2 关键设计决策

**每条 chunk 截断为 400 字**（`maxCharsPerChunk: 400`）：
- 原始 chunk 最大 800 字，但 LLM context window 有限
- 最多 5 条 × 400 字 = 2000 字上下文，加上系统提示和历史消息后仍在主流模型 4K token 内
- 截断优先保留开头（最重要的摘要信息通常在前）

**注入位置**：systemPrompt 末尾，在多轮历史消息之前。原因：
- systemPrompt 处于最高优先级位置，LLM 更倾向遵循
- 置于历史消息前避免检索上下文被长对话历史挤出 context window

**显示相关度分数**：让 LLM 感知每条资料的置信度，从而在低分资料可信度不足时，在回答中做适当保留（"根据参考资料，该信息可能…"）

### 8.3 提示词注入安全性

知识库内容在注入前经过三层过滤（见第4节），不包含危险指令或越狱字符串。但理论上若知识库被污染（Prompt Injection 攻击），嵌入的指令可能影响模型行为。

**当前缓解**：
- 知识库来源固定为 Wikivoyage（只读爬取，非用户上传）
- 注入内容与用户指令用明确分隔符（`---`）区分，LLM 对边界感知较好

**若上线需增加**：对来自 Supabase 的 chunk content 做白名单字符过滤，剔除 `<script>`, `IGNORE`, `SYSTEM:` 等注入特征词。

---

## 9. Rerank：现状与改进规划

### 9.1 当前状态

**线上服务当前仍未默认启用 Rerank**，检索结果直接按向量相似度（cosine similarity）排序后注入上下文。

原因：
- 项目当前处于 MVP 阶段，Baseline 效果已足够演示
- Qwen3-Embedding-8B 的 Embedding 质量较高，Top-5 召回准确率在测试中表现良好
- Rerank 会增加额外的 API 延迟（通常 200–500ms）和成本

**但本地评测脚本已实现 Rerank 与 Hybrid 检索实验链路**：

- 稀疏召回：本地 BM25
- 稠密召回：Supabase `match_travel_knowledge`
- 融合：RRF
- 精排：`Qwen3-Reranker-4B`

这样可以先在离线测试中验证收益，再决定是否迁移到 `ragService.js`。

### 9.2 Rerank 的价值

在以下场景中，纯向量检索存在不足，Rerank 可以改善：

| 问题场景 | 描述 | Rerank 如何改善 |
|---------|------|----------------|
| 语义相近但 topical 不匹配 | "巴黎住哪里" 召回了 "巴黎住宿价格贵吗" 和 "巴黎宿营地" | Cross-encoder 精度更高 |
| 多义词干扰 | "故宫博物院" 区分北京/台北 | 引入位置上下文 rerank |
| 长尾城市向量空间稀疏 | 冷门城市 chunk 间距离相近，区分度低 | BM25 混合分数 rerank |
| 结果多样性不足 | Top-5 全是同一 section 的类似内容 | MMR（最大边缘相关）去冗余 |

### 9.3 规划的改进方案

**方案 A：Cross-Encoder Rerank（最优精度）**

```
召回候选集（Top-20） → CrossEncoder(query, chunk_i) → 精排 Top-5
```

- 模型选型：`BAAI/bge-reranker-v2-m3`（中文效果最佳）或通过 ModelScope 调用
- 每次增加约 20 次 forward pass，延迟 +200–500ms
- 适合对精度要求高的生产场景

**方案 B：MMR（Maximum Marginal Relevance）去冗余**

```javascript
// 伪代码
selected = [highest_similarity_chunk];
while selected.length < K:
  next = argmax over remaining chunks of:
    λ * sim(chunk, query) - (1-λ) * max(sim(chunk, s) for s in selected)
  selected.append(next)
```

`λ` 控制相关性与多样性的权衡，λ=1 退化为纯相似度排序，λ=0.5~0.7 在多样性和相关性间平衡。

**方案 C：BM25 混合检索（Hybrid RAG）**

```
向量召回（Top-20）∪ BM25 关键词召回（Top-20）→ RRF 融合 → Top-5
```

RRF（Reciprocal Rank Fusion）公式：$score(d) = \sum_{r \in R} \frac{1}{k + r(d)}$ ，$k=60$ 为经验常数。

Supabase 支持通过 `pg_bm25`（Paradedb 插件）实现混合检索，但需要额外安装。

当前测试脚本的实际落地与该方案接近，但有两个额外步骤：

1. 检索前先做 `query 解析`
   提取 `city / type / poi`，优先缩小候选范围
2. 采用级联过滤
   `city+type -> city -> type -> global`

这样做的直接收益是：

- 避免“义乌美食”问题被杭州美食误召回
- 在长尾城市数据稀疏时，优先判断“该城市该类型是否有数据”
- 把 rerank 预算花在更干净的候选集上

---

## 10. 面试常见问题解答

### Q1: 为什么 chunk 大小选 800 字？

**答**：这是在以下几个约束下取的平衡点：

- **语义完整性**：800 字约等于 2–4 段旅游描述，足以包含一个完整的地点/活动介绍，不会截断关键信息
- **Embedding 质量**：Qwen3-Embedding-8B 训练时的最优输入长度在 512–1024 token 区间，800 中文字符约合 400–600 token，处于甜区
- **上下文注入代价**：Top-5 × 800 字 = 4000 字，加上历史消息会接近 LLM 的 4K context limit；实际注入时每条截断为 400 字，留出余量
- **行业惯例**：LangChain 默认 `chunkSize=1000`（英文），中文信息密度更高，800 等效适配

---

### Q2: 为什么 chunk overlap 设为 120？

**答**：Overlap 的目的是避免将同一个完整语义的句子切断后，关键信息落在两个 chunk 的末尾/开头各出现一半，导致两个 chunk 都无法独立表达完整语义。

120 字约占 chunk 大小的 15%（业界常见 10%–20%），可覆盖 1–2 个完整句子。过大的 overlap 会增加重复存储和检索时的余弦相似度混淆（相邻 chunk 会有极高相似度，导致 Top-K 全部是相邻片段而非多样性覆盖）。

---

### Q3: 为什么选 IVFFlat 而不是 HNSW？

**答**：见第 6.2 节对比表。核心原因：

1. 项目数据量约 5000 条，IVFFlat 在此规模精度损失几乎不可感知（HNSW 主要在百万级别体现优势）
2. Supabase 托管环境 pgvector 版本不确定，HNSW 需要 0.5.0+
3. 开发阶段频繁重建索引，IVFFlat 构建速度是 HNSW 的 3–5 倍

生产如果数据增长到 100 万级，应迁移到 HNSW。

---

### Q4: 相似度阈值 0.35 怎么来的？

**答**：通过手工构造测试集（20 组 query-answer 对）评估不同阈值下的 Precision 和 Recall。

- 0.2：Recall 高但 Precision 低，注入了大量噪声 chunk
- 0.35：P≈0.82，R≈0.74，F1 最优
- 0.5：Recall 下降明显，长尾城市大量 miss

具体值依赖于模型和数据分布，换成 text-embedding-3-large 等模型需要重新校准。

---

### Q5: 如何处理多轮对话中的 RAG？

**答**：当前实现是 **每轮独立检索**——每次用户发消息都以最新消息作为 query 向量化并检索。

**潜在问题**：「你能给我更多关于同一个地方的信息吗？」这类指代性问题无法独立形成有效查询。

**改进方向**：
1. **Query Rewrite**：用 LLM 将指代性问题改写为自包含问题（HyDE 变体）
2. **对话摘要查询**：将近几轮对话摘要 + 最新问题拼接后再向量化
3. **Session 级知识缓存**：首次检索城市后，将该城市所有 Top-K chunk 缓存在 session，后续轮次直接从缓存做精排

---

### Q6: 如何评估 RAG 效果？

**答**：标准评估框架 RAGAS 包含 4 个指标：

| 指标 | 含义 | 获取方式 |
|------|------|---------|
| Faithfulness | 回答与检索内容的一致性 | LLM 判断回答中每个声明是否有 chunk 支撑 |
| Answer Relevancy | 回答与问题的相关性 | 对回答生成反向问题，计算与原问题的相似度 |
| Context Precision | 检索到的 chunk 中真正有用的比例 | 需要 ground truth 标注 |
| Context Recall | 应该检索到的信息被召回的比例 | 需要 ground truth 标注 |

本项目目前使用**手工抽样评估**（50 条 query 人工打分），尚未接入自动化 RAGAS 评估，这也是后续计划之一。

---

### Q7: RAG 相比 Fine-tuning 的优劣？

| 维度 | RAG | Fine-tuning |
|------|-----|------------|
| 知识更新 | 更新向量库即可（快） | 需要重新训练（慢、贵） |
| 成本 | Embedding API + 向量库 | GPU 训练成本 |
| 幻觉控制 | 有知识来源可引用 | 模型仍可能产生幻觉 |
| 私域知识 | 天然隔离，来源可追溯 | 知识融入权重，不可追溯 |
| 推理延迟 | 增加检索延迟（+100–500ms） | 无额外延迟 |
| 适用场景 | 知识频繁更新、需要引用来源 | 风格/格式迁移、领域语言适配 |

本项目选 RAG 的核心原因：旅游知识随时间更新（新景点、价格变化），且用户关心信息来源可信度。

---

### Q8: 向量数据库里的向量如何做安全隔离？

**答**：本项目通过 Supabase RLS（Row Level Security）实现：
- 公开 SELECT（任何人可检索知识库）
- INSERT/UPDATE/DELETE 仅 `service_role` 有权限（只有后端 ingest 脚本使用 service key）

若知识库包含用户私有数据（如个人行程记录），需在 RLS 中加 `auth.uid() = user_id` 条件，确保用户只能检索自己的数据。本项目知识来源是公开的 Wikivoyage，因此不需要用户级隔离。

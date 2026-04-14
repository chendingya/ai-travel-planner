# RAG 知识库技术文档

> 更新时间：2026-03-15  
> 适用代码：当前仓库中的 `backend/scripts/*`、`rag-setup.sql`、`backend/src/services/ragService.js`、`backend/src/services/aiChatService.js`

本文档按当前代码说明项目里的 RAG 知识库链路，不再保留“旧设计”和“规划态”叙述。若文档与代码不一致，以以下文件为准：

- `backend/src/services/ragService.js`
- `backend/src/services/aiChatService.js`
- `backend/src/config/index.js`
- `backend/src/services/providerConfigService.js`
- `rag-setup.sql`

## 1. 文档定位

RAG 目前仍是一个跨采集、入库、存储、检索、AI 对话的横切主题，所以暂时保留在 `docs/` 根目录。建议和以下文档一起阅读：

- `docs/rag-embedding-flow.md`
- `docs/architecture/后端架构文档.md`
- `docs/features/AI提供商管理功能说明.md`
- `docs/testing/测试用例清单.md`

## 2. 当前实现总览

```text
Wikivoyage / 爬虫源
  -> backend/scripts/crawler/*
  -> 结构化 chunk JSONL
  -> backend/scripts/crawler/filter.js 清洗/过滤
  -> knowledge_*_filtered.jsonl
  -> 入库脚本
     - backend/scripts/ingest.js
     - backend/scripts/ingest_local_qwen.py
  -> Supabase public.travel_knowledge
     - pgvector embedding
     - searchable_text
     - dense / sparse RPC
  -> backend/src/services/ragService.js
     - intent 解析
     - city/type scope 级联
     - sparse + dense 检索
     - RRF 融合
     - 可选 rerank
  -> backend/src/services/aiChatService.js
     - 无工具模式: 注入 systemPrompt
     - 工具模式: 暴露 search_travel_knowledge
  -> 最终回答 / 工具摘要
```

和旧版文档相比，当前实现有 4 个关键变化：

1. 运行时检索已经不是“纯向量召回”，而是 `sparse + dense + RRF + 可选 rerank`。
2. RAG 配置已纳入提供商管理体系，支持用户配置、脱敏回显、连通性校验和按请求生效。
3. 数据表已扩展为支持 `kb_slug`、`dataset_version`、`searchable_text`、`metadata` 等字段。
4. AI Chat 在“开工具”和“不开工具”两种模式下，对 RAG 的接入方式不同。

## 3. 数据生产与入库

### 3.1 采集与解析 (关于分块 Chunking 策略)

知识库原始数据来自 `backend/scripts/crawler/*`。

**面试常问：你们的 RAG 数据是怎么做分块（Chunking）的？**
我们没有采用粗暴的固定长度（Token）滑动窗口截断，而是采用了**基于文档结构的语义分块**，重点做到了**上下文自包含**：
1. **按层级语义切分**：基于旅游攻略文档的自然目录树（如 `H1市 -> H2大类 -> H3具体POI`）作为边界切割。保证每一个 chunk 讲的都是同一个独立景点或主题，避免语意被拦腰切断。
2. **向下注入元数据（Metadata防丢失）**：切块后，子段落极易丢失语境（比如单独一句“全天免费开放”无法检索）。因此我们在组装时，会把父级的 `city`、`type`、`poiName` 强挂载到 chunk 的独立字段上。入库时会将元数据与正文一起拼接成 `searchable_text` 参与检索和 Embedding，保证每个 chunk 都是“自包含”的确切事实。

从当前代码可确认，产出并输出至 JSONL 的 chunk 常见字段包括：

- `id`
- `city`
- `type`
- `title`
- `sectionTitle`
- `subSectionTitle`
- `poiName`
- `content`
- `tags`
- `sourceUrl`
- `lang`

### 3.2 过滤与清洗

过滤脚本位于 `backend/scripts/crawler/filter.js`，主要目标是：

- 去掉不适合进入知识库的内容
- 清理 MediaWiki/CSS 等噪声文本
- 降低 prompt injection 和检索污染风险

### 3.3 两条正式入库路径

当前仓库维护两条入库脚本：

#### `backend/scripts/ingest.js`

适合远程 Embedding 服务：

- 默认模型 `Qwen/Qwen3-Embedding-8B`
- 调用 OpenAI-compatible `/v1/embeddings`
- 默认维度 `1024`
- 分批写入 Supabase

流水线就是：拿到文件内容 ➡️ 每25条切分为一批 ➡️ 调 Qwen API 把文字变成向量 ➡️ 带着向量存到 Supabase 数据库。

#### `backend/scripts/ingest_local_qwen.py`

适合本地模型：

- 读取本地 Qwen embedding 模型
- 支持 checkpoint 断点续跑
- 本地生成向量，再通过 PostgREST 写入 Supabase

两者的输出目标一致，差别主要在“向量如何生成”。

## 4. 数据库设计

数据库初始化以 `rag-setup.sql` 为准。

### 4.1 核心表 `public.travel_knowledge`

当前表结构的重要字段有：

- `kb_slug`
- `dataset_version`
- `external_id`
- `city`
- `type`
- `title`
- `section_title`
- `sub_section_title`
- `poi_name`
- `content`
- `tags`
- `source`
- `source_url`
- `license`
- `lang`
- `metadata`
- `searchable_text`
- `content_hash`
- `embedding VECTOR(1024)`

其中最重要的增强点是：

1. `kb_slug`：允许多个知识库或环境共存。在实际业务中，可能有不同的独立知识库（比如“国内游知识库”、“日韩游知识库”、“用户的私有攻略库”），或者区分开发环境和生产环境的数据（如 travel-cn-dev 和 travel-cn-prod）。有了这个字段，所有数据可以存在同一张表里物理隔离，检索时作为强过滤条件，避免建一堆表。
2. `dataset_version`：允许运行时锁定某次导入版本。记录这一批数据是哪次抓取或生成的版本号
3. `searchable_text`：为 sparse 检索准备聚合文本。它是提前拼好的“用来被传统关键词搜索的纯文本字段”。它通常是把标题、地点名、正文、标签等关键信息揉合在一起的文本。
4. `metadata`：保留不适合频繁加列、但又需要长期存档的上下文。

### 4.2 索引

当前 SQL 除了向量索引，还补了多类结构化索引。这是PostgreSQL 数据库中为了加速不同类型的检索而建立的特色索引。

- `kb_slug`
- `dataset_version`
- `(kb_slug, city)`
- `(kb_slug, type)`
- `lang`
- `tags` GIN
- `metadata` GIN
- `searchable_text` trigram GIN
- `embedding` IVFFlat

这说明当前 RAG 已明确不是单一向量库方案，而是混合检索基座。不仅仅是单纯的向量数据库，还能同时做高级的文本搜索和 JSON 检索。

GIN 是 PostgreSQL 里一种非常强大的索引，专门用来处理存在“包含”关系的数据（比如数组、JSON 内部属性、全文检索词）。
tags GIN 和 metadata GIN：允许系统极快地查找包含特定标签（如 tags @> '{"美食"}'）或特定的 JSON 属性的记录，而不需要从头到尾遍历整张表。

IVFFlat是 PostgreSQL 的向量插件 pgvector 提供的一种向量索引算法，专门用于给 embedding 字段加速。IVFFlat 是一种 ANN（近似最近邻）算法。它会在建立索引时，用聚类算法把所有向量划分为多个“聚类中心（区域）”。当你的新提问进库搜索时，系统先算你的提问离哪个“聚类中心”比较近，然后只去搜索那个中心周围的一小撮向量，而不是扫描全表。

### 4.3 幂等与唯一性

“幂等”是指：一段入库脚本，你不管运行一次，还是运行一百次，或者是中途断网崩溃了你重新跑，数据库里的结果都是一样的，绝不报错，也绝不会出现两条一模一样的数据。

为了实现这种安全机制，数据库层面设置了两个唯一约束：

- `(kb_slug, content_hash)`：保护重复内容，在同一个知识库（kb_slug）里，同一段文本内容的哈希值（content_hash，即文本的 MD5 摘要）必须是唯一的。
- `(kb_slug, dataset_version, external_id)`：保护外部源 ID，在同一个知识库、同一个版本批次（dataset_version）里，来自外部数据源的唯一 ID（external_id，比如高德地图的 POI ID 或者是维基导游的文章 ID）必须是唯一的。

注意：当前两个入库脚本都采用“忽略重复”的策略，不会像旧版文档那样在冲突时主动覆盖旧向量。

## 5. 检索 RPC

### 5.1 Dense RPC: `match_travel_knowledge`

职责：

- 接收 `query_embedding`。当用户提问（比如“上海迪士尼怎么避开人群”）时，后端程序会先调通义千问等大模型的 API，把这句话变成一串由几百上千个浮点数组成的数组（即特征向量）。这个数组作为参数传入数据库，它就是 query_embedding。
- 按 `kb_slug / city / type / dataset_version` 过滤。在茫茫的向量数据中直接比对是非常低效且容易产生幻觉的。所以函数会先用传统的结构化条件把数据圈小。比如系统知道用户在问“上海”的“景点类（attraction）”问题，它就会让数据库先用普通索引把 city='上海' 且 type='attraction' 以及当前生效的知识库版本的数据筛出来。
- 基于 `embedding <=> query_embedding` 做余弦距离检索
- 返回 `similarity`。计算完成后，函数会把内容片段按相似度从高到低排序返回，最后同时附带返回一个 similarity（相似度分数，通常是 1 - 余弦距离）。

### 5.2 Sparse RPC: `match_travel_knowledge_sparse`

职责：

- 接收 `query_text` 与 `query_terms`。query_text是用户提问的完整原话（如“迪士尼的快速通道怎么买”）。query_terms是后端程序通常会先把提问做一个简单的分词或拆字处理（如 ['迪士尼', '快速通道']），作为数组传给数据库，方便数据库做精确的片段匹配。
- 基于 `title / poi_name / searchable_text` 做相似度与命中加权。
数据库拿到关键词后，会去之前提到的 GIN 索引里光速查出包含这些词的数据，然后给它们打分。如果用户的词直接命中了 poi_name（景点名称）或 title（标题），这大概率就是用户想搜的实体，所以会给一个极高的权重加分。如果仅仅是在 searchable_text（正文内容的聚合文本）中随带提到了这几个字，也会算命中，但加分会低一些。
- 返回 `sparse_score`

这里的 sparse 是 SQL 层的文本相似度加权方案，不是单独接入的外部搜索引擎。

提升点：现在实现比较轻量。分词的时候，可以换成jieba库这种成熟的库做。可以引入BM25算法来做关键词匹配。或者额外部署一套 Elasticsearch ，但这种就比较重了，更适合生产部署。

TF-IDF 由两部分组成：词频 (TF) 和 逆文档频率 (IDF)。
TF：词条 t 在文档 d 中出现的次数。
IDF：包含词条 t 的文档数量 / 文档总数

TF-IDF 假设词频越高，相关性越高，且呈线性关系。但实际上，一个词出现 10 次和出现 100 次，对相关性的贡献并非 10 倍差距，而是存在饱和效应（Saturation）。
标准的 TF-IDF 对短文档和长文档的长度差异处理不够。

BM25：TF部分开始近似线性增长，随后增长放缓。另外TF部分还做了文档长度归一化，长文档更容易因为“词多”而高频命中，但实际上未必更相关。这个归一化的强度是可以控制的，参数b，取0到1，0就是完全不做归一化，1就是完全做归一化


## 6. 运行时 `RagService`

运行时核心在 `backend/src/services/ragService.js`。

### 6.1 可用条件

`isAvailable()` 当前依赖：

- `embeddingEnabled=true`
- 有可用 `supabase`
- 有可用 `embeddingAdapter.embed()`

因此 RAG 是否生效，取决于整套 provider 配置是否可用，而不是单一环境变量。

### 6.2 配置来源

运行时配置由 `backend/src/config/index.js` 统一装配，支持两种来源：

1. `.env`
2. Provider 配置页保存后的用户态配置，再由 `providerConfigService` 在登录请求中按用户注入运行时上下文

RAG 关键配置包括：

- `RAG_ENABLED`
- `RAG_KB_SLUG`
- `RAG_DATASET_VERSION`
- `RAG_TOP_K`
- `RAG_SIMILARITY_THRESHOLD`
- `RAG_DENSE_TOP_K`
- `RAG_SPARSE_TOP_K`
- `RAG_RRF_TOP_K`
- `RAG_RRF_K`
- `RAG_SPARSE_THRESHOLD`
- `RAG_INTENT_CATALOG_PAGE_SIZE`
- `RAG_INTENT_CATALOG_TTL_MS`
- `RERANK_ENABLED`
- `RERANK_CANDIDATE_FACTOR`

### 6.3 Provider 体系

RAG 已接入统一适配器体系：

- Embedding 走 `createEmbeddingAdapter()`
- Rerank 走 `createRerankAdapter()`

其中 Rerank 兼容两种协议：

- 传统 HTTP rerank 接口：`query + documents`
- OpenAI-compatible：`/v1/chat/completions` 或 `/v1/responses`

### 6.4 Query Intent 解析

当前检索不是“直接把原始 query 扔进向量库”，而是先做轻量意图解析。不依赖大模型。

意图字段包括：

- `city`
- `type`
- `poi`

实现方式：

- `ensureIntentCatalogLoaded()` 从 `travel_knowledge` 分页加载 `city` 和 `poi_name`
- 结果带 TTL 缓存在内存中
- `inferQueryCity()` / `inferQueryType()` / `inferQueryPoi()` 负责规则推断

当前 `type` 规则映射包括：

- `food`
- `attraction`
- `transport`
- `shopping`
- `activity`
- `guide`
- `notice`

### 6.5 Scope 级联

`candidateScopes()` 会按以下顺序尝试范围：

1. `city+type`
2. `city`
3. `type`
4. `global`

这是当前精度提升的重要部分，因为它能优先把候选集缩小到最合理的局部空间。

### 6.6 Sparse + Dense 并行检索

每个 scope 下，`search()` 会并行执行：

- `sparseRetrieve()`
- `denseRetrieve()`

其中：

- `sparseRetrieve()` 会先把中文文本拆成字符和双字片段，再传给 sparse RPC。
- `denseRetrieve()` 会先调用 embedding provider 生成 query 向量，再走向量 RPC。
- 两条链路都带 `_withRetry()`，对超时、连接失败等瞬时错误做有限重试。

### 6.7 RRF 融合

`rrfFuse()` 会把 sparse 和 dense 结果按文档 ID 合并，并计算：

```text
score += 1 / (rrfK + rank)
```

融合后文档会保留：

- `sources`
- `rrf_score`

### 6.8 可选 Rerank

如果 `RERANK_ENABLED=true` 且存在可用 rerank provider：

- 只会从融合后的前 `topK * candidateFactor` 个候选里做精排
- 精排失败时自动降级回 RRF 排序

因此当前更准确的状态描述应该是：

- Hybrid 检索已经是正式运行时实现
- Rerank 是可选增强能力，不开启时走 RRF 结果

### 6.9 内存缓存

`RagService` 内部还维护两类轻量缓存：

- query embedding 缓存
- intent catalog 缓存

它们都是进程内缓存，适合当前服务形态，但不应理解为跨实例共享缓存。

## 7. RAG 与 AI Chat 的接入方式

`backend/src/services/aiChatService.js` 中，RAG 有两条不同接入链路。

### 7.1 不开启工具时

当 `enableTools=false` 且 RAG 可用：

- `aiChatService` 调用 `ragService.retrieveContext(message, opts)`
- `ragService` 返回 `buildContext()` 生成的参考资料块
- 结果被拼进 `systemPrompt`

这条链路适合“模型不显式调用工具，但仍然希望参考知识库”的场景。

### 7.2 开启工具时

当 `enableTools=true`：

- `aiChatService` 创建 `search_travel_knowledge` 动态工具
- 工具内部调用 `ragService.search()`
- 最终返回 `buildSearchSummary()` 生成的文本摘要

当前还做了额外限制：

- `search_travel_knowledge` 单轮最多调用 3 次，因为实际使用过程中发现模型可能会死循环，如果得不到想要的信息会反复检索向量数据库，所以做了这个限制。

工具描述里也明确限制了适用场景：

- 适合景点、美食、交通、攻略、避坑等相对稳定信息
- 不适合天气、票价、营业状态等实时信息

## 8. 上下文与摘要格式

### 8.1 `buildContext()`

用于无工具模式，输出参考资料块，每条结果尽量带上：

- 城市
- 类型
- 标题
- 分数
- 截断后的正文

分数字段优先级：

1. `rerank_score`
2. `rrf_score`
3. `similarity`

### 8.2 `buildSearchSummary()`

用于工具模式，输出更像检索报告，会包含：

- 推断出的 intent
- 命中 scope
- Sparse / Dense / Final 数量
- 每条结果的分数和来源

这样设计的好处是：

- 对模型更可解释
- 对调试更友好
- 对工具事件流展示也更清晰

## 9. 提供商配置与请求级生效

RAG 现在已经纳入提供商管理，不建议再把它理解成“单纯写死在 `.env` 里的能力”。

当前已支持：

- RAG Embedding provider 在线维护
- RAG Rerank provider 在线维护
- API Key 脱敏回显
- 落库前 AES-256-GCM 加密
- 保存前连通性校验
- 保存后在当前用户后续请求中立即生效，不会覆盖其他用户的 `LangChainManager` / `RagService` 运行时

对应文件：

- `backend/src/services/providerConfigService.js`
- `frontend/src/views/ProviderConfigView.vue`
- `docs/features/AI提供商管理功能说明.md`

## 10. 入库与测试建议

### 10.1 入库前排查顺序

如果要重建知识库，建议按以下顺序排查：

1. JSONL 文件是否正确
2. `rag-setup.sql` 是否已执行
3. `kb_slug` / `dataset_version` 是否和运行时配置一致
4. 当前生效的 provider 配置是否正确
5. 最后再执行入库脚本

当前最常见的问题往往不是“向量算错了”，而是：

- 写进了错误的 `kb_slug`
- 当前运行时锁定了别的 `dataset_version`
- Provider 页面配置覆盖了 `.env`

### 10.2 现有验证手段

当前仓库已存在的 RAG 验证方式包括：

- `backend/tests/ragService.test.js`
  - 验证 scope 选择
  - 验证 rerank 顺序
  - 验证 transient retry
- `backend/scripts/test_rag_local_qwen.py`
  - 验证本地 embedding / rerank 链路
  - 验证检索质量
- `docs/testing/测试用例清单.md`
  - 记录手工验证步骤

## 11. 当前结论

基于当前代码，项目里的 RAG 可以概括为：

- 数据层：`JSONL -> Supabase travel_knowledge`
- 检索层：`intent parse -> scope fallback -> sparse+dense -> RRF -> optional rerank`
- 接入层：`systemPrompt 注入` 与 `tool 调用` 双模式并存
- 配置层：支持 `.env` 与用户级 provider 配置，并按请求隔离生效

后续如果继续迭代 RAG，优先同步这 5 个位置：

1. `rag-setup.sql`
2. `backend/src/services/ragService.js`
3. `backend/src/config/index.js`
4. `backend/src/services/aiChatService.js`
5. `docs/rag-embedding-flow.md`

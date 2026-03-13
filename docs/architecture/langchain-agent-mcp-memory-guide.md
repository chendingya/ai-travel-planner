# AI 聊天中的 LangChain / Agent / MCP / Prompt / Memory 实现详解

这份文档专门回答 5 个问题：

1. 项目里 LangChain 的 react agent 是怎么组装的。
2. MCP server 又是怎么被封装成 LangChain tools 的。
3. prompt 生成逻辑是怎么做的。
4. 对话消息是怎么存储到 Supabase 的。
5. 记忆系统是怎么分层、提取、检索和写回的。

建议阅读顺序：

1. 先看启动与依赖装配。
2. 再看 AI 聊天主链路。
3. 再看 MCP tools 的封装。
4. 最后看会话存储和四层记忆。

## 1. 入口装配：这些服务是在什么时候串起来的

应用启动时，会在 [backend/src/index.js](../../backend/src/index.js#L172-L214) 初始化下面几类核心对象：

- [LangChainManager](../../backend/src/services/langchain/LangChainManager.js#L1-L718)：统一管理文本模型、图片模型、agent 创建、provider fallback。
- [MCPService](../../backend/src/services/mcpService.js#L1-L509)：负责连接 MCP server、发现 tools、把 tools 包装成 LangChain `DynamicStructuredTool`。
- [AIChatService](../../backend/src/services/aiChatService.js#L1-L1720)：聊天主入口，负责组装 system prompt、历史消息、工具、记忆、SSE 流和消息落库。
- [PromptService](../../backend/src/services/promptService.js#L1-L209)：负责生成速记卡片 prompt 和明信片 prompt。

从启动代码可以直接看到装配关系：

- [LangChainManager 初始化](../../backend/src/index.js#L172-L173)
- [MCPService 初始化并做工具探测](../../backend/src/index.js#L184-L208)
- [AIChatService 注入 `langChainManager + supabase + mcpService + ttsService`](../../backend/src/index.js#L211-L214)
- [PromptService 注入 `langChainManager`](../../backend/src/index.js#L213-L214)

这意味着本项目的 AI 能力不是分散调用，而是集中走两条主线：

- 聊天相关能力走 AIChatService。
- 行程规划相关能力走 PlanService。

## 2. LangChain 的 react agent 是怎么做的

### 2.1 agent 的统一工厂在 LangChainManager

真正创建 react agent 的地方不在 controller，也不在 AIChatService，而是在 [backend/src/services/langchain/LangChainManager.js](../../backend/src/services/langchain/LangChainManager.js#L621-L683) 的 `createAgent()`。

关键点：

- 这里直接使用 [createReactAgent](../../backend/src/services/langchain/LangChainManager.js#L625) 来创建 agent。
- `tools`、`systemPrompt`、`provider`、`allowedProviders` 都由调用方传入。
- 它会先按 provider 优先级筛选和排序 adapter，再为每个 adapter 各创建一个 agent。
- 最后用 `primaryAgent.withFallbacks(fallbacks)` 组出一个带模型降级能力的 agent runnable。

也就是说，这个项目不是“一个模型 + 一个 agent”，而是“多个 provider 各自创建 agent，然后在 runnable 层做 fallback”。

对应实现位置：

- [createAgent 入口](../../backend/src/services/langchain/LangChainManager.js#L621-L683)
- [引入 `createReactAgent`](../../backend/src/services/langchain/LangChainManager.js#L625)
- [给 LLM 包装 metadata](../../backend/src/services/langchain/LangChainManager.js#L646-L661)
- [实际创建 react agent](../../backend/src/services/langchain/LangChainManager.js#L663-L667)
- [fallback 组合](../../backend/src/services/langchain/LangChainManager.js#L677-L681)

### 2.2 为什么要包装 metadata

这里有一个很实用的细节：项目会在 agent 和 llm 两层都用 `withConfig({ metadata })` 注入 `provider/model` 信息，目的是保证在 LangChain/LangGraph 的事件流里仍然能拿到模型来源。

相关代码：

- [LLM metadata 注入](../../backend/src/services/langchain/LangChainManager.js#L646-L661)
- [Agent metadata 注入](../../backend/src/services/langchain/LangChainManager.js#L669-L674)

这个信息后面会被 AIChatService 用来：

- 回填 `aiMeta.providers`
- 生成前端可消费的 provider 元信息
- 辅助调试和 usage 统计

### 2.3 聊天场景中的 react agent 调用链

聊天主入口在 [AIChatController.chat](../../backend/src/controllers/aiChatController.js#L49-L176)。Controller 只负责：

- 校验请求参数
- 准备 SSE 响应头
- 调用 AIChatService
- 把 AIChatService 返回的异步流逐块写给前端

真正的 agent 编排在 [AIChatService.chat](../../backend/src/services/aiChatService.js#L905-L1360)。主流程可以按下面理解：

1. 先加载上下文。
   代码位置：
   - [加载 session state](../../backend/src/services/aiChatService.js#L918-L919)
   - [加载长期记忆](../../backend/src/services/aiChatService.js#L922-L926)
   - [检索语义记忆](../../backend/src/services/aiChatService.js#L929-L936)
   - [挂载 plan context](../../backend/src/services/aiChatService.js#L939-L939)

2. 再准备 system prompt 和 tools。
   代码位置：
   - [聊天 system prompt](../../backend/src/services/aiChatService.js#L942-L951)
   - [本地自定义工具 `query_train_tickets`](../../backend/src/services/aiChatService.js#L961-L1047)

3. 再调用 `langChainManager.createAgent()` 创建带 fallback 的 react agent。
   代码在 AIChatService 内部中段，最终得到 `agentRunnable`，后续通过 `streamEvents()` 执行。

4. 用 `agentRunnable.streamEvents()` 跑流式事件。
   代码位置：
   - [有 session 的流式执行](../../backend/src/services/aiChatService.js#L1137-L1139)
   - [无 session 的流式执行](../../backend/src/services/aiChatService.js#L1263-L1266)

5. 在事件流中把两类输出拆开处理。
   - 工具事件：转成统一 `tool_call` / `tool_result` 事件发给前端。
   - 模型 token：拼接成最终文本，同时逐块推给前端。

相关代码：

- [LangChain 事件转前端工具事件](../../backend/src/services/aiChatService.js#L1110-L1187)
- [工具事件转换器](../../backend/src/services/ai/streamToolEvents.js#L1-L387)

### 2.4 规划场景也用了同一套 createReactAgent

除了聊天，这个项目的旅行计划生成也走了同一套 react agent 机制。

入口在 [PlanService.generatePlan](../../backend/src/services/planService.js#L360-L560)，其中：

- 先从 MCPService 拿 LangChain tools。
  位置：[获取 MCP tools](../../backend/src/services/planService.js#L367-L376)
- 再调用 [LangChainManager.createAgent](../../backend/src/services/planService.js#L404-L413)
- 最后通过 `agentRunnable.invoke()` 一次性拿最终状态。
  位置：[执行规划 agent](../../backend/src/services/planService.js#L444-L448)

所以可以把项目里的 agent 分成两类：

- 聊天 agent：流式 `streamEvents()`，会和会话存储、记忆系统深度耦合。
- 规划 agent：一次性 `invoke()`，更偏工具编排和 JSON 结果生成。

## 3. MCP 是怎么封装成 LangChain tools 的

### 3.1 MCPService 先负责连上各类 MCP server

MCP 入口在 [backend/src/services/mcpService.js](../../backend/src/services/mcpService.js#L1-L509)。

它支持的 server 来源有三类：

- 环境变量默认 server，例如 `MCP_12306_URL`、`MCP_AMAP_URL`、`MCP_BING_URL`
- JSON 形式的 `MCP_SERVERS_JSON` / `MCP_CONFIG_JSON`
- 构造函数传入的 config

初始化阶段会：

1. 解析 server 配置。
2. 根据 transport 选择 stdio / sse / streamable_http。
3. 连接 server。
4. 立即执行 `tools/list` 探测每个 server 上有哪些 tools。

核心代码：

- [服务初始化和工具探测](../../backend/src/services/mcpService.js#L331-L359)
- [按 server 建立 MCP client](../../backend/src/services/mcpService.js#L176-L257)

### 3.2 MCP tool 列表如何拿到

`listTools()` 会遍历每个 MCP server，调用标准 MCP 方法 `tools/list`，把结果聚合成：

- `server`
- `tool`

对应代码：

- [listTools 聚合工具列表](../../backend/src/services/mcpService.js#L304-L329)

### 3.3 MCP JSON Schema 如何变成 LangChain Zod schema

MCP tool 描述里自带 `inputSchema`，但 LangChain 的 `DynamicStructuredTool` 需要的是 Zod schema。这个转换是项目自己做的。

核心代码：

- [JSON Schema 转 Zod](../../backend/src/services/mcpService.js#L258-L302)

实现思路很直接：

- `string -> z.string()`
- `number/integer -> z.number()`
- `boolean -> z.boolean()`
- `array -> z.array(itemSchema)`
- `object -> z.object(shape).passthrough()`

复杂的 `anyOf / oneOf / allOf` 当前直接退化为 `z.any()`，这说明这里的目标不是做最严格验证，而是保证 MCP tools 能顺利挂进 LangChain agent。

### 3.4 MCP tool 最终如何封装成 LangChain Tool

真正的封装发生在 [MCPService.getLangChainTools](../../backend/src/services/mcpService.js#L407-L447)。

这里会对每个 MCP tool 创建一个 `DynamicStructuredTool`：

- `name = tool.name`
- `description = tool.description`
- `schema = inputSchema 转换后的 zod`
- `func = 调用 MCPService.callTool(serverName, toolName, input)`

代码位置：

- [getLangChainTools 入口](../../backend/src/services/mcpService.js#L407-L447)
- [构造 `DynamicStructuredTool`](../../backend/src/services/mcpService.js#L422-L445)

`func` 里还做了两件事：

- 给 MCP 调用加超时保护
- 把错误转成 JSON 字符串返回给模型

这意味着在 agent 看来，MCP tool 和普通 LangChain tool 没什么区别，都是可调用函数，只是底层执行从本地函数变成了 `tools/call`。

### 3.5 聊天里其实同时存在两类工具

AIChatService 里实际是“混合工具”模式：

- 一类是 MCPService 提供的远程 tools。
- 一类是项目本地自己写的 LangChain tool，例如 [query_train_tickets](../../backend/src/services/aiChatService.js#L961-L1047)。

所以这个项目的工具层不是纯 MCP，也不是纯本地 tool，而是：

- MCP tool 负责接入外部能力。
- 本地 tool 负责封装项目定制逻辑和跨多个 MCP 调用的组合逻辑。

`query_train_tickets` 就是典型例子：它不是直接暴露底层 12306 MCP 原子工具，而是先查站点编码，再查余票，再把结果整理给模型。

## 4. prompt 是怎么做的

### 4.1 prompt 生成入口

prompt 相关 HTTP 入口在 [PromptController](../../backend/src/controllers/promptController.js#L1-L79)：

- [生成速记卡片 prompt](../../backend/src/controllers/promptController.js#L42-L60)
- [生成明信片 prompt](../../backend/src/controllers/promptController.js#L66-L79)

Controller 本身不存库，只做：

- 组装请求体
- 调用 PromptService
- 返回生成结果

### 4.2 PromptService 的做法

具体生成逻辑在 [backend/src/services/promptService.js](../../backend/src/services/promptService.js#L1-L209)。

两个核心方法：

- [generatePrompt](../../backend/src/services/promptService.js#L124-L155)
- [generatePostcardPrompt](../../backend/src/services/promptService.js#L158-L205)

实现特点：

1. 先写死一段强约束 `systemPrompt`。
   例如风格、构图、色调、输出格式、字符长度、是否允许解释说明等。

2. 把业务数据压成用户消息。
   - 速记卡片：直接把 notes 作为用户输入。
   - 明信片：会把 destination、duration、dailySummary、styleName、styleSuffix 等拼到 user prompt 里。

3. 最后统一走 `_invokeWithRefusalFallback()`。
   这个方法会遍历可用文本 provider，哪个模型先给出非拒答结果就用哪个。
   位置：[拒答回退逻辑](../../backend/src/services/promptService.js#L53-L93)

### 4.3 prompt 有没有单独持久化

当前代码里没有看到专门的 `prompts` 表，也没有看到 PromptService 把生成结果写入数据库。

也就是说，prompt 这部分目前是“实时生成、直接返回”，不是“生成后落库”。

可以对照：

- [PromptController 只返回 JSON](../../backend/src/controllers/promptController.js#L49-L79)
- [PromptService 内部没有 Supabase 依赖](../../backend/src/services/promptService.js#L1-L209)

所以如果你问“prompt 和对话存储是怎么做的”，答案要拆成两件事：

- prompt：按需生成，不落库。
- 对话：会进入 Supabase 的 `ai_chat_sessions.messages`。

## 5. 对话存储是怎么做的

### 5.1 HTTP 到 SSE 流

对话入口是 [POST /api/ai-chat](../../backend/src/routes/aiChatRoutes.js#L1-L42)。

Controller 在 [AIChatController.chat](../../backend/src/controllers/aiChatController.js#L49-L176) 里做了 SSE 处理：

- 设置 `text/event-stream`
- 先下发一条 meta 事件，带 `sessionId`
- 然后把 AIChatService 返回的异步流逐个 chunk 写给前端

前端接收到的既可能是：

- 文本 token
- 统一的工具事件
- memory_metrics 事件

### 5.2 会话消息写到哪张表

主表是 [supabase-setup.sql 中的 `ai_chat_sessions`](../../supabase-setup.sql#L75-L129)。

表结构关键字段：

- `conversation_id`: 会话 ID
- `user_id`: 所属用户
- `messages`: JSONB 数组
- `summary`: 会话摘要
- `summary_updated_at`: 摘要更新时间

这个设计很明确：一整个会话的消息列表直接存在同一行的 `messages JSONB` 中，而不是一条消息一行。

### 5.3 LangChain Message 如何序列化进 Supabase

专门负责这一层的是 [SupabaseMessageHistory](../../backend/src/services/langchain/SupabaseMessageHistory.js#L1-L151)。

核心方法：

- [读取消息 `getMessages()`](../../backend/src/services/langchain/SupabaseMessageHistory.js#L19-L32)
- [追加多条消息 `addMessages()`](../../backend/src/services/langchain/SupabaseMessageHistory.js#L50-L54)
- [真正写库 `_saveMessages()`](../../backend/src/services/langchain/SupabaseMessageHistory.js#L71-L94)

它做的事情是：

1. 从 `ai_chat_sessions.messages` 取出 JSON。
2. 把 JSON 映射回 LangChain 的 `HumanMessage / AIMessage / SystemMessage / ToolMessage`。
3. 新消息加入后再整体写回。

特别要注意两个字段：

- assistant 消息会保留 `tool_calls`
- tool 消息会保留 `tool_call_id` 和 `name`

对应代码：

- [JSON -> LangChain Message](../../backend/src/services/langchain/SupabaseMessageHistory.js#L97-L121)
- [LangChain Message -> JSON](../../backend/src/services/langchain/SupabaseMessageHistory.js#L123-L144)

### 5.4 聊天主流程什么时候落库

在有 session 的聊天模式下，AIChatService 会在 agent 跑完后，把“本轮 user 消息 + 最终 assistant 文本”写回会话历史。

关键代码：

- [构建 SupabaseMessageHistory](../../backend/src/services/aiChatService.js#L1113-L1115)
- [生成最终 AIMessage 并写入历史](../../backend/src/services/aiChatService.js#L1190-L1192)

这里有一条非常重要的注释，能解释设计取舍：

- [“手动加载和保存历史，比 RunnableWithMessageHistory 更可靠”](../../backend/src/services/aiChatService.js#L1113-L1114)

这说明作者没有把 LangGraph 的 message history 全权交给框架，而是自己显式控制：

- 读哪些历史
- 怎么做短记忆压缩
- 哪些结果真正写回数据库

### 5.5 为什么还保留了旧表 fallback

你会在 AIChatService 的 CRUD 代码里看到一些 `chat_sessions` / `chat_messages` fallback。

对应代码：

- [createSession fallback](../../backend/src/services/aiChatService.js#L1418-L1447)
- [getSessions fallback](../../backend/src/services/aiChatService.js#L1452-L1516)
- [getSessionHistory fallback](../../backend/src/services/aiChatService.js#L1521-L1563)
- [saveMessage fallback](../../backend/src/services/aiChatService.js#L1568-L1642)

这部分的意义更像兼容旧表结构或旧环境，不是当前主路径。当前主路径仍然是 `ai_chat_sessions`。

## 6. 记忆系统是怎么做的

这个项目的记忆不是单层，而是四层并行：

1. 会话短期记忆 session memory
2. 结构化长期记忆 long-term structured memory
3. 向量语义记忆 semantic memory
4. 挂载式计划上下文 plan context

这四层最终都会在 [AIChatService.chat](../../backend/src/services/aiChatService.js#L918-L939) 里被装配进一次对话。

### 6.1 会话短期记忆：保留最近窗口，并按阈值生成摘要

短期记忆由 [SessionMemoryService](../../backend/src/services/ai/sessionMemoryService.js#L1-L267) 负责。

关键方法：

- [buildShortMemoryWithMetrics](../../backend/src/services/ai/sessionMemoryService.js#L104-L159)
- [loadSessionState](../../backend/src/services/ai/sessionMemoryService.js#L171-L196)
- [generateSessionSummary](../../backend/src/services/ai/sessionMemoryService.js#L219-L243)
- [maybeRefreshSessionSummary](../../backend/src/services/ai/sessionMemoryService.js#L245-L260)

它的策略不是“把全部历史都喂给模型”，而是：

1. 从 `ai_chat_sessions.messages` 里读出全部原始消息。
2. 如果已有 `summary`，先把摘要转成一条 `SystemMessage` 挂到最前面。
3. 再只取最近 N 条消息。
4. 如果 token 超预算，再继续裁剪。

也就是“摘要 + 最近窗口”模式。

这套结果会在聊天主链路里用到：

- [构造短记忆 bundle](../../backend/src/services/aiChatService.js#L1115-L1120)

而当消息条数达到阈值后，会触发自动摘要刷新：

- [刷新 session summary](../../backend/src/services/aiChatService.js#L1199-L1204)

summary 本身就保存在 `ai_chat_sessions.summary` 字段里，对应表定义见 [ai_chat_sessions](../../supabase-setup.sql#L75-L129)。

### 6.2 结构化长期记忆：白名单 key 的跨会话偏好

长期结构化记忆由 [LongTermMemoryService](../../backend/src/services/ai/longTermMemoryService.js#L1-L226) 负责。

表结构在 [ai_user_memories](../../supabase-setup.sql#L132-L176)。

它的特点很鲜明：

- 只允许白名单 memory_key
- 按 `(user_id, memory_key)` 唯一 upsert
- 更像“用户画像字段”，不是任意文本仓库

关键代码：

- [读取长期记忆](../../backend/src/services/ai/longTermMemoryService.js#L35-L46)
- [格式化成 prompt block](../../backend/src/services/ai/longTermMemoryService.js#L86-L104)
- [从对话里抽取长期记忆候选](../../backend/src/services/ai/longTermMemoryService.js#L141-L166)
- [写回长期记忆](../../backend/src/services/ai/longTermMemoryService.js#L168-L193)

支持的 `memory_key` 白名单包括：

- `budget_preference`
- `travel_pace`
- `transport_preference`
- `accommodation_preference`
- `food_preference`
- `destination_preference`
- `taboo`

也就是说，这层记忆保存的是“稳定偏好和禁忌”。

在聊天主流程里它有两个作用：

1. 开始回答前，把这些记忆格式化成 block 注入上下文。
   代码：[装配长期记忆 block](../../backend/src/services/aiChatService.js#L922-L926)

2. 回答完成后，再从本轮对话里提取新候选并 upsert。
   代码：
   - [提取候选](../../backend/src/services/aiChatService.js#L1206-L1210)
   - [写回表](../../backend/src/services/aiChatService.js#L1211-L1211)

另外，Controller 还提供了人工管理接口：

- [获取长期记忆](../../backend/src/controllers/aiChatController.js#L339-L349)
- [获取长期记忆画像](../../backend/src/controllers/aiChatController.js#L352-L362)
- [手动保存长期记忆](../../backend/src/controllers/aiChatController.js#L365-L384)

### 6.3 语义记忆：向量化存储 + 相似度检索

语义记忆由 [SemanticMemoryService](../../backend/src/services/ai/semanticMemoryService.js#L1-L524) 负责。

对应数据库对象：

- [语义记忆表 `ai_user_semantic_memories`](../../supabase-setup.sql#L178-L237)
- [向量检索 RPC `match_ai_user_semantic_memories`](../../supabase-setup.sql#L239-L265)

这一层和结构化长期记忆的区别是：

- 结构化长期记忆保存的是固定字段。
- 语义记忆保存的是自然语言片段、标签、类型、embedding、召回次数等。

关键方法：

- [提取语义记忆候选](../../backend/src/services/ai/semanticMemoryService.js#L228-L272)
- [写入语义记忆与 embedding](../../backend/src/services/ai/semanticMemoryService.js#L274-L312)
- [格式化语义记忆 block](../../backend/src/services/ai/semanticMemoryService.js#L355-L369)
- [按向量相似度搜索相关记忆](../../backend/src/services/ai/semanticMemoryService.js#L372-L417)
- [生成 memory profile](../../backend/src/services/ai/semanticMemoryService.js#L439-L520)

它的工作流是：

1. 先让 LLM 抽取可长期保留的自然语言记忆候选。
2. 再调用 embedding 模型把 `memory_text` 向量化。
3. 把文本、类型、标签、置信度、embedding 一起写入 `ai_user_semantic_memories`。
4. 下一轮对话来时，用用户 query 的 embedding 去调用 RPC 做向量检索。
5. 把最相关的几条语义记忆重新拼成文本块，挂回 prompt。

在聊天主流程里的对应位置：

- [先检索相关语义记忆](../../backend/src/services/aiChatService.js#L929-L936)
- [回答后提取并写回语义记忆](../../backend/src/services/aiChatService.js#L1216-L1225)

还有一个细节很值得注意：

- 搜索命中后会增加 `recall_count`，并更新 `last_recalled_at`。
  位置：[检索后标记 recalled](../../backend/src/services/ai/semanticMemoryService.js#L328-L353)

这说明它不只是“存了向量”，还在积累“哪些记忆经常被召回”的统计特征。

### 6.4 计划上下文：不是记忆表，而是挂载 plans 表内容

`plan context` 由 [PlanContextService](../../backend/src/services/ai/planContextService.js#L1-L98) 负责。

它和前三层不同，不是从记忆表读，而是从 `plans` 表中按 `context_plan_id` 读取一份用户当前选中的旅行计划，再压缩成大段上下文文本。

关键代码：

- [把 plans 行数据整理成上下文摘要](../../backend/src/services/ai/planContextService.js#L16-L82)
- [按 `planId + userId` 加载计划上下文](../../backend/src/services/ai/planContextService.js#L84-L98)

在 AIChatService 中的挂载位置：

- [loadPlanContextSummary](../../backend/src/services/aiChatService.js#L939-L939)

这层的本质是“当前会话显式挂载的业务上下文”，不是自动抽取的记忆，但在模型视角里它和记忆一样，都会被前置注入。

### 6.5 这四层记忆是怎么一起进入模型的

把聊天主流程串起来看，一次完整对话的上下文来源是：

1. 固定 system prompt
2. 会话短期记忆摘要和最近消息
3. 结构化长期记忆 block
4. 语义记忆检索 block
5. 可选的计划上下文 block
6. 当前用户消息
7. 可选工具集

所以这个项目里的“记忆”并不是单个 memory class，而是一个分层注入体系。

## 7. 对前端输出的工具事件和记忆指标是怎么统一的

为了让前端稳定消费工具调用过程，项目没有直接把 LangChain 原始 event 透传给前端，而是做了一层事件协议转换。

实现文件：

- [streamToolEvents.js](../../backend/src/services/ai/streamToolEvents.js#L1-L387)

它主要做三件事：

1. 解析 LangChain event 中不同形态的 tool payload。
2. 归一化 `toolName` 和 `toolCallId`。
3. 生成统一结构的前端事件：`tool_call`、`tool_result`、`tool_error`。

测试文件也很值得一起看：

- [backend/tests/streamToolEvents.test.js](../../backend/tests/streamToolEvents.test.js#L1-L112)

另外，聊天流里还会下发 `memory_metrics`，用于前端展示“这轮上下文到底用了多少历史、多少记忆、是否有实际 token usage”。相关构造逻辑在 [AIChatService._buildMemoryMetricsChunk](../../backend/src/services/aiChatService.js#L601-L656)。

## 8. 推荐你按什么顺序读代码

如果你想一边看代码一边理解，建议按下面顺序：

1. [backend/src/index.js](../../backend/src/index.js#L172-L214)
   先看应用启动时怎么把 LangChainManager、MCPService、AIChatService、PromptService 串起来。

2. [backend/src/controllers/aiChatController.js](../../backend/src/controllers/aiChatController.js#L49-L176)
   先看聊天请求怎么进入 SSE 流。

3. [backend/src/services/aiChatService.js](../../backend/src/services/aiChatService.js#L905-L1360)
   这是聊天主链路，最关键。

4. [backend/src/services/langchain/LangChainManager.js](../../backend/src/services/langchain/LangChainManager.js#L621-L683)
   再看 react agent 是怎么创建和 fallback 的。

5. [backend/src/services/mcpService.js](../../backend/src/services/mcpService.js#L407-L447)
   再看 MCP tool 是怎么转成 LangChain tool 的。

6. [backend/src/services/langchain/SupabaseMessageHistory.js](../../backend/src/services/langchain/SupabaseMessageHistory.js#L19-L144)
   再看消息是怎么和 LangChain message 互转并写库的。

7. [backend/src/services/ai/sessionMemoryService.js](../../backend/src/services/ai/sessionMemoryService.js#L104-L260)
   看短期记忆和 session summary。

8. [backend/src/services/ai/longTermMemoryService.js](../../backend/src/services/ai/longTermMemoryService.js#L35-L193)
   看结构化长期记忆。

9. [backend/src/services/ai/semanticMemoryService.js](../../backend/src/services/ai/semanticMemoryService.js#L228-L520)
   看语义记忆和向量检索。

10. [supabase-setup.sql](../../supabase-setup.sql#L75-L265)
   最后对照数据库表结构和 RPC。

## 9. 一句话总结

这个项目的 AI 聊天架构可以概括成一句话：

“用 LangGraph 的 createReactAgent 统一跑多 provider fallback 的 agent，用 MCPService 把外部 MCP server 转成 LangChain tools，再由 AIChatService 把会话历史、长期记忆、语义记忆和计划上下文一起装配进对话，并把结果落到 Supabase。”

如果你后面愿意，我可以继续补第二份文档，专门画两张时序图：

- 聊天链路时序图
- 记忆提取与召回时序图
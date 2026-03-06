# AI 对话 SSE 与工具事件解析设计（前后端联调版）

## 1. 文档目标
本文件用于统一解释当前 AI 对话链路中：
1. 后端如何将模型流式输出与工具事件转换为 SSE。
2. 前端如何把 SSE 分片解析为聊天组件可渲染的内容。
3. 工具调用记录如何与最终回答分离展示。
4. Debug 模式与异常降级策略。

适用对象：答辩讲解、联调排障、后续重构。

---

## 2. 总体架构
```mermaid
flowchart LR
  U[用户输入] --> FE1[AIChatView.vue]
  FE1 --> FE2[t-chatbot onRequest]
  FE2 --> API[/POST /api/ai-chat/]
  API --> C[aiChatController.chat]
  C --> S[aiChatService.chat]
  S --> L[LangGraph/LangChain streamEvents]
  L --> S2[工具/文本事件归一化]
  S2 --> C2[SSE: data: JSON]
  C2 --> FE3[aiStreamEventParser.parseChunk]
  FE3 --> FE4[thinking/markdown 渲染块]
  FE4 --> FE1
```

---

## 3. 端到端时序
```mermaid
sequenceDiagram
  participant User
  participant View as AIChatView
  participant Ctrl as aiChatController
  participant Service as aiChatService
  participant Agent as LangGraph streamEvents
  participant Parser as aiStreamEventParser

  User->>View: 发送问题
  View->>Ctrl: POST /api/ai-chat (stream=true)
  Ctrl->>View: SSE meta(sessionId)
  Ctrl->>Service: chat(message, sessionId, options)
  Service->>Agent: streamEvents(v2)
  loop 每个 LangGraph 事件
    Agent-->>Service: on_tool_start/on_tool_end/on_chat_model_stream...
    Service-->>Ctrl: 统一事件对象 或 文本分片
    Ctrl-->>View: SSE data: {...}
    View->>Parser: parseChunk(chunk)
    Parser-->>View: thinking 或 markdown
  end
  Ctrl-->>View: end
```

---

## 4. 后端 SSE 协议
控制器位置：`backend/src/controllers/aiChatController.js`

### 4.1 通用字段
- `type`: `meta | text | think | tool_call | tool_result | tool_error`
- `sessionId`: 会话 ID（`meta` 必带，其他事件可带）
- `content`: 文本内容或归一化后的字符串内容

### 4.2 工具事件字段
- `toolName`: 工具名
- `toolCallId`: 工具调用唯一标识（尽力解析）
- `summary`: 后端摘要（优先给前端展示）
- `content`: 后端解包后的主要内容（便于常规展示）
- `rawContent`: 原始内容（便于 debug，默认前端不展示）

### 4.3 示例
#### meta
```json
{ "type": "meta", "sessionId": "7dbc5c9a-..." }
```

#### tool_call
```json
{
  "type": "tool_call",
  "toolName": "maps_weather",
  "toolCallId": "run-abc",
  "summary": "city=杭州",
  "content": "{\"city\":\"杭州\"}",
  "rawContent": "{\"input\":\"{\\\"city\\\":\\\"杭州\\\"}\"}"
}
```

#### text
```json
{ "type": "text", "content": "根据查询结果，杭州今天..." }
```

---

## 5. 后端服务层实现要点
服务位置：`backend/src/services/aiChatService.js`

### 5.1 事件映射
LangGraph 事件映射关系：
- `on_tool_start` -> `tool_call`
- `on_tool_end` -> `tool_result`
- `on_tool_error` -> `tool_error`
- `on_chat_model_stream` -> `text`

### 5.2 工具 payload 解包
`unwrapToolPayload` 会递归解包常见结构：
- `kwargs.content`
- `additional_kwargs.content`
- `data.content`
- `output/result/content/input`

目的：减少前端拿到“套娃 JSON”。

### 5.3 摘要生成
`summarizeToolPayload(toolName, phase, value)` 负责生成 `summary`：
- tool_call 阶段优先提取参数（例如 `city=杭州`）
- 天气工具尝试合成“城市 + 日期 + 温度”摘要
- 兜底为 key-value 摘要或首行文本

### 5.4 异常映射
对模型限流/繁忙等错误统一映射为中文可读提示：
- `Too many requests / throttled / capacity limits / ServiceUnavailable / <503>`
- 归一为 `MODELSCOPE_REQUEST_LIMIT` 类语义

---

## 6. 前端解析器设计
解析器位置：`frontend/src/utils/aiStreamEventParser.js`

### 6.1 输入与输出
输入：SSE `chunk`（包含 `data`）  
输出：`{ sessionId, content }`

其中 `content` 为 t-chatbot 消息分片：
- 工具事件 -> `thinking`（折叠块）
- 模型正文 -> `markdown`

### 6.2 解析策略
1. 先 `parsePayload`。
2. `meta`：只回传 `sessionId`，不渲染。
3. `tool_call/result/error`：
   - 优先 `payload.summary`
   - 无 `summary` 则本地 `pickSummary(...)` 兜底
   - 输出 `thinking`，标题含工具名和阶段
4. `text`：输出 `markdown` 分片。

### 6.3 原文展示策略
- 默认：仅显示摘要，不透出原始结构体。
- `?debug_tool_raw=1`：追加 `rawContent` 片段到折叠块中，便于排障。

---

## 7. AIChatView 中的接入点
视图位置：`frontend/src/views/AIChatView.vue`

### 7.1 请求阶段
`chatServiceConfig.onRequest` 负责：
- 注入 `Authorization`
- 传递 `enable_tools`
- 可选 `debug_stream`

### 7.2 流式阶段
`chatServiceConfig.onMessage`：
1. 调用 `streamEventParser.parseChunk(chunk)`
2. 读取 `sessionId`
3. 返回 `content` 给 t-chatbot 渲染

### 7.3 会话管理阶段
- 新对话：`handleClear` 会重置 parser 状态
- 加载历史会话：`loadSession` 会重置 parser 并替换消息列表

---

## 8. Debug 与联调参数
### 8.1 `debug_stream=1`
- 入口：`/api/ai-chat?debug_stream=1`
- 行为：后端不走模型，发送固定测试文本流（逐字），用于验证 SSE 渲染链路。

### 8.2 `debug_tool_raw=1`
- 入口：前端页面 query 参数
- 行为：前端解析器在工具折叠块中展示 `rawContent` 片段。

---

## 9. 降级与兼容策略
1. `toolName` 缺失：展示 `unknown_tool`。
2. `summary` 缺失：前端本地兜底摘要。
3. payload 不是合法 JSON：按纯文本处理并截断。
4. `meta` 缺失：仍可渲染文本，但会话关联能力下降。

---

## 10. 与虚拟列表文档的关系
本文件关注“消息流解析与展示语义”。  
历史会话性能优化（虚拟渲染）详见：
- `docs/历史会话虚拟渲染实现详解.md`

---

## 11. 答辩讲解建议（3 分钟版）
1. 先讲“协议分层”：后端统一事件类型，前端只做渲染语义转换。
2. 再讲“工具记录与答案分离”：`thinking` 与 `markdown` 各司其职。
3. 再讲“可维护性”：后端 `summary` 优先，前端仅做兜底。
4. 最后讲“可运维”：`debug_stream` 验证链路，`debug_tool_raw` 验证工具原始返回。


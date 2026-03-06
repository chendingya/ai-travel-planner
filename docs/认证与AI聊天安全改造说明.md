# 认证与 AI 聊天安全改造说明（2026-03）

## 1. 改造背景
近期发现两类高风险问题：

1. AI 历史会话查询未严格按用户隔离，存在跨用户读取风险。  
2. 前端可读取并传递访问令牌（`Authorization` 头），存在被 XSS 窃取的风险。

本次改造目标是：

1. **AI 会话全链路强制 user_id 隔离**。  
2. **鉴权切换为纯 HttpOnly Cookie 模式**（前端不持有真实 token）。  
3. 删除“Header Token 兼容回退”，避免安全口子被误开启。

---

## 2. 总体方案

### 2.1 AI 会话隔离
- 后端控制器统一从 `req.user.id` 获取当前用户。
- 服务层查询/更新/删除/插入 AI 会话时统一追加 `user_id` 过滤或写入。
- LangChain 历史存储 `SupabaseMessageHistory` 强制要求 `userId`。

### 2.2 纯 Cookie 鉴权
- 登录/注册成功后，后端下发 `HttpOnly` Cookie（access + refresh）。
- 后续请求由浏览器自动携带 Cookie（`credentials: include`）。
- 后端鉴权中间件仅从 Cookie 取 token，不再接受 Header/Body token。
- 登录接口默认不回传 `session` token（可防止前端再次持有 token）。

---

## 3. 后端改动明细

### 3.1 AI 会话按用户隔离
涉及文件：

- `backend/src/controllers/aiChatController.js`
- `backend/src/services/aiChatService.js`
- `backend/src/services/langchain/SupabaseMessageHistory.js`

关键点：

1. `aiChatController` 在 chat/会话 CRUD/历史接口中把 `userId` 传入 service。  
2. `aiChatService` 中以下方法强制要求 `userId`：  
   - `chat`
   - `createSession`
   - `getSessions`
   - `getSessionHistory`
   - `saveMessage`
   - `deleteSession`
   - `updateSessionTitle`
3. 所有 Supabase 查询链路加 `.eq('user_id', userId)`。  
4. 新建会话或写消息时显式写入 `user_id`。  
5. `SupabaseMessageHistory` 构造函数强制 `options.userId`，并在读写时统一套用户过滤。

---

### 3.2 纯 Cookie 鉴权
涉及文件：

- `backend/src/routes/authRoutes.js`
- `backend/src/middleware/auth.js`
- `backend/src/index.js`

关键点：

1. 新增/启用 Cookie 下发与清理：
   - 登录、注册成功后 `setAuthCookies`。
   - 登出接口 `POST /api/auth/logout` 清除 Cookie。
2. 新增会话探测接口：
   - `GET /api/auth/session`（通过 Cookie 返回当前用户）。
3. `requireAuth` 仅从 Cookie 读取 token，不再支持 `Authorization`、`X-Access-Token`、`body.token` 等入口。
4. `CORS` 在 `credentials=true` 时不使用 `*`，改为回显 Origin，保证浏览器允许 Cookie。

---

## 4. 前端改动明细

涉及文件：

- `frontend/src/main.js`
- `frontend/src/supabase.js`
- `frontend/src/composables/useAuthState.js`
- `frontend/src/components/Auth.vue`

关键点：

1. `fetch` 拦截器对 `/api/*` 统一设置 `credentials: include`。  
2. 删除所有 token 头注入逻辑（`Authorization/X-Authorization/X-Supabase-Access-Token` 等）。  
3. `useAuthState` 登录态刷新依赖 `supabase.auth.getSession()`，而该方法已被改写为调用后端 `/api/auth/session`（cookie 驱动）。  
4. 登录/注册后不再执行 `setSessionFromServer`，只调用后端接口 + `refreshAuthState`。  
5. 登出先请求后端 `/api/auth/logout` 清 Cookie，再清前端状态。

---

## 5. 环境变量

建议配置（见 `backend/.env.example`）：

- `AUTH_ACCESS_COOKIE_NAME=sb-access-token`
- `AUTH_REFRESH_COOKIE_NAME=sb-refresh-token`
- `AUTH_COOKIE_SAMESITE=lax`
- `AUTH_COOKIE_SECURE=false`（本地开发）/`true`（生产 HTTPS）
- `AUTH_COOKIE_DOMAIN=`
- `AUTH_COOKIE_PATH=/`
- `AUTH_HIDE_SESSION_IN_RESPONSE=1`（推荐，默认按纯 Cookie）

---

## 6. 接口行为变更

### 6.1 登录/注册
- `POST /api/auth/login`
- `POST /api/auth/register`

变化：
- 响应可不再包含 `session` token（默认隐藏）。
- 认证凭据通过 `HttpOnly Cookie` 下发。

### 6.2 新增
- `GET /api/auth/session`：返回当前登录用户（基于 Cookie）。
- `POST /api/auth/logout`：清理认证 Cookie。

### 6.3 AI 接口鉴权
- `POST /api/ai-chat`
- `GET /api/ai-chat/sessions`
- `GET /api/ai-chat/history/:id`
- `DELETE /api/ai-chat/history/:id`
- `PATCH /api/ai-chat/sessions/:id`

要求：
- 必须有有效 Cookie。
- 仅返回当前用户数据，不可跨用户访问。

---

## 7. 验收清单

### 7.1 鉴权链路
1. 登录成功后，浏览器存在 `HttpOnly` 的 access cookie。  
2. 请求 `/api/auth/session`（不带 Authorization）可返回当前用户。  
3. 删除 cookie 后，请求 `/api/auth/session` 返回 401。  
4. 仅发送 Authorization 头但不带 cookie，应返回 401。

### 7.2 AI 历史隔离
1. A 用户创建会话并产生消息。  
2. B 用户登录后：
   - `/api/ai-chat/sessions` 不应看到 A 的会话；
   - `/api/ai-chat/history/{A_conversation_id}` 不应读到 A 的消息。

---

## 8. 风险与后续建议

1. 若某些旧页面仍直接依赖“真实 Supabase 前端 token + RLS”，需逐步改为后端 API 驱动。  
2. 生产环境务必开启：
   - `AUTH_COOKIE_SECURE=true`
   - 反向代理 HTTPS
   - 严格 CSP（降低 XSS 风险）。  
3. 建议补充自动化回归用例：
   - 跨用户会话越权测试
   - 仅 Header token 请求被拒绝测试。


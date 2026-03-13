# AI 提供商管理功能说明

## 功能概述

新增“提供商管理”页面（路由：`/provider-config`，入口：个人中心），用于在线维护 Text/Pic/RAG Embedding/RAG Rerank 提供商配置。

目标：

- 统一使用 OpenAI-compatible 结构维护 provider
- API Key 仅后端可见，前端默认脱敏
- API Key 落库前会使用 `PROVIDER_CONFIG_ENCRYPTION_KEY`（AES-256-GCM）加密；未配置该密钥时保存会失败
- 保存前强制连通性校验
- 保存成功后后端热更新，无需重启服务

## 数据来源与优先级

1. 登录用户访问时优先读取 Supabase 表 `ai_provider_configs` 中该 `user_id` 的配置
2. 若表中无配置，则回退 `.env` 中的 `AI_TEXT_PROVIDERS_JSON` / `AI_IMAGE_PROVIDERS_JSON` / `AI_RAG_EMBEDDING_PROVIDERS_JSON` / `AI_RAG_RERANK_PROVIDERS_JSON`
3. 若表中某一类 provider 为空（如 `rag_embedding_providers=[]`），仅该类回退到 `.env` 对应配置，其它类保持 Supabase 值
4. 通过页面保存后写回当前用户行，并立即热更新到该用户后续请求的运行时

## 配置结构

### Text Providers

- `name`
- `enabled`
- `baseURL`
- `apiKey`（保存时可保留原值或替换）
- `priority`
- `models[]`
  - `model`
  - `priority`

### Pic Providers

- `name`
- `enabled`
- `baseURL`
- `apiKey`（保存时可保留原值或替换）
- `model`
- `priority`

说明：

- `name=modelscope` 使用专用图片适配器
- 其它名称默认按 OpenAI-compatible 图片接口适配

### RAG Rerank Providers

- `path` 同时支持：
  - `/rerank`（传统 rerank HTTP 协议，入参 `query+documents`）
  - `/v1/chat/completions` 或 `/v1/responses`（OpenAI-compatible 协议，后端自动适配）

### RAG Embedding Providers

- 使用 OpenAI-compatible embeddings 协议（`/v1/embeddings`）
- 支持 `dimensions` 参数，用于 Matryoshka 截断维度

## 后端接口

所有接口均需要登录（`requireAuth`）：

- `GET /api/provider-config`
  - 返回脱敏配置（不返回明文 API Key）
- `POST /api/provider-config/test`
  - 测试单个 provider 连通性（用于页面行级测试）
- `PUT /api/provider-config`
  - 保存并热更新配置；仅校验本次改动类别的启用项

## 连通性校验规则

- 仅对本次有改动的 provider 类别执行连通性校验（Text / Pic / Embedding / Rerank）
- Text：对改动类别内每个启用 provider 的每个启用 model 执行最小 chat completion 探测
- Pic：对改动类别内每个启用 provider 执行最小图片生成探测
- Embedding：对改动类别内每个启用 provider 执行最小 embeddings 探测
- Rerank：对改动类别内每个启用 provider 执行最小 rerank 探测
- 未启用 provider 不阻塞保存

## 错误语义

- `PROVIDER_CONNECTIVITY_FAILED`：连通性校验失败
- 返回体包含 `details/results`，前端可定位到具体 provider/model 行

## 数据库变更

`supabase-setup.sql` 已新增：

- 表：`public.ai_provider_configs`
- 字段：`user_id`、`text_providers`、`image_providers`、`rag_embedding_providers`、`rag_rerank_providers`、`updated_by`、`created_at`、`updated_at`
- 触发器：`updated_at` 自动更新
- RLS：登录用户仅可读写自己的行（`auth.uid() = user_id`）


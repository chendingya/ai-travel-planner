# Docs

当前文档已按主题拆分为子目录，避免 `docs` 根目录继续平铺堆积。

## 目录结构

- `getting-started/`
  - 快速上手、初始化、开发环境启动
- `operations/`
  - 部署、发布、仓库协作、运维操作
- `product/`
  - PRD、TSD 等需求与技术基线文档
- `architecture/`
  - 系统架构、分层设计、核心运行机制
- `auth/`
  - 登录态、Cookie、Token、安全改造相关文档
- `ai-protocols/`
  - AI 流式协议、工具事件、会话渲染机制
- `features/`
  - 单个业务功能的专题说明文档
- `integrations/`
  - 地图等第三方服务接入说明
- `testing/`
  - 测试用例与验证清单

## 推荐阅读

### 新成员入项

1. [getting-started/QUICKSTART.md](getting-started/QUICKSTART.md)
2. [product/产品需求文档(PRD).md](product/产品需求文档(PRD).md)
3. [architecture/后端架构文档.md](architecture/后端架构文档.md)
4. [product/技术规范文档(TSD).md](product/技术规范文档(TSD).md)

### 排查认证问题

1. [auth/认证机制说明.md](auth/认证机制说明.md)
2. [auth/认证与AI聊天安全改造说明.md](auth/认证与AI聊天安全改造说明.md)
3. [architecture/后端架构文档.md](architecture/后端架构文档.md)

### 排查 AI 流式与工具调用

1. [ai-protocols/AI统一流式事件协议.md](ai-protocols/AI统一流式事件协议.md)
2. [ai-protocols/AI聊天工具事件解析设计.md](ai-protocols/AI聊天工具事件解析设计.md)
3. [ai-protocols/历史会话虚拟渲染实现详解.md](ai-protocols/历史会话虚拟渲染实现详解.md)

### 排查 AI 提供商配置

1. [features/AI提供商管理功能说明.md](features/AI提供商管理功能说明.md)
2. [getting-started/QUICKSTART.md](getting-started/QUICKSTART.md)
3. [architecture/后端架构文档.md](architecture/后端架构文档.md)

### 做业务功能迭代

先看 `features/` 下对应功能说明，再回看 [product/产品需求文档(PRD).md](product/产品需求文档(PRD).md) 和 [product/技术规范文档(TSD).md](product/技术规范文档(TSD).md)。

## 当前归档原则

1. 通用入口、环境搭建、初始化步骤，放 `getting-started/`
2. 运行、部署、仓库协作相关，放 `operations/`
3. 跨模块设计与全局结构，放 `architecture/` 或 `product/`
4. 单功能专题说明，放 `features/`
5. 协议、事件流、前后端联调约定，放 `ai-protocols/`
6. 第三方平台接入说明，放 `integrations/`

后续新增文档时，优先按以上规则归档，避免再次回到平铺结构。

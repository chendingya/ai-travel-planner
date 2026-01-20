# 拾光绘旅

一个基于 AI 的智能旅行规划 Web 应用，帮助用户轻松创建个性化的旅行方案。采用现代化技术栈，提供流畅的用户体验和强大的功能。

> **🚀 首次使用？** 查看 [快速开始指南 (QUICKSTART.md)](./QUICKSTART.md) 快速上手！

## ✨ 核心功能

### 🧠 智能行程规划
- **AI 驱动**：基于阿里云百炼大模型（通义千问）/ GitCode DeepSeek V3.2，智能生成个性化旅行方案
- **多维度输入**：支持目的地、天数、预算、人数、偏好等多维度需求
- **语音输入**：支持语音识别输入目的地信息，提升填写效率
- **结构化输出**：生成包含日程安排、预算分解、旅行提示的完整方案

### 🎨 AI 速记卡片 (拾光·绘影)
- **智能绘图**：基于旅行计划自动生成精美的手绘风格速记卡片
- **多提供商支持**：可切换腾讯云混元生图或魔搭社区 ModelScope
- **提示词优化**：AI 自动生成适合绘图的艺术风格提示词

### 🎵 AI BGM歌单 (听见·山河)
- **智能歌单生成**：基于旅行计划和风格偏好，生成专属旅途BGM歌单
- **风格定制**：支持预设风格选择和自定义风格输入
- **地点关联**：自动关联旅行地点，生成更贴合场景的音乐

### 📮 AI 旅游明信片 (尺素·锦书)
- **明信片生成**：基于旅行计划生成精美的旅游明信片
- **模板选择**：提供古典、现代、手绘、照片拼贴等多种模板
- **个性化文案**：根据旅行地点和活动自动生成个性化明信片内容

### ✍️ AI 分享文案 (妙笔·云章)
- **平台适配**：针对小红书、朋友圈、抖音等不同社交平台特点优化
- **风格选择**：支持种草、治愈、攻略、emo、吐槽等多种文案风格
- **智能生成**：根据旅行计划自动生成高质量分享文案

### 🗺️ 地图可视化
- **高德地图集成**：基于高德地图 API，提供精准的地图展示
- **景点定位**：自动标注每天活动的地理位置
- **交互式查看**：点击时间轴中的活动，地图自动跳转到对应位置
- **路线规划**：显示景点之间的路线和导航信息

### 💰 预算管理
- **智能分解**：AI 自动分解交通、住宿、餐饮、景点、购物等各项费用
- **可视化图表**：饼图展示预算分布，柱状图展示费用对比
- **实时统计**：查看总预算和各项明细

### 👤 用户系统
- **Supabase 认证**：安全可靠的用户注册和登录
- **方案云存储**：保存多个旅行方案到云端，随时查看和管理
- **多设备同步**：数据云端存储，支持跨设备访问

### 🤖 数字人导游
- **智能讲解**：根据用户当前浏览的景点信息，实时生成并播放生动的导游讲解
- **语音播放**：支持多种音色选择，自动播放多段音频，提供暂停、停止等控制功能
- **交互面板**：显示当前讲解的景点信息，提供音色设置和自动播放开关

### 💬 AI面对面对话
- **沉浸式聊天界面**：现代化聊天UI设计，区分用户和AI的消息气泡
- **智能问答**：基于大语言模型，回答关于旅游的各种问题
- **工具增强**：支持火车票查询、网络搜索等MCP工具，提供更全面的旅行服务


## 🛠️ 技术栈

### 前端
- **框架**：Vue.js 3 + Composition API
- **构建工具**：Vite
- **UI 组件**：TDesign Vue Next
- **路由**：Vue Router 4
- **状态管理**：Pinia
- **地图**：高德地图 JS API
- **语音识别**：Web Speech API

### 后端
- **运行时**：Node.js
- **框架**：Express.js
- **AI 服务**：阿里云百炼（通义千问）/ GitCode Deepseek V3.2
- **图片生成**：腾讯云混元生图 / 魔搭社区 ModelScope
- **API 调用**：OpenAI SDK 兼容模式
- **TTS**：后端内置本地合成（Windows 使用 System.Speech 生成音频文件）
- **MCP 工具**：支持火车票查询、网络搜索等工具调用

### 数据库与认证
- **数据库**：Supabase (PostgreSQL)
- **认证**：Supabase Auth
- **存储**：云端数据同步

### 容器化
- **Docker**：容器化部署
- **Docker Compose**：多容器编排

## 📁 项目结构

```
ai-travel-planner/
├── backend/                    # 后端服务
│   ├── src/
│   │   └── index.js           # Express 服务器主文件
│   ├── package.json
│   └── 阿里百炼配置说明.md
│
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── components/        # Vue 组件
│   │   │   ├── Auth.vue      # 用户认证组件
│   │   │   ├── DigitalHuman.vue # 数字人导游组件
│   │   │   ├── ExpenseTracker.vue # 费用追踪
│   │   │   ├── GlassButton.vue # 玻璃态按钮组件（支持 light/dark/primary 主题）
│   │   │   ├── Home.vue      # 首页营销组件
│   │   │   ├── MapView.vue   # 地图组件
│   │   │   ├── MapView_old.vue # 地图旧版本组件
│   │   │   ├── PlanDetail.vue # 方案详情组件
│   │   │   ├── Planner.vue   # 规划表单组件
│   │   │   ├── SavedPlans.vue # 已保存方案列表
│   │   │   ├── SimpleBarChart.vue # 柱状图
│   │   │   └── SimplePieChart.vue # 饼图
│   │   ├── views/            # 页面视图
│   │   │   ├── AIChatView.vue # AI面对面对话页面
│   │   │   ├── ExpenseTrackerView.vue
│   │   │   ├── HomeView.vue
│   │   │   ├── PlanDetailView.vue
│   │   │   ├── PlannerView.vue
│   │   │   ├── SavedPlansView.vue
│   │   │   ├── QuickNoteView.vue # AI 速记卡片生成页面
│   │   │   ├── PlaylistView.vue # AI BGM歌单生成页面
│   │   │   ├── HandbookView.vue # AI 旅游明信片生成页面
│   │   │   └── ShareContentView.vue # AI 分享文案生成页面
│   │   ├── router/           # 路由配置
│   │   ├── stores/           # Pinia 状态管理
│   │   ├── config/           # 配置文件
│   │   ├── utils/            # 工具函数
│   │   ├── styles/           # 全局样式
│   │   ├── App.vue           # 根组件
│   │   ├── main.js           # 入口文件
│   │   ├── runtimeConfig.js  # 运行时配置
│   │   └── supabase.js       # Supabase 客户端
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── 高德地图配置说明.md
│
├── Dockerfile                 # Docker 配置文件
├── docker-compose.yml         # Docker Compose 配置
├── supabase-setup.sql        # 数据库初始化脚本
├── start.ps1                 # Windows 启动脚本
├── stop.ps1                  # Windows 停止脚本
├── QUICKSTART.md             # 快速开始指南
└── README.md                 # 项目说明文件
```

## 🎨 页面说明

### 1. 首页 (`/`)
- 现代化的营销页面设计
- Hero 区域展示产品特色
- 功能卡片介绍核心优势
- 使用教程和技巧说明

### 2. 智能规划 (`/planner`)
- 书本翻页式双卡片布局
- 左侧：旅行规划表单
- 右侧：快速开始指南
- 支持语音输入目的地

### 3. 方案详情 (`/plan-detail`)
- 左侧：方案详情（日程、预算、提示）
- 右侧：地图可视化
- 点击活动跳转地图位置
- 支持保存方案到云端

### 4. 我的计划 (`/saved`)
- 查看所有已保存的旅行方案
- 支持查看方案详情
- 云端数据同步

### 5. AI 速记卡片 (`/quick-note`)
- 基于旅行计划生成精美手绘风格卡片
- 支持切换图片生成提供商（腾讯混元/魔搭社区）
- 显示生成的提示词和图片
- 支持下载和重新生成

### 6. AI BGM歌单 (`/playlist`)
- 基于旅行计划和风格偏好生成专属旅途BGM歌单
- 支持预设风格选择和自定义风格输入
- 自动关联旅行地点，生成贴合场景的音乐
- 支持下载歌单和分享功能

### 7. AI 旅游明信片 (`/handbook`)
- 基于旅行计划生成精美的旅游明信片
- 提供多种明信片模板选择（古典、现代、手绘、照片拼贴）
- 自动生成个性化明信片文案
- 支持下载和重新生成

### 8. AI 分享文案 (`/share-content`)
- 针对不同社交平台生成优化的分享文案
- 支持小红书、朋友圈、抖音等平台选择
- 提供多种文案风格（种草、治愈、攻略、emo、吐槽）
- 支持复制文案到剪贴板和下载功能

### 9. 数字人导游 (`/plan-detail`)
- 悬浮在页面上的交互式数字人组件
- 点击景点时自动展开并生成生动的导游讲解
- 支持多种音色选择和智能分段语音播放
- 提供景点信息和讲解内容的同步展示

### 10. AI面对面对话 (`/ai-chat`)
- 独立的聊天页面，提供与AI旅行助手的深度交流
- 支持文字，模拟面对面交流体验
- 提供普通对话和工具增强两种模式
- 支持火车票查询、网络搜索等MCP工具功能


## 🚀 快速开始

### 前置准备：获取必需的 API 密钥

在启动项目之前，你需要先获取以下 API 密钥：

#### 1. 阿里云百炼 API Key
1. 访问 [阿里云百炼控制台](https://bailian.console.aliyun.com/)
2. 注册/登录阿里云账号并完成实名认证
3. 开通百炼服务（有免费额度）
4. 在 "API-KEY 管理" 中创建新的 API-KEY
5. 复制生成的 API Key（格式：`sk-xxxxxxxxxxxxxxxxxxxxxxxx`）

#### 2. Supabase 配置
1. 访问 [Supabase](https://supabase.com/)
2. 注册并创建一个新项目
3. 在项目设置 → API 中找到：
   - **Project URL** (`SUPABASE_URL`)
   - **anon public key** (`PUBLIC_SUPABASE_ANON_KEY`)
   - **service role key** (`SUPABASE_SERVICE_ROLE_KEY`)
4. 在 SQL Editor 中执行 `supabase-setup.sql` 创建数据表

#### 3. 高德地图 API Key
为保证 JS SDK 与 Web 服务 API 均可正常使用，需要**两个不同类型的 Key**：

1. 访问 [高德开放平台](https://console.amap.com/)，注册并登录账号
2. 创建应用后，在"Key 管理"中分别创建：
   - **Web端(JS API)** Key → 配置到 `PUBLIC_AMAP_KEY`（JS SDK 加载用）
   - **Web服务** Key → 配置到 `PUBLIC_AMAP_REST_KEY`（POI/地理编码等 REST 接口用）
3. 如需开启安全防护，可同时复制 JS Key 对应的 `securityJsCode` 配置到 `PUBLIC_AMAP_SECURITY_CODE`
4. 详细配置说明见：`frontend/高德地图配置说明.md`

### 🎯 方式一：一键启动（Windows 推荐）

**先决条件**：
- Node.js (v16 或更高版本)
- npm 或 yarn

**步骤**：

1. **克隆项目**：
   ```bash
   git clone <你的-github-repo-url>
   cd ai-travel-planner
   ```

2. **配置环境变量**（`backend/.env`）：
   ```bash
   cd backend
   cp .env.example .env
   # 编辑 .env 文件填入：
   # PORT=3001
   # AI_API_KEY=你的AI密钥
   # AI_BASE_URL=https://api.gitcode.com/api/v5
   # AI_MODEL=Kimi-K2
   # DASHSCOPE_API_KEY=你的阿里百炼API密钥（可选）
   # SUPABASE_URL=你的Supabase项目URL
   # SUPABASE_SERVICE_ROLE_KEY=你的Supabase服务端密钥
   # TENCENT_SECRET_ID=腾讯云密钥ID（图片生成）
   # TENCENT_SECRET_KEY=腾讯云密钥（图片生成）
   # MODELSCOPE_API_KEY=魔搭社区API密钥（图片生成，免费）
   # PUBLIC_SUPABASE_URL=供前端使用的 Supabase URL
   # PUBLIC_SUPABASE_ANON_KEY=Supabase 匿名密钥（公开）
   # PUBLIC_AMAP_KEY=高德地图 JS API Key (Web 端)
   # PUBLIC_AMAP_SECURITY_CODE=高德安全密钥（可选，JS Key 专用）
   # PUBLIC_AMAP_REST_KEY=高德地图 Web 服务 Key (REST API 专用)
   ```

   > 前端运行时会通过 `/config.js` 自动读取 `PUBLIC_*` 变量，无需再在 `frontend/.env` 中重复配置。

3. **一键启动**：
   ```powershell
   # 在项目根目录执行
   .\start.ps1
   ```

   该脚本会自动：
   - ✅ 检查配置文件是否存在
   - ✅ 检查 Node.js 是否安装
   - ✅ 安装项目依赖
   - ✅ 启动后端服务器（端口 3001）
   - ✅ 启动前端服务器（端口 5173）
   - ✅ 自动打开浏览器

4. **停止服务**：
   ```powershell
   .\stop.ps1
   ```

### 📋 方式二：手动启动

**适用于**：需要更精细控制或非 Windows 系统

**步骤**：

1. **安装依赖**：
   ```bash
   # 后端
   cd backend
   npm install
   
   # 前端
   cd ../frontend
   npm install
   ```

2. **启动后端**（终端 1）：
   ```bash
   cd backend
   node src/index.js
   ```
   
   成功后显示：
   ```
   ✅ 阿里百炼 API 已配置
   🚀 Server is running on port 3001
   ```

3. **启动前端**（终端 2）：
   ```bash
   cd frontend
   npm run dev
   ```
   
   成功后显示：
   ```
   VITE ready in xxx ms
   ➜ Local: http://localhost:5173/
   ```

4. **访问应用**：
   打开浏览器访问 `http://localhost:5173`

### 🐳 方式三：使用 Docker

**先决条件**：
- Docker 和 Docker Compose

**步骤**：

1. **配置环境变量**：
   ```bash
   # 建议将密钥集中放在 backend/.env（docker run 可用 --env-file backend/.env）
   cd backend
   cp .env.example .env
   # 按需填写私密变量和 PUBLIC_* 变量
   ```

2. **构建并启动**：
   ```bash
   docker-compose up --build
   ```

3. **访问应用**：
   - 前端：`http://localhost:3001`（由 Node 后端统一提供静态资源）
   - 健康检查：`http://localhost:3001/health`

## ⚙️ 配置说明

## ⚙️ 配置说明

### 环境变量配置

**重要**：为保护敏感信息，API 密钥和其他机密信息**绝不能**硬编码在代码中，必须通过环境变量进行管理。

#### 后端环境变量 (`backend/.env`)

```bash
# 私密配置（仅后端使用）
PORT=3001                             # 后端服务器端口

# AI API 配置（用于对话和提示词生成）
AI_API_KEY=sk-xxx...                  # AI API 密钥
AI_BASE_URL=https://api.gitcode.com/api/v5  # API 地址
AI_MODEL=Kimi-K2                      # 模型名称

# 阿里云百炼（可选，备用）
# DASHSCOPE_API_KEY=sk-xxx...          # 阿里云百炼 API 密钥

# Supabase 配置
SUPABASE_URL=https://xxx.supabase.co # Supabase 项目 URL
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...  # Supabase 服务端密钥（严禁暴露给前端）

# 图片生成配置（至少配置一个）
TENCENT_SECRET_ID=xxx...             # 腾讯云 SecretId（混元生图）
TENCENT_SECRET_KEY=xxx...            # 腾讯云 SecretKey
MODELSCOPE_API_KEY=xxx...            # 魔搭社区 API Key（免费额度充足）

# TTS 后端配置（语音合成）
DASHSCOPE_API_KEY=xxx...              # 阿里云 DashScope API Key（语音合成）

# 公开配置（前端运行时读取，仍可设置访问白名单）
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
PUBLIC_AMAP_KEY=xxx...                 # Web端(JS API) Key
PUBLIC_AMAP_SECURITY_CODE=xxx...       # JS 安全密钥 (可选)
PUBLIC_AMAP_REST_KEY=yyy...            # Web服务 Key（必填）
```

> 前端容器运行时会向 `/config.js` 请求配置脚本，该脚本由后端用上述 `PUBLIC_*` 环境变量动态生成。

### AI 模型配置

在 `backend/src/index.js` 中可以修改使用的 AI 模型，或通过 `.env` 配置：

```bash
# .env 配置示例
AI_API_KEY=sk-xxx
AI_BASE_URL=https://api.gitcode.com/api/v5
AI_MODEL=Kimi-K2
```

可用模型：
- `Kimi-K2`（推荐）- GitCode 提供，速度快
- `qwen3-max-preview` - 阿里百炼，性能强
- `qwen-max` - 稳定版本
- `qwen-plus` - 性能与成本平衡
- `qwen-turbo` - 快速响应

### 图片生成配置

支持两种图片生成提供商，可同时配置：

| 提供商 | 配置项 | 特点 |
|--------|--------|------|
| 腾讯云混元 | `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` | 高质量，按量计费 |
| 魔搭社区 | `MODELSCOPE_API_KEY` | 免费额度充足，推荐 |

用户可在 AI 速记卡片页面通过下拉框切换提供商。

## ⚠️ 常见问题

### 启动相关

**Q: 端口已被占用怎么办？**
```bash
# Windows - 查找占用端口的进程
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# 终止进程（将 PID 替换为实际进程 ID）
taskkill /PID <PID> /F
```

**Q: 依赖安装失败？**
- 确保 Node.js 版本 >= 16
- 尝试清除缓存：`npm cache clean --force`
- 删除 `node_modules` 和 `package-lock.json` 后重新安装

### API 相关

**Q: AI API 调用失败？**
- 检查 API Key 是否正确配置在 `backend/.env` 中
- 确认账号余额充足（有免费额度）
- 查看后端终端的错误日志获取详细信息
- 确认模型名称拼写正确

**Q: AI 速记卡片生成失败？**
- 检查是否配置了图片生成提供商（腾讯云或魔搭社区）
- 确认 `TENCENT_SECRET_ID/KEY` 或 `MODELSCOPE_API_KEY` 配置正确
- 建议使用魔搭社区（免费额度充足）
- 查看后端日志了解详细错误

**Q: 前端无法连接后端？**
- 确认后端服务器已启动（端口 3001）
- 检查 `frontend/src/components/Planner.vue` 中的 API 地址是否为 `http://localhost:3001`
- 查看浏览器控制台的网络请求错误

**Q: Supabase 连接失败？**
- 确认 `.env` 文件中的 Supabase URL 和 Key 正确
- 检查 Supabase 项目是否正常运行
- 确认已在 Supabase SQL Editor 中执行 `supabase-setup.sql`

### 地图相关

- 确认 `backend/.env` 中的 PUBLIC_AMAP_KEY / PUBLIC_AMAP_SECURITY_CODE 已配置
- 检查浏览器控制台是否有地图加载错误
- 确认 API Key 类型为 "Web端(JS API)"
- 查看 `frontend/高德地图配置说明.md` 获取详细配置说明

**Q: 地理编码或 POI 搜索报错 `USERKEY_PLAT_NOMATCH`？**
- 确认已在 `.env` 中配置 `PUBLIC_AMAP_REST_KEY`
- 该值必须是高德控制台 **Web服务** 类型的 Key，不能与 JS Key 共用
- 重启后端后刷新前端，确保 `/config.js` 载入了最新配置

**Q: 地图点击事件不响应？**
- 检查地图容器是否正确加载
- 确认活动有坐标数据（coords 字段）
- 查看控制台是否有 JavaScript 错误

### 功能相关

**Q: 语音识别不工作？**
- 确认使用的是支持 Web Speech API 的浏览器（Chrome、Edge）
- 检查浏览器是否允许麦克风权限
- 确保网站使用 HTTPS 或 localhost（语音识别需要安全上下文）

**Q: 方案保存失败？**
- 确认已登录 Supabase 账户
- 检查 Supabase 数据库表是否正确创建
- 查看浏览器控制台的错误信息

## 🔒 安全说明

本项目高度重视安全性，采取以下措施保护敏感信息：

1. **API 密钥保护**：所有 API 密钥都通过环境变量配置，不会硬编码在源代码中
2. **.gitignore 配置**：`.env` 文件已被添加到 `.gitignore` 中，防止意外提交到代码仓库
3. **前端安全**：前端只使用 Supabase 提供的公开匿名密钥，不包含任何私密密钥
4. **后端保护**：后端 API 密钥仅存在于服务器端，不会发送到客户端
5. **HTTPS 推荐**：生产环境建议使用 HTTPS 协议

**安全最佳实践**：
- ✅ 不要将 `.env` 文件提交到 Git 仓库
- ✅ 定期更换 API 密钥
- ✅ 使用强密码策略
- ✅ 为 Supabase 数据库配置适当的行级安全策略（RLS）
- ✅ 限制 API 密钥的使用范围和权限

## 📊 功能检查清单

启动项目后，请确认以下内容：

### ✅ 后端服务检查
- [ ] 终端显示 "✅ AI API 已配置"
- [ ] 终端显示 "🚀 Server is running on port 3001"
- [ ] 访问 http://localhost:3001 能看到欢迎消息

### ✅ 前端服务检查
- [ ] 终端显示 "VITE ready"
- [ ] 终端显示 "Local: http://localhost:5173/"
- [ ] 浏览器能成功打开 http://localhost:5173
- [ ] 页面样式正常显示

### ✅ 核心功能测试
- [ ] 首页正常展示（Hero、功能卡片、教程）
- [ ] 点击"立即开始规划"能跳转到规划页面
- [ ] 填写表单后点击"生成旅行方案"能成功生成
- [ ] 方案详情页左侧显示行程，右侧显示地图
- [ ] 点击时间轴活动能在地图上定位
- [ ] 登录后能保存方案
- [ ] "我的计划"页面能查看已保存的方案

### ✅ AI功能测试
- [ ] "拾光·绘影"页面能生成速记卡片
- [ ] "听见·山河"页面能生成BGM歌单
- [ ] "尺素·锦书"页面能生成旅游明信片
- [ ] "妙笔·云章"页面能生成分享文案
- [ ] AI生成的内容能正常下载和分享

## 🎯 使用流程

1. **访问首页**：了解产品功能和特色
2. **点击"立即开始规划"**：进入智能规划页面
3. **填写旅行信息**：
   - 目的地（支持语音输入）
   - 旅行天数
   - 预算金额
   - 同行人数
   - 偏好与需求
4. **生成方案**：AI 自动生成个性化旅行计划
5. **查看详情**：
   - 左侧：日程安排、预算分解、旅行提示
   - 右侧：地图可视化
   - 点击活动查看地图位置
6. **保存方案**：登录后保存到云端
7. **管理计划**：在"我的计划"中查看和管理所有方案

## 🔗 相关链接

### 官方文档
- [阿里云百炼控制台](https://bailian.console.aliyun.com/)
- [阿里云百炼 API 文档](https://help.aliyun.com/zh/model-studio/developer-reference/api-details)
- [Supabase 官网](https://supabase.com/)
- [高德地图开放平台](https://lbs.amap.com/)

### 技术文档
- [Vue.js 3 文档](https://vuejs.org/)
- [TDesign Vue Next](https://tdesign.tencent.com/vue-next/overview)
- [Vite 文档](https://vitejs.dev/)
- [Express.js 文档](https://expressjs.com/)
- [Pinia 文档](https://pinia.vuejs.org/)

### 项目文档
- [后端架构文档](./docs/后端架构文档.md) - 详细的系统架构设计和技术说明
- [部署指南](./docs/部署指南.md) - 多种部署方式的详细指南
- [阿里百炼配置说明](./backend/阿里百炼配置说明.md)
- [数字人及AI面对面对话功能说明](./docs/数字人及AI面对面对话功能说明.md)
- [AI 速记卡片功能说明](./docs/AI速记卡片功能说明.md)
- [听见山河BGM歌单功能说明](./docs/听见山河BGM歌单功能说明.md)
- [尺素锦书旅游明信片功能说明](./docs/尺素锦书旅游明信片功能说明.md)
- [妙笔云章分享文案功能说明](./docs/妙笔云章分享文案功能说明.md)
- [高德地图配置说明](./frontend/高德地图配置说明.md)
- [快速开始指南](./QUICKSTART.md)

## 📝 开发说明

### 目录结构说明

- `components/`：可复用的 Vue 组件
- `views/`：页面级组件，对应路由
- `router/`：Vue Router 配置
- `stores/`：Pinia 状态管理
- `config/`：配置文件（如高德地图配置）
- `styles/`：全局样式文件

### 添加新页面

1. 在 `views/` 中创建新的页面组件
2. 在 `router/index.js` 中添加路由配置
3. 在 `App.vue` 的导航菜单中添加链接

### 修改 AI 模型

编辑 `backend/src/index.js`：

```javascript
const model = 'qwen3-max-preview';  // 修改为其他模型
```

### 自定义样式

全局样式在 `frontend/src/styles/custom.css` 中定义，包括：
- CSS 变量（颜色、字体等）
- 全局组件样式覆盖
- 通用工具类

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 [GNU General Public License v3.0](LICENSE) 开源许可协议。

您可以在遵循 GPL v3.0 协议的前提下自由使用、修改和分发本项目的源代码。

## 👥 作者

- 项目作者：[chendingya]

---

**Made with ❤️ using Vue.js, Node.js, and AI**

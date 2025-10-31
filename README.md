# AI 旅行规划师

一个旨在简化旅行规划过程的智能 Web 应用程序。它利用 AI 理解用户需求，自动生成详细的旅行路线，并提供实时辅助。

> **🚀 首次使用？** 查看 [快速开始指南 (QUICKSTART.md)](./QUICKSTART.md) 快速上手！

## 核心功能

- **智能行程规划**: 用户可以通过文字或语音输入旅行目的地、日期、预算、同行人数和偏好（例如："我想去日本，5天，预算1万元，喜欢美食和动漫，带孩子"）。AI 将生成个性化的行程，包括交通、住宿、景点和餐饮建议。
- **费用预算与管理**: AI 为规划的行程提供预算分析。用户还可以在旅途中记录开销，并支持语音输入。
- **用户管理与数据存储**:
  - **注册与登录**: 用户可以创建账户以保存、查看和管理多个旅行计划。
  - **云端同步**: 所有旅行计划、用户偏好和费用记录都将同步到云端，方便在多个设备上无缝访问和修改。

## 技术栈

- **前端**: **Vue.js 3** (使用 Vite) 以实现快速、现代化的用户界面。
- **后端**: **Node.js** 与 **Express** 用于构建健壮且可扩展的 REST API。
- **数据库与认证**: **Supabase** 将用于用户管理、认证和数据存储 (PostgreSQL)。
- **大语言模型 (LLM)**: 核心的行程规划和预算生成将由**阿里云百炼（通义千问）**大模型驱动，通过 OpenAI SDK 兼容模式调用。
- **语音识别**: 将使用浏览器内置的 **Web Speech API** 来实现语音转文本功能，从而简化架构并避免额外的 API 密钥。
- **地图服务**: 将使用 **Leaflet** 和 **OpenStreetMap** 来显示地图和位置，因为它不需要 API 密钥。
- **容器化**: **Docker** 和 **Docker Compose** 将用于容器化应用程序，以便于部署和扩展。

## 项目结构

```
.
├── backend/              # Node.js/Express 后端
│   ├── src/
│   └── Dockerfile
├── frontend/             # Vue.js 前端
│   ├── src/
│   └── Dockerfile
├── .github/              # GitHub Actions 工作流
│   └── workflows/
│       └── ci.yml
├── docker-compose.yml    # 用于多容器设置的 Docker Compose 文件
└── README.md
```

## 配置与 API 密钥

**重要提示**: 为保护敏感信息，API 密钥和其他机密信息**绝不能**硬编码在代码中。应通过环境变量进行管理。

每个目录下都有 `.env.example` 文件，你可以复制并重命名为 `.env`，然后填入你自己的配置信息。

### 后端 (`backend/.env`)

```bash
PORT=3001
DASHSCOPE_API_KEY=你的_阿里百炼_API_KEY
SUPABASE_URL=你的_SUPABASE_URL
SUPABASE_KEY=你的_SUPABASE_ANON_KEY
```

### 前端 (`frontend/.env`)

```bash
VITE_SUPABASE_URL=你的_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=你的_SUPABASE_ANON_KEY
```

## 如何运行应用程序

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
   - **anon public key** (`SUPABASE_ANON_KEY`)

### 方式一：本地开发（推荐）

**先决条件**:
- Node.js (v16 或更高版本)
- npm 或 yarn
- Git

**详细步骤**:

#### 第一步：克隆并安装依赖

```bash
# 克隆仓库
git clone <你的-github-repo-url>
cd ai-travel-planner

# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

#### 第二步：配置环境变量

**配置后端**（在 `backend` 目录下）：
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入以下内容：
# PORT=3001
# DASHSCOPE_API_KEY=你的阿里百炼API密钥
# SUPABASE_URL=你的Supabase项目URL
# SUPABASE_KEY=你的Supabase匿名密钥
```

**配置前端**（在 `frontend` 目录下）：
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入以下内容：
# VITE_SUPABASE_URL=你的Supabase项目URL
# VITE_SUPABASE_ANON_KEY=你的Supabase匿名密钥
```

#### 第三步：启动项目

**重要**：需要开启两个终端窗口，分别运行前端和后端。

**终端 1 - 启动后端服务器**：
```bash
cd backend
node src/index.js
```

成功启动后，你会看到：
```
✅ 阿里百炼 API 已配置
🚀 Server is running on port 3001
📍 Backend API: http://localhost:3001
```

**终端 2 - 启动前端开发服务器**：
```bash
cd frontend
npm run dev
```

成功启动后，你会看到：
```
VITE v4.5.14  ready in 2584 ms
➜  Local:   http://localhost:5173/
```

#### 第四步：访问应用

在浏览器中打开：**http://localhost:5173**

### 方式二：使用 Docker

**先决条件**:
- Docker 和 Docker Compose

**步骤**:

1. **配置环境变量**：
   ```bash
   # 在项目根目录创建 .env 文件
   echo "DASHSCOPE_API_KEY=你的阿里百炼API密钥" > .env
   ```

2. **构建并启动容器**:
   ```bash
   docker-compose up --build
   ```

3. **访问应用**：
   - 前端：`http://localhost:8080`
   - 后端：`http://localhost:3001`

### 🎯 快速启动脚本（Windows PowerShell）

项目根目录提供了自动化启动脚本，让启动过程更加简单：

**一键启动项目**：
```powershell
.\start.ps1
```

该脚本会自动：
- ✅ 检查配置文件是否存在
- ✅ 检查 Node.js 是否安装
- ✅ 检查并安装项目依赖
- ✅ 启动后端服务器（端口 3001）
- ✅ 启动前端服务器（端口 5173）
- ✅ 自动打开浏览器

**停止所有服务**：
```powershell
.\stop.ps1
```

**手动启动方式**：

如果你希望手动控制启动过程，可以：

### 🛑 停止项目

在各个终端窗口中按 `Ctrl + C` 即可停止相应的服务器。

### ⚠️ 常见问题

**Q: 端口已被占用怎么办？**
```bash
# Windows - 查找占用端口的进程
netstat -ano | findstr :3001
netstat -ano | findstr :5173

# 终止进程（将 PID 替换为实际进程 ID）
taskkill /PID <PID> /F
```

**Q: 阿里百炼 API 调用失败？**
- 检查 API Key 是否正确配置
- 确认阿里云账号余额充足
- 查看后端终端的错误日志

**Q: 前端无法连接后端？**
- 确认后端服务器已启动（端口 3001）
- 检查 `frontend/src/components/Planner.vue` 中的 API 地址是否为 `http://localhost:3001`

**Q: Supabase 连接失败？**
- 确认 `.env` 文件中的 Supabase URL 和 Key 正确
- 检查 Supabase 项目是否正常运行

## 安全说明

本项目高度重视安全性，采取以下措施保护敏感信息:

1. **API 密钥保护**: 所有 API 密钥都通过环境变量配置，不会硬编码在源代码中
2. **.gitignore 配置**: `.env` 文件已被添加到 `.gitignore` 中，防止意外提交到代码仓库
3. **前端安全**: 前端只使用 Supabase 提供的公开匿名密钥，不包含任何私密密钥
4. **后端保护**: 后端使用 Supabase 服务角色密钥，但该密钥仅存在于服务器端，不会发送到客户端

为确保安全，请务必:
- 不要将 `.env` 文件提交到 Git 仓库
- 定期更换 API 密钥
- 使用强密码策略
- 为 Supabase 数据库配置适当的行级安全策略

## 📊 项目运行检查清单

启动项目后，请确认以下内容：

### ✅ 后端服务检查
1. 终端显示 "✅ 阿里百炼 API 已配置"
2. 终端显示 "🚀 Server is running on port 3001"
3. 访问 http://localhost:3001 应该看到欢迎消息

### ✅ 前端服务检查
1. 终端显示 "VITE ready"
2. 终端显示 "Local: http://localhost:5173/"
3. 浏览器能成功打开 http://localhost:5173

### ✅ 功能测试
1. 在前端页面填写旅行信息
2. 点击 "Generate Plan" 按钮
3. 等待几秒后应该看到 AI 生成的旅行计划

如果遇到任何问题，请查看上方的"常见问题"部分或检查终端的错误日志。

## 🔗 相关链接

- [阿里云百炼控制台](https://bailian.console.aliyun.com/)
- [阿里云百炼 API 文档](https://help.aliyun.com/zh/model-studio/developer-reference/api-details)
- [Supabase 官网](https://supabase.com/)
- [Vue.js 文档](https://vuejs.org/)
- [Express.js 文档](https://expressjs.com/)

## 📝 更多信息

- 详细的阿里百炼配置说明请查看：`backend/阿里百炼配置说明.md`
- 如需修改 AI 模型，请编辑 `backend/src/index.js` 中的 `model` 参数
- 可用模型：`qwen-max`、`qwen-plus`、`qwen-turbo`
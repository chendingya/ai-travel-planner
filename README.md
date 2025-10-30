# AI 旅行规划师

一个旨在简化旅行规划过程的智能 Web 应用程序。它利用 AI 理解用户需求，自动生成详细的旅行路线，并提供实时辅助。

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
- **大语言模型 (LLM)**: 核心的行程规划和预算生成将由大语言模型驱动。应用程序将设计为可与任何主流 LLM API (如 OpenAI, Google Gemini 或私有模型) 兼容。
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
OPENAI_API_KEY=你的_OPENAI_API_KEY
SUPABASE_URL=你的_SUPABASE_URL
SUPABASE_KEY=你的_SUPABASE_ANON_KEY
```

### 前端 (`frontend/.env`)

```bash
VITE_SUPABASE_URL=你的_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=你的_SUPABASE_ANON_KEY
```

## 如何运行应用程序

### 1. 本地开发

**先决条件**:
- Node.js 和 npm
- Git

**步骤**:
1.  **克隆仓库**:
    ```bash
    git clone <你的-github-repo-url>
    cd ai-travel-planner
    ```
2.  **安装后端依赖**:
    ```bash
    cd backend
    npm install
    ```
3.  **安装前端依赖**:
    ```bash
    cd ../frontend
    npm install
    ```
4.  **设置环境变量**: 在 `frontend` 和 `backend` 目录中创建并填充上文所述的 `.env` 文件。
    ```bash
    # 在 backend 目录中
    cp .env.example .env
    # 在 frontend 目录中
    cp .env.example .env
    ```
    然后编辑这两个 `.env` 文件，填入你的实际配置信息。
5.  **启动后端服务器**:
    ```bash
    cd ../backend
    npm start
    ```
6.  **启动前端开发服务器**:
    ```bash
    cd ../frontend
    npm run dev
    ```
应用程序将在 `http://localhost:5173` 上可用。

### 2. 使用 Docker

**先决条件**:
- Docker 和 Docker Compose

**步骤**:
1.  **构建并启动容器**:
    ```bash
    docker-compose up --build
    ```
应用程序将在 `http://localhost:8080` 上可用。

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
# TTS Flask Backend

湖南旅游小程序的语音合成和 AI 对话后端服务，基于 Flask 框架，集成了阿里云 DashScope TTS API 和魔搭社区 LLM。

## 功能特性

- 🗣️ **文字转语音（TTS）**：支持将文本转换为自然流畅的语音
- 🤖 **AI 智能对话**：结合大语言模型提供湖南旅游咨询服务
- 🎤 **多音色支持**：提供多种音色选择（Cherry、Amy、Wendy 等）
- 🌐 **跨域支持**：支持前端跨域请求
- 📦 **长文本分段**：自动处理超长文本，分段生成音频
- 🔄 **异步任务查询**：支持 TTS 任务状态查询

## 技术栈

- **框架**: Flask 3.1.2
- **语音合成**: 阿里云 DashScope (qwen3-tts-flash-2025-11-27)
- **大语言模型**: 魔搭社区 Qwen/Qwen3-235B-A22B-Instruct-2507
- **依赖管理**: uv
- **Python 版本**: 3.11+

## 项目结构

```
tts-flask-backend/
├── main.py              # Flask应用主文件
├── pyproject.toml       # 项目依赖配置
├── .env                 # 环境变量配置（需自行创建）
└── README.md            # 项目说明文档
```

## 安装步骤

### 1. 环境要求

- Python 3.11 或更高版本
- uv 包管理器（推荐）或 pip

### 2. 安装依赖

使用 uv（推荐）：

```bash
# 创建虚拟环境并安装依赖
uv sync
```

使用 pip：

```bash
# 创建虚拟环境
python -m venv .venv

# 激活虚拟环境
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux/Mac:
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# DashScope API配置
DASHSCOPE_API_KEY=your_dashscope_api_key_here
DASHSCOPE_TTS_MODEL=qwen3-tts-flash-2025-11-27

# 魔搭社区 (ModelScope) 配置
MODELSCOPE_API_KEY=your_modelscope_api_key_here
MODELSCOPE_BASE_URL=your_modelscope_base_url_here
MODELSCOPE_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507

# 服务器端口配置
PORT=5000
```

### 4. 获取 API 密钥

#### DashScope API 密钥

1. 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/)
2. 注册/登录账号
3. 在 API-KEY 管理页面创建新的 API 密钥
4. 复制密钥到 `.env` 文件的 `DASHSCOPE_API_KEY`

#### 魔搭社区 API 密钥

1. 访问 [魔搭社区](https://www.modelscope.cn/)
2. 注册/登录账号
3. 在个人中心获取 API 密钥
4. 复制密钥到 `.env` 文件的 `MODELSCOPE_API_KEY`

## 运行服务

### 开发模式

```bash
# 激活虚拟环境（如果尚未激活）
.\.venv\Scripts\Activate.ps1

# 运行服务
python main.py
```

服务将在 `http://localhost:5000` 启动。

### 生产模式

建议使用 Gunicorn（Linux/Mac）或 Waitress（Windows）：

```bash
# Windows
pip install waitress
waitress-serve --port=5000 main:app

# Linux/Mac
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 main:app
```

## API 接口文档

### 1. 健康检查

检查服务是否正常运行。

```http
GET /health
```

**响应示例**：

```json
{
  "status": "ok"
}
```

### 2. 文字转语音

将文本转换为语音，返回任务 ID。

```http
POST /api/tts
Content-Type: application/json
```

**请求参数**：

```json
{
  "text": "欢迎来到湖南旅游",
  "voice": "Cherry",
  "language_type": "Chinese"
}
```

| 参数          | 类型   | 必需 | 默认值  | 说明                            |
| ------------- | ------ | ---- | ------- | ------------------------------- |
| text          | string | 是   | -       | 要转换的文本内容                |
| voice         | string | 否   | Cherry  | 音色选择（Cherry/Amy/Wendy 等） |
| language_type | string | 否   | Chinese | 语言类型                        |

**响应示例**：

```json
{
  "taskId": "abc123def456",
  "model": "qwen3-tts-flash",
  "voice": "Cherry",
  "language_type": "Chinese",
  "text_length": 8
}
```

### 3. 获取 TTS 音频

查询 TTS 任务状态并获取音频 URL。

```http
GET /api/tts/audio/{task_id}
```

**路径参数**：

- `task_id`: TTS 任务 ID

**响应示例（处理中）**：

```json
{
  "status": "processing",
  "task_id": "abc123def456"
}
```

**响应示例（已完成）**：

```json
{
  "status": "completed",
  "audio_url": "https://dashscope.oss-cn-beijing.aliyuncs.com/...",
  "task_id": "abc123def456"
}
```

**响应示例（失败）**：

```json
{
  "status": "failed",
  "error": "语音合成失败",
  "task_id": "abc123def456"
}
```

### 4. AI 智能对话

结合 LLM 和 TTS，提供 AI 对话和语音回复功能。

```http
POST /api/ai-chat
Content-Type: application/json
```

**请求参数**：

```json
{
  "message": "推荐一下湖南的旅游景点",
  "voice": "Cherry",
  "language_type": "Chinese",
  "include_audio": true
}
```

| 参数          | 类型    | 必需 | 默认值  | 说明             |
| ------------- | ------- | ---- | ------- | ---------------- |
| message       | string  | 是   | -       | 用户对话消息     |
| voice         | string  | 否   | Cherry  | 音色选择         |
| language_type | string  | 否   | Chinese | 语言类型         |
| include_audio | boolean | 否   | true    | 是否生成语音回复 |

**响应示例（短文本）**：

```json
{
  "user_message": "推荐一下湖南的旅游景点",
  "ai_response": "湖南有很多著名景点...",
  "voice": "Cherry",
  "language_type": "Chinese",
  "audio_url": "https://dashscope.oss-cn-beijing.aliyuncs.com/..."
}
```

**响应示例（长文本分段）**：

```json
{
  "user_message": "详细介绍一下湖南旅游",
  "ai_response": "湖南是一个充满魅力的省份...",
  "voice": "Cherry",
  "language_type": "Chinese",
  "audio_urls": [
    "https://dashscope.oss-cn-beijing.aliyuncs.com/segment1.mp3",
    "https://dashscope.oss-cn-beijing.aliyuncs.com/segment2.mp3"
  ]
}
```

## 音色列表

支持的音色包括但不限于：

- **Cherry** - 甜美女声（默认）
- **Amy** - 温柔女声
- **Wendy** - 知性女声
- **Eric** - 成熟男声
- **Andy** - 阳光男声

详细音色列表请参考 [DashScope TTS 文档](https://help.aliyun.com/zh/model-studio/developer-reference/cosyvoice-overview)。

## 错误处理

API 返回的错误信息格式：

```json
{
  "error": "错误类型",
  "message": "详细错误描述",
  "code": "错误代码（可选）"
}
```

常见错误代码：

- `InvalidParameter` - 参数无效
- `InvalidApiKey` - API 密钥无效
- `QuotaExceeded` - 配额已用完
- `TextTooLong` - 文本过长

## 开发说明

### 长文本处理策略

当文本字节长度超过 600 字节时，系统会自动：

1. 按句号、问号、感叹号智能分段
2. 保持每段不超过 600 字节
3. 为每段单独生成音频
4. 返回音频 URL 数组

### CORS 配置

默认允许所有域的跨域请求，生产环境建议配置具体的允许域：

```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://your-frontend-domain.com"]
    }
})
```

### 日志输出

服务会输出详细的调试日志，包括：

- 🗣️ TTS 调用信息
- 🤖 LLM 调用信息
- ✅ 成功状态
- ❌ 错误信息
- 📏 文本长度统计

## 部署建议

### Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install uv && uv pip install --system -r pyproject.toml

COPY . .

EXPOSE 5000

CMD ["python", "main.py"]
```

构建和运行：

```bash
docker build -t tts-flask-backend .
docker run -p 5000:5000 --env-file .env tts-flask-backend
```

### 环境变量检查

启动前确保以下环境变量已配置：

```bash
# 检查DashScope配置
echo $DASHSCOPE_API_KEY

# 检查魔搭社区配置
echo $MODELSCOPE_API_KEY
```

## 故障排查

### TTS 功能不可用

- 检查 `DASHSCOPE_API_KEY` 是否正确配置
- 确认 API 密钥有足够的配额
- 查看控制台日志中的错误信息

### AI 对话无响应

- 检查 `MODELSCOPE_API_KEY` 是否正确配置
- 确认网络可以访问魔搭社区 API
- 查看是否有超时错误

### 音频生成失败

- 检查文本是否包含特殊字符
- 确认文本长度是否合理
- 查看是否触发了配额限制

## 许可证

MIT License

## 相关链接

- [阿里云 DashScope 文档](https://help.aliyun.com/zh/model-studio/)
- [魔搭社区](https://www.modelscope.cn/)
- [Flask 文档](https://flask.palletsprojects.com/)
- [项目仓库](https://github.com/yourusername/hunan_travel)

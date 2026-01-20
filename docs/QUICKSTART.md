# 快速开始指南 - 拾光绘旅

## 5 分钟快速启动

### 1️⃣ 获取 API 密钥（3分钟）

#### 阿里百炼 API Key
1. 访问 https://bailian.console.aliyun.com/
2. 注册并登录阿里云账号
3. 开通百炼服务（免费）
4. 创建 API-KEY，复制保存

#### Supabase 配置
1. 访问 https://supabase.com/
2. 创建新项目
3. 在设置 → API 中复制：
   - Project URL
   - anon public key

### 2️⃣ 配置项目（1分钟）

```powershell
# 配置后端
cd backend
copy .env.example .env
# 编辑 .env，填入你的 API 密钥以及 PUBLIC_* 前端运行时配置
```

### 3️⃣ 启动项目（1分钟）

```powershell
# 回到项目根目录
cd ..

# 运行启动脚本
.\start.ps1
```

**💡 提示**: 如果遇到端口占用问题，请先运行 `.\stop.ps1` 停止服务，然后重新运行 `.\start.ps1`

就这么简单！🎉

## 配置文件示例

### backend/.env

```env
# ========== 服务器配置 ==========
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# ========== AI 文本提供商配置（JSON 格式）==========
# 支持配置多个提供商，自动降级
AI_TEXT_PROVIDERS_JSON='[
  {
    "name": "gitcode",
    "enabled": true,
    "baseURL": "https://api.gitcode.com/api/v5",
    "apiKey": "你的GitCode密钥",
    "model": "Kimi-K2",
    "priority": 1
  },
  {
    "name": "dashscope",
    "enabled": true,
    "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKey": "你的阿里百炼密钥",
    "model": "qwen-max",
    "priority": 2
  }
]'

# ========== AI 图片提供商配置（JSON 格式）==========
AI_IMAGE_PROVIDERS_JSON='[
  {
    "name": "modelscope",
    "enabled": true,
    "apiKey": "你的魔搭社区API密钥",
    "priority": 1
  }
]'

# ========== Supabase 数据库配置 ==========
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ你的服务端密钥...

# ========== 前端公开配置（通过 /config.js 注入）==========
PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ你的匿名密钥...

# ========== 高德地图配置 ==========
PUBLIC_AMAP_KEY=你的Web端JS_API_Key          # 必填：前端加载地图 SDK
PUBLIC_AMAP_SECURITY_CODE=你的安全密钥      # 可选：JS 安全密钥
PUBLIC_AMAP_REST_KEY=你的Web服务Key          # 必填：POI/地理编码 REST 接口

# ========== MCP 工具配置（可选，用于增强 AI 聊天）==========
# 12306 火车票查询
MCP_12306_URL=https://mcp.api-inference.modelscope.net/xxx/sse
MCP_12306_AUTHORIZATION=Bearer xxx

# 高德地图服务
MCP_AMAP_URL=你的高德MCP服务URL
MCP_AMAP_AUTHORIZATION=Bearer xxx

# Bing 搜索
MCP_BING_URL=你的Bing MCP服务URL
MCP_BING_AUTHORIZATION=Bearer xxx
```

### 配置说明

1. **AI 文本提供商** (`AI_TEXT_PROVIDERS_JSON`)
   - 支持配置多个提供商（GitCode、阿里百炼、OpenAI 等）
   - 按优先级自动降级，提高可靠性
   - 至少需要配置一个启用的提供商

2. **AI 图片提供商** (`AI_IMAGE_PROVIDERS_JSON`)
   - 目前支持魔搭社区 ModelScope
   - 建议使用魔搭社区（免费额度充足）

3. **Supabase 配置**
   - `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 用于后端服务
   - `PUBLIC_SUPABASE_URL` 和 `PUBLIC_SUPABASE_ANON_KEY` 用于前端

4. **高德地图配置**
   - `PUBLIC_AMAP_KEY` 和 `PUBLIC_AMAP_REST_KEY` 必须是两个不同的 Key
   - 详见 [高德地图配置说明](./高德地图配置说明.md)

5. **MCP 工具配置**（可选）
   - 用于增强 AI 聊天的功能
   - 支持 12306 火车票查询、高德地图、Bing 搜索等

## 验证是否成功

### 后端终端显示

```
✓ All services initialized successfully
Available text providers: gitcode, dashscope
Available image providers: modelscope
MCP servers ready: 12306(tools:2), amap(tools:3)
🚀 Server is running on http://0.0.0.0:3001
📚 API documentation: http://0.0.0.0:3001/api
❤️  Health check: http://0.0.0.0:3001/health
```

### 前端终端显示

```
VITE v4.5.14  ready in 2584 ms
➜  Local:   http://localhost:5173/
```

### 浏览器访问

✅ 浏览器自动打开 http://localhost:5173

### 验证配置

访问后端健康检查接口：

```bash
curl http://localhost:3001/health
```

应该返回：

```json
{
  "status": "ok",
  "timestamp": "2025-01-20T10:00:00.000Z",
  "providers": {
    "text": 2,
    "image": 1
  }
}
```

访问前端配置接口：

```bash
curl http://localhost:3001/config.js
```

应该返回类似：

```javascript
window.__APP_CONFIG__ = {
  "supabaseUrl": "https://你的项目.supabase.co",
  "supabaseAnonKey": "eyJxxx...",
  "amapKey": "你的Key",
  "amapSecurityCode": "你的安全密钥",
  "amapRestKey": "你的Web服务Key"
};
```

## 遇到问题？

### 常见错误及解决方案

**❌ 端口被占用 (EACCES / EADDRINUSE)**
```powershell
# 运行停止脚本释放端口
.\stop.ps1

# 或手动查找并终止进程
netstat -ano | findstr :5173  # 前端
netstat -ano | findstr :3001  # 后端
taskkill /PID <进程ID> /F
```

**❌ API 调用失败**
- 检查 `backend\.env` 中的 `AI_TEXT_PROVIDERS_JSON` 配置是否正确
- 确认 API 密钥格式正确（JSON 字符串需要转义引号）
- 确认账号余额充足或有免费额度
- 查看后端终端窗口的详细错误信息
- 确认至少配置了一个启用的文本提供商

**❌ AI 速记卡片生成失败**
- 检查 `backend\.env` 中的 `AI_IMAGE_PROVIDERS_JSON` 配置是否正确
- 确认至少配置了一个启用的图片生成提供商（魔搭社区）
- 确认魔搭社区 API 密钥有效且有免费额度
- 建议优先使用魔搭社区（免费额度充足）

**❌ 页面空白或无法加载**
- 按 F12 打开浏览器控制台查看错误
- 检查 `backend\.env` 中的 PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY 是否正确
- 确认后端服务是否正常运行 (访问 http://localhost:3001)

**❌ 权限错误 (permission denied)**
- 以管理员身份运行 PowerShell
- 右键点击 PowerShell → 选择"以管理员身份运行"
- 或者关闭占用端口的其他程序

更多帮助请查看主 README.md 文件的"⚠️ 常见问题"章节。

## 📚 更多文档

- **[后端架构文档](./后端架构文档.md)** - 详细的系统架构设计和技术说明
- **[部署指南](./部署指南.md)** - Docker、云平台等多种部署方式
- **[高德地图配置说明](./高德地图配置说明.md)** - 高德地图 API 详细配置

## 🔧 进阶配置

### 启用 MCP 工具（增强 AI 聊天）

如需使用 12306 火车票查询、高德地图搜索、Bing 搜索等工具，在 `.env` 中配置：

```env
MCP_12306_URL=https://mcp.api-inference.modelscope.net/xxx/sse
MCP_12306_AUTHORIZATION=xxx
MCP_AMAP_URL=你的高德MCP服务URL
MCP_AMAP_AUTHORIZATION=xxx
MCP_BING_URL=你的Bing MCP服务URL
MCP_BING_AUTHORIZATION=xxx
```

### 多提供商配置

通过 `priority` 字段设置提供商优先级，实现自动降级：

```json
[
  {
    "name": "gitcode",
    "enabled": true,
    "baseURL": "https://api.gitcode.com/api/v5",
    "apiKey": "sk-xxx",
    "model": "Kimi-K2",
    "priority": 1
  },
  {
    "name": "dashscope",
    "enabled": true,
    "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKey": "sk-yyy",
    "model": "qwen-max",
    "priority": 2
  }
]
```

系统会优先使用 `priority=1` 的提供商，失败时自动切换到 `priority=2`。

---

**最后更新：2025-01-20**

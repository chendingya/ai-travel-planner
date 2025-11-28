# 快速开始指南 - AI 旅行规划师

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
PORT=3001

# AI API 配置
AI_API_KEY=sk-你的AI密钥
AI_BASE_URL=https://api.gitcode.com/api/v5
AI_MODEL=Kimi-K2

# 阿里百炼（备选）
# DASHSCOPE_API_KEY=sk-你的阿里百炼密钥
# DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# DASHSCOPE_AI_MODEL=qwen3-max-preview

# Supabase 配置
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的Supabase服务密钥

# 图片生成配置（至少配置一个）
# 方案一：腾讯云混元生图
TENCENT_SECRET_ID=你的腾讯云SecretId
TENCENT_SECRET_KEY=你的腾讯云SecretKey

# 方案二：魔搭社区（免费额度充足）
MODELSCOPE_API_KEY=你的魔搭社区API密钥

# 前端运行时配置
PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
PUBLIC_SUPABASE_ANON_KEY=你的Supabase匿名密钥
PUBLIC_AMAP_KEY=你的高德 JS API Key (Web端)
PUBLIC_AMAP_SECURITY_CODE=你的高德安全密钥 (可选)
PUBLIC_AMAP_REST_KEY=你的高德 Web 服务 Key (REST 必填)
```

## 验证是否成功

✅ 后端终端显示：
```
✅ AI API 已配置 (Kimi-K2)
✅ 腾讯混元生图已配置
✅ 魔搭社区图片生成已配置
🚀 Server is running on port 3001
```

✅ 前端终端显示：
```
VITE v4.5.14  ready in 2584 ms
➜  Local:   http://localhost:5173/
```

✅ 浏览器自动打开 http://localhost:5173

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
- 检查 `backend\.env` 中的 `AI_API_KEY` 或 `DASHSCOPE_API_KEY` 是否正确
- 确认账号余额充足或有免费额度
- 查看后端终端窗口的详细错误信息

**❌ AI速记卡片生成失败**
- 检查是否配置了图片生成提供商（腾讯云或魔搭社区）
- 确认 `TENCENT_SECRET_ID/KEY` 或 `MODELSCOPE_API_KEY` 配置正确
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

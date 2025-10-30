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
# 编辑 .env，填入你的 API 密钥

# 配置前端
cd ../frontend
copy .env.example .env
# 编辑 .env，填入你的 Supabase 配置
```

### 3️⃣ 启动项目（1分钟）

```powershell
# 回到项目根目录
cd ..

# 运行启动脚本
.\start.ps1
```

就这么简单！🎉

## 配置文件示例

### backend/.env
```env
PORT=3001
DASHSCOPE_API_KEY=sk-你的阿里百炼密钥
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_KEY=你的Supabase匿名密钥
```

### frontend/.env
```env
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的Supabase匿名密钥
```

## 验证是否成功

✅ 后端终端显示：
```
✅ 阿里百炼 API 已配置
🚀 Server is running on port 3001
```

✅ 前端终端显示：
```
VITE v4.5.14  ready in 2584 ms
➜  Local:   http://localhost:5173/
```

✅ 浏览器自动打开 http://localhost:5173

## 遇到问题？

- 端口被占用 → 关闭占用端口的程序或修改 .env 中的 PORT
- API 调用失败 → 检查 API Key 是否正确
- 页面空白 → 查看浏览器控制台的错误信息

更多帮助请查看主 README.md 文件。

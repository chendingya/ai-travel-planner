# 后端服务说明

## 📁 项目结构

```
backend/
├── src/
│   └── index.js          # 主服务器入口文件 (唯一运行的文件)
├── .env                  # 环境变量配置 (本地,不提交到 Git)
├── .env.example          # 环境变量示例
├── package.json          # 依赖和启动脚本
├── Dockerfile            # Docker 容器配置
└── 阿里百炼配置说明.md    # API 配置文档
```

## 🚀 入口文件

**唯一的服务器入口**: `src/index.js`

- `package.json` 中配置: `"main": "src/index.js"`
- 启动命令: `npm start` → 运行 `node src/index.js`
- **端口**: 3001 (默认)

## 🔧 核心功能

### 1. AI 旅行计划生成 (`POST /api/plan`)

使用阿里百炼 DashScope API (通义千问 qwen3-max-preview 模型) 生成结构化的旅行计划。

**返回格式**: 严格的 JSON 结构

```json
{
  "plan": {
    "daily_itinerary": [
      {
        "day": 1,
        "theme": "主题",
        "activities": [
          {
            "time": "09:00",
            "location": "景点名称",
            "description": "活动描述",
            "latitude": 35.6762,
            "longitude": 139.6503
          }
        ]
      }
    ],
    "budget_breakdown": {
      "transportation": 1000,
      "accommodation": 3000,
      "meals": 2000,
      "attractions": 1500,
      "shopping": 1500,
      "other": 1000
    },
    "tips": ["建议1", "建议2"]
  },
  "isStructured": true
}
```

### 2. Prompt 工程

**System Prompt**:
- 明确要求返回 JSON 格式,不允许任何额外文字
- 提供详细的 JSON 结构示例
- 强制要求每个活动包含经纬度坐标

**User Prompt**:
- 包含目的地、时长、预算、人数、偏好
- 明确每天活动数量 (3-6个)
- 要求提供准确的经纬度坐标以便地图定位

### 3. JSON 解析容错

代码会自动处理 AI 可能返回的 markdown 代码块:
- 去除 ` ```json ` 和 ` ``` ` 标记
- 如果 JSON 解析失败,返回原始文本 + `isRawText: true` 让前端降级处理

## 🔑 环境变量

必需的环境变量 (配置在 `.env` 文件中):

```env
DASHSCOPE_API_KEY=sk-xxx           # 阿里百炼 API 密钥
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx      # Supabase 服务端密钥
PORT=3001                          # 可选,默认 3001
```

## 📝 启动步骤

1. 安装依赖:
   ```bash
   npm install
   ```

2. 配置环境变量:
   - 复制 `.env.example` 为 `.env`
   - 填写 API 密钥

3. 启动服务:
   ```bash
   npm start
   ```

4. 验证运行:
   - 访问 `http://localhost:3001`
   - 应该看到: "Hello from AI Travel Planner Backend! 🚀"

## 🔐 安全提醒

- ✅ **所有 API 密钥通过环境变量配置,不要硬编码**
- ✅ **`.env` 文件已在 `.gitignore` 中,不会提交到 Git**
- ✅ **使用 SUPABASE_SERVICE_ROLE_KEY (服务端密钥) 而非客户端密钥**

## 🐛 常见问题

### Q: 修改代码后不生效?
A: 确保修改的是 `src/index.js` (不是根目录的 `index.js`,已删除)

### Q: AI 返回的不是 JSON?
A: 检查控制台日志,可能是:
  - API 密钥错误
  - 模型返回了文本 (会自动降级为 `isRawText: true`)
  - Prompt 可以微调 temperature 参数 (当前 0.7)

### Q: 端口冲突?
A: 在 `.env` 中设置 `PORT=其他端口`

## 🔄 架构重构说明 (2024)

之前存在 **两个 `index.js` 文件** 导致混淆:
- ❌ `backend/index.js` (已删除) - 根目录旧文件
- ✅ `backend/src/index.js` (当前使用) - 实际运行的文件

**package.json 明确指定**: `"main": "src/index.js"` 和 `"start": "node src/index.js"`

现在项目结构清晰,只有一个入口文件!

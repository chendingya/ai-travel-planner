require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3001;

// 前端运行时配置（仅暴露允许公开的密钥）
const runtimeConfig = {
  supabaseUrl: process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.PUBLIC_SUPABASE_ANON_KEY || '',
  amapKey: process.env.PUBLIC_AMAP_KEY || '',
  amapSecurityCode: process.env.PUBLIC_AMAP_SECURITY_CODE || '',
  amapRestKey: process.env.PUBLIC_AMAP_REST_KEY || process.env.AMAP_REST_KEY || ''
};

// 检查必要的环境变量
if (!process.env.DASHSCOPE_API_KEY) {
  console.warn('警告: DASHSCOPE_API_KEY 未设置,AI 行程规划功能将不可用');
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('警告: Supabase 配置不完整,相关功能可能无法正常工作');
}

// 初始化阿里百炼客户端(使用 OpenAI SDK 兼容模式)
let openai = null;
if (process.env.DASHSCOPE_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  });
  console.log('✅ 阿里百炼 API 已配置');
}

app.use(cors());
app.use(express.json());

// 静态资源（前端打包产物）
const staticDir = path.join(__dirname, '..', 'public');
app.use(express.static(staticDir));

// 供前端在运行时动态加载公开配置
app.get('/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  const safeConfig = {
    supabaseUrl: runtimeConfig.supabaseUrl,
    supabaseAnonKey: runtimeConfig.supabaseAnonKey,
    amapKey: runtimeConfig.amapKey,
    amapSecurityCode: runtimeConfig.amapSecurityCode,
    amapRestKey: runtimeConfig.amapRestKey
  };
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify(safeConfig)};`);
});

// 根路径：优先返回前端 index.html，若不存在则返回文本
app.get('/', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.send('Hello from AI Travel Planner Backend! 🚀');
    }
  });
});

// 健康检查端点供 CI/CD 与监控使用
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/plan', async (req, res) => {
  // 如果没有配置阿里百炼 API,则返回错误
  if (!openai) {
    return res.status(500).json({ 
      error: 'AI 功能当前不可用 - 未配置 API 密钥',
      message: '系统管理员需要配置阿里百炼 API 密钥才能使用 AI 行程规划功能'
    });
  }

  try {
    const { destination, duration, budget, travelers, preferences } = req.body;

    console.log(`📝 正在为 ${destination} 生成 ${duration} 天的旅行计划...`);

  const systemPrompt = `你是一个专业的旅行规划助手。必须严格返回纯 JSON，且遵守以下约束：

必备规则：
1) 仅 JSON，无任何额外文字/标题/标记
2) 严禁包含经纬度坐标（如 latitude/longitude/coords）
3) 所有地点均应在“目的地城市及其行政区”范围内，避免跨省/跨市的同名地点
4) 使用官方中文名称；若可能含糊，请补充区县(district)与地址(address)
5) 每天 3-6 个活动，按时间顺序，考虑通勤/游览时长
6) daily_itinerary 中每一天必须包含 hotel 字段，给出当晚建议入住酒店，提供 name/city/district/address/notes 字段
7) accommodation 数组必须列出所有建议酒店，并通过 days 或 day_range 表明对应天数
8) 除非确有跨城或夜间移动需求，应尽量保持全程使用同一家酒店，可通过 days/day_range 标识覆盖多天
  9) 第 N 天的夜宿酒店就是第 N+1 天的出发地：从第 2 天起，activities 的首条记录必须说明“从上一晚酒店出发”并沿用该酒店的名称、城市、区县与地址；若确需更换城市，请在上一天 hotel.notes 中说明原因和跨城方式

推荐结构示例：
{
  "daily_itinerary": [
    {
      "day": 1,
      "theme": "抵达与初探",
      "hotel": {
        "name": "新宿格拉斯丽酒店",
        "city": "东京",
        "district": "新宿区",
        "address": "日本东京都新宿区歌舞伎町1-19-1",
        "notes": "靠近歌舞伎町与地铁站，方便晚间活动后返回"
      },
      "activities": [
        {
          "time": "09:00",
          "location": "成田国际机场",
          "city": "东京",
          "district": "成田市",
          "address": "日本千叶县成田市古込1-1",
          "description": "抵达成田机场,办理入境手续"
        },
        {
          "time": "12:00",
          "location": "秋叶原",
          "city": "东京",
          "district": "千代田区",
          "address": "(可选)",
          "description": "参观动漫街区,逛动漫商店"
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
  "transport": {
    "in_city": "优先公共交通/打车，避开高峰",
    "to_city": "建议的往返交通方式与大致耗时"
  },
  "accommodation": [
    {
      "name": "新宿格拉斯丽酒店",
      "city": "东京",
      "district": "新宿区",
      "address": "日本东京都新宿区歌舞伎町1-19-1",
      "days": "D1-D3",
      "notes": "步行可达新宿站，便于第二天游览"
    }
  ],
  "restaurants": [
    { "name": "示例餐厅B", "city": "东京", "district": "涩谷区", "address": "...", "tags": ["美食","亲子"] }
  ],
  "tips": [
    "购买交通卡如 Suica 或 Pasmo 方便出行",
    "提前预约热门景点门票"
  ]
}`;

  const userPrompt = `请为我制定一个${duration}天的${destination}旅行计划：

基本信息：
- 目的地：${destination}
- 时长：${duration}天
- 预算：${budget}元
- 人数：${travelers}人
- 偏好：${preferences || '无特殊偏好'}

要求：
1) 每天安排3-6个具体景点或活动，且活动仅限于目的地城市及其行政区
2) 不要输出经纬度坐标，只给出 location/city/district/address(可选) 与 description
3) 活动时间要符合实际（考虑通勤与游览时间）
4) 预算分配合理，并给出餐饮/住宿/交通/门票等建议
5) 偏好（如动漫/美食/亲子等）需体现在景点与餐厅选择中
6) 每一天必须给出当晚入住酒店 (hotel)，并在 accommodation 中总结所有酒店及适用天数
7) 除非确有跨城或夜间移动需求，尽量使用同一家酒店覆盖整个行程，并在 accommodation.days/day_range 中明确范围

请严格按照纯 JSON 格式返回，无任何额外说明文字或标记。`;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt }, 
        { role: 'user', content: userPrompt }
      ],
      model: 'qwen3-max-preview',
      temperature: 0.7,
    });

    let planText = completion.choices[0].message.content.trim();
    
    // 尝试提取 JSON(去除可能的 markdown 代码块标记)
    if (planText.startsWith('```json')) {
      planText = planText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (planText.startsWith('```')) {
      planText = planText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // 尝试解析 JSON
    let planData;
    try {
      planData = JSON.parse(planText);
      console.log('✅ 旅行计划生成成功(结构化 JSON)!');
    } catch (parseError) {
      console.error('⚠️ JSON 解析失败,返回原始文本:', parseError.message);
      // 如果解析失败,返回原始文本让前端处理
      return res.json({ plan: planText, isRawText: true });
    }

    res.json({ plan: planData, isStructured: true });
  } catch (error) {
    console.error('❌ Error generating plan:', error);
    res.status(500).json({ 
      error: 'Failed to generate travel plan',
      message: '生成旅行计划时发生错误,请稍后再试',
      details: error.message
    });
  }
});

// 解析旅行信息的 API
app.post('/api/parse-travel-info', async (req, res) => {
  if (!openai) {
    return res.status(500).json({ 
      error: 'AI 功能当前不可用 - 未配置 API 密钥'
    });
  }

  try {
    const { text } = req.body;

    console.log(`🔍 正在解析旅行信息: "${text}"`);

    const systemPrompt = `你是一个智能文本解析助手。请从用户输入的自然语言中提取旅行相关信息，并返回JSON格式。

返回格式示例：
{
  "destination": "日本东京",
  "duration": 5,
  "budget": 10000,
  "travelers": 2,
  "preferences": "喜欢美食和动漫"
}

规则：
1. 只返回JSON,不要有任何额外文字
2. 如果某个信息未提及,该字段返回null
3. duration(天数)、budget(预算)、travelers(人数)必须是数字
4. preferences(偏好)提取用户提到的兴趣爱好、特殊需求等`;

    const userPrompt = `请从以下文本中提取旅行信息：\n\n${text}`;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt }, 
        { role: 'user', content: userPrompt }
      ],
      model: 'qwen3-max-preview',
      temperature: 0.3,
    });

    let resultText = completion.choices[0].message.content.trim();
    
    // 去除可能的 markdown 代码块标记
    if (resultText.startsWith('```json')) {
      resultText = resultText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // 解析 JSON
    const parsedData = JSON.parse(resultText);
    console.log('✅ 文本解析成功:', parsedData);
    
    res.json(parsedData);
  } catch (error) {
    console.error('❌ Error parsing travel info:', error);
    res.status(500).json({ 
      error: 'Failed to parse travel info',
      message: '解析旅行信息时发生错误'
    });
  }
});

// SPA 回退：将除 /api 与 /health 外的 GET 请求指向前端 index.html
app.get(/^(?!\/api|\/health).*/, (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});


app.listen(port, () => {
  console.log(`\n🚀 Server is running on port ${port}`);
  console.log(`📍 Backend API: http://localhost:${port}`);
  
  // 显示配置状态
  console.log('\n=== 配置状态 ===');
  console.log(`✓ 阿里百炼 API: ${openai ? '已配置 ✅' : '未配置 ❌'}`);
  console.log(`✓ Supabase: ${process.env.SUPABASE_URL ? '已配置 ✅' : '未配置 ❌'}`);
  console.log(`✓ 前端可见 Supabase Anon Key: ${runtimeConfig.supabaseAnonKey ? '已注入 ✅' : '未注入 ❌'}`);
  console.log(`✓ 高德地图 Key: ${runtimeConfig.amapKey ? '已注入 ✅' : '未注入 ❌'}`);
  
  // 显示安全提醒
  console.log('\n=== 🔒 安全提醒 ===');
  console.log('✓ 确保您的 API 密钥没有被硬编码在代码中');
  console.log('✓ 所有的密钥应该通过环境变量配置');
  console.log('✓ 请勿将 .env 文件提交到版本控制系统中\n');
});

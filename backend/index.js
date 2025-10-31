const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 检查必要的环境变量
if (!process.env.DASHSCOPE_API_KEY) {
  console.warn('警告: DASHSCOPE_API_KEY 未设置，AI 行程规划功能将不可用');
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('警告: Supabase 配置不完整，相关功能可能无法正常工作');
}

// 初始化阿里百炼客户端（使用 OpenAI SDK 兼容模式）
let openai = null;
if (process.env.DASHSCOPE_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  });
}

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.post('/api/plan', async (req, res) => {
  // 如果没有配置阿里百炼 API，则返回错误
  if (!openai) {
    return res.status(500).json({ 
      error: 'AI 功能当前不可用 - 未配置 API 密钥',
      message: '系统管理员需要配置阿里百炼 API 密钥才能使用 AI 行程规划功能'
    });
  }

  try {
    const { destination, duration, budget, travelers, preferences } = req.body;

    const systemPrompt = `你是一个专业的旅行规划助手。你必须严格按照以下 JSON 格式返回旅行计划，不要添加任何额外的文字说明、标题或格式化标记。

返回格式示例：
{
  "daily_itinerary": [
    {
      "day": 1,
      "theme": "抵达与初探",
      "activities": [
        {
          "time": "09:00",
          "location": "成田国际机场",
          "description": "抵达成田机场，办理入境手续",
          "latitude": 35.7648,
          "longitude": 140.3860
        },
        {
          "time": "12:00",
          "location": "秋叶原",
          "description": "参观动漫街区，逛动漫商店",
          "latitude": 35.6984,
          "longitude": 139.7731
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
  "tips": [
    "购买交通卡如 Suica 或 Pasmo 方便出行",
    "提前预约热门景点门票"
  ]
}

重要规则：
1. 必须严格返回 JSON 格式，不要有任何额外文字
2. 每个活动必须包含经纬度坐标（latitude, longitude）
3. 每天的活动数量要合理（3-6个）
4. 时间要符合逻辑顺序
5. 景点名称要准确，方便地图定位`;

    const userPrompt = `请为我制定一个${duration}天的${destination}旅行计划：

基本信息：
- 目的地：${destination}
- 时长：${duration}天
- 预算：${budget}元
- 人数：${travelers}人
- 偏好：${preferences || '无特殊偏好'}

要求：
1. 每天安排3-6个具体景点或活动
2. 每个景点必须提供准确的经纬度坐标
3. 活动时间要符合实际（考虑交通时间、游览时间）
4. 预算分配要合理
5. 如果偏好中提到动漫、美食等，优先安排相关景点

请严格按照 JSON 格式返回，不要有任何额外说明文字。`;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt }, 
        { role: 'user', content: userPrompt }
      ],
      model: 'qwen3-max-preview',
      temperature: 0.7,
    });

    let planText = completion.choices[0].message.content.trim();
    
    // 尝试提取 JSON（去除可能的 markdown 代码块标记）
    if (planText.startsWith('```json')) {
      planText = planText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (planText.startsWith('```')) {
      planText = planText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // 尝试解析 JSON
    let planData;
    try {
      planData = JSON.parse(planText);
    } catch (parseError) {
      console.error('JSON 解析失败，返回原始文本:', parseError);
      // 如果解析失败，返回原始文本让前端处理
      return res.json({ plan: planText, isRawText: true });
    }

    res.json({ plan: planData, isStructured: true });
  } catch (error) {
    console.error('Error generating plan:', error);
    res.status(500).json({ 
      error: 'Failed to generate travel plan',
      message: '生成旅行计划时发生错误，请稍后再试',
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  
  // 显示安全提醒
  console.log('\n=== 安全提醒 ===');
  console.log('确保您的 API 密钥没有被硬编码在代码中');
  console.log('所有的密钥应该通过环境变量配置');
  console.log('请勿将 .env 文件提交到版本控制系统中\n');
});
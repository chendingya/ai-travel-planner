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

    const prompt = `请为我制定一个详细的旅行计划：
目的地：${destination}
时长：${duration}天
预算：${budget}元
人数：${travelers}人
偏好：${preferences}

请提供包含交通、住宿、景点、餐饮等详细建议的行程规划。`;

    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: '你是一个专业的旅行规划助手，擅长制定详细、实用的旅行计划。' }, 
        { role: 'user', content: prompt }
      ],
      model: 'qwen3-max-preview', // 使用阿里百炼的通义千问旗舰版模型
    });

    const plan = completion.choices[0].message.content;

    res.json({ plan });
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
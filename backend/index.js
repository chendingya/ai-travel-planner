const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 检查必要的环境变量
if (!process.env.OPENAI_API_KEY) {
  console.warn('警告: OPENAI_API_KEY 未设置，AI 行程规划功能将不可用');
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('警告: Supabase 配置不完整，相关功能可能无法正常工作');
}

// 只有在提供了 API 密钥的情况下才初始化 OpenAI 客户端
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.post('/api/plan', async (req, res) => {
  // 如果没有配置 OpenAI API，则返回错误
  if (!openai) {
    return res.status(500).json({ 
      error: 'AI 功能当前不可用 - 未配置 API 密钥',
      message: '系统管理员需要配置 OpenAI API 密钥才能使用 AI 行程规划功能'
    });
  }

  try {
    const { destination, duration, budget, travelers, preferences } = req.body;

    const prompt = `Create a travel plan for a trip to ${destination} for ${duration} days with a budget of $${budget} for ${travelers} people. Preferences: ${preferences}.`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'system', content: 'You are a helpful travel planner.' }, { role: 'user', content: prompt }],
      model: 'gpt-3.5-turbo',
    });

    const plan = completion.choices[0].message.content;

    res.json({ plan });
  } catch (error) {
    console.error('Error generating plan:', error);
    res.status(500).json({ 
      error: 'Failed to generate travel plan',
      message: '生成旅行计划时发生错误，请稍后再试'
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
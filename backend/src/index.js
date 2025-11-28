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
if (!process.env.DASHSCOPE_API_KEY && !process.env.AI_API_KEY) {
  console.warn('警告: AI_API_KEY 或 DASHSCOPE_API_KEY 未设置,AI 行程规划功能将不可用');
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('警告: Supabase 配置不完整,相关功能可能无法正常工作');
}

// --- 策略模式实现 AI 客户端 ---

// 抽象策略基类
class AIStrategy {
  constructor(apiKey, baseURL, model) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    throw new Error("Method 'generate' must be implemented.");
  }
}

// 阿里百炼 (DashScope) 策略
class DashScopeStrategy extends AIStrategy {
  constructor(apiKey, baseURL, model) {
    super(
      apiKey, 
      baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1', 
      model || 'qwen3-max-preview'
    );
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    const completion = await this.client.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: this.model,
      temperature: options.temperature || 0.7,
    });
    return completion.choices[0].message.content.trim();
  }
}

// GitCode 策略
class GitCodeStrategy extends AIStrategy {
  constructor(apiKey, baseURL, model) {
    super(
      apiKey, 
      baseURL || 'https://api.gitcode.com/api/v5', 
      model || 'deepseek-ai/DeepSeek-V3.2-Exp'
    );
  }

  async generate(systemPrompt, userPrompt, options = {}) {
    // GitCode/DeepSeek 可能需要特定的参数
    const params = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: this.model,
      temperature: options.temperature || 0.6,
      top_p: 0.95,
      frequency_penalty: 0,
      max_tokens: 8192,
      stream: false 
    };

    try {
      console.log('🚀 发送请求到 GitCode:', JSON.stringify(params, null, 2));
      const completion = await this.client.chat.completions.create(params);
      console.log('📩 GitCode 响应:', JSON.stringify(completion, null, 2));

      // 如果 API 返回了明确的错误码，抛出包含错误名与信息的异常，便于上层判断
      if (completion && completion.error_code) {
        console.error('❌ GitCode 返回了错误响应:', completion);
        throw new Error(`GitCodeAPIError:${completion.error_code_name}:${completion.error_message}`);
      }

      if (!completion || !completion.choices || completion.choices.length === 0) {
        console.error('❌ GitCode 返回了无效的响应结构:', completion);
        throw new Error('GitCode API 返回了无效的响应结构 (无 choices)');
      }

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error('❌ GitCode API 调用失败:', error);
      throw error;
    }
  }
}

// 上下文类
class AIContext {
  constructor(strategy) {
    this.strategy = strategy;
  }

  async generateResponse(systemPrompt, userPrompt, options) {
    if (!this.strategy) {
      throw new Error('AI Strategy not initialized');
    }
    try {
      return await this.strategy.generate(systemPrompt, userPrompt, options);
    } catch (err) {
      // 如果是 GitCode 的审查、模型错误或网络超时(504/502/Connection error)，并且系统配置了阿里百炼，则尝试回退到 DashScope
      const msg = (err && err.message) ? err.message : '';
      const status = (err && err.status) ? err.status : 0;
      
      const isGitCodeAuditOrModelError = msg.includes('CHAT_HANDLER_INPUT_AUDIT_FAIL') || msg.includes('MODEL_DO_NOT_EXIST') || msg.startsWith('GitCodeAPIError:');
      const isNetworkError = status === 504 || status === 502 || msg.includes('Connection error') || msg.includes('fetch failed');

      if ((isGitCodeAuditOrModelError || isNetworkError) && process.env.DASHSCOPE_API_KEY && !(this.strategy instanceof DashScopeStrategy)) {
        console.warn(`⚠️ GitCode 调用失败 (${msg})，尝试回退到阿里百炼(DashScope) 策略`);
        try {
          // 回退时使用默认的 DashScope 配置
          const fallback = new DashScopeStrategy(process.env.DASHSCOPE_API_KEY);
          return await fallback.generate(systemPrompt, userPrompt, options);
        } catch (fallbackErr) {
          console.error('❌ DashScope 回退也失败:', fallbackErr);
          // 抛出原始错误以便上层了解具体原因
          throw err;
        }
      }

      throw err;
    }
  }
}

// 初始化 AI 上下文
let aiContext = null;

function initAI() {
  const apiKey = process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey) {
    console.log('❌ 未找到 AI API Key');
    return;
  }

  let strategy;
  // 根据 Base URL 判断使用哪个策略
  if (baseURL && baseURL.includes('gitcode.com')) {
    console.log('✅ 检测到 GitCode 配置，使用 GitCode 策略');
    strategy = new GitCodeStrategy(apiKey, baseURL, model);
  } else if ((baseURL && baseURL.includes('dashscope')) || process.env.DASHSCOPE_API_KEY) {
    console.log('✅ 检测到 DashScope 配置，使用阿里百炼策略');
    strategy = new DashScopeStrategy(apiKey, baseURL, model);
  } else {
    // 默认回退到 DashScope 或通用处理
    console.log('⚠️ 未识别的 Base URL，默认使用阿里百炼策略');
    strategy = new DashScopeStrategy(apiKey, baseURL, model);
  }

  aiContext = new AIContext(strategy);
}

initAI();

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
  // 如果没有配置 AI 上下文,则返回错误
  if (!aiContext || !aiContext.strategy) {
    return res.status(500).json({ 
      error: 'AI 功能当前不可用 - 未配置 API 密钥',
      message: '系统管理员需要配置 AI API 密钥才能使用 AI 行程规划功能'
    });
  }

  try {
    const { destination, duration, budget, travelers, preferences } = req.body;

    console.log(`📝 正在为 ${destination} 生成 ${duration} 天的旅行计划...`);

  const systemPrompt = `你是一个专业的旅行规划助手。请返回纯 JSON 格式的旅行计划。

规则：
1. 仅返回 JSON，无额外文字。
2. 不包含经纬度。
3. 地点需在目的地城市范围内。
4. 每天 3-6 个活动，按时间顺序。
5. 必须包含每日酒店 (hotel) 和住宿汇总 (accommodation)。
6. 除非必要，全程建议同一家酒店。

JSON 结构示例：
{
  "daily_itinerary": [
    {
      "day": 1,
      "theme": "主题名称",
      "hotel": {
        "name": "酒店名称",
        "city": "城市",
        "district": "区县",
        "address": "详细地址",
        "notes": "备注"
      },
      "activities": [
        {
          "time": "09:00",
          "location": "景点名称",
          "city": "城市",
          "district": "区县",
          "address": "地址",
          "description": "活动描述"
        }
      ]
    }
  ],
  "budget_breakdown": {
    "transportation": 0,
    "accommodation": 0,
    "meals": 0,
    "attractions": 0,
    "shopping": 0,
    "other": 0
  },
  "transport": {
    "in_city": "市内交通建议",
    "to_city": "往返交通建议"
  },
  "accommodation": [
    {
      "name": "酒店名称",
      "city": "城市",
      "district": "区县",
      "address": "地址",
      "days": "D1-D3",
      "notes": "备注"
    }
  ],
  "restaurants": [
    { "name": "餐厅名", "city": "城市", "district": "区县", "address": "地址", "tags": ["美食"] }
  ],
  "tips": ["提示1", "提示2"]
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

    let planText = await aiContext.generateResponse(systemPrompt, userPrompt, { temperature: 0.7 });
    
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
  if (!aiContext || !aiContext.strategy) {
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
  "destination": "杭州",
  "duration": 5,
  "budget": 10000,
  "travelers": 2,
  "preferences": "喜欢历史和美食"
}

规则：
1. 只返回JSON,不要有任何额外文字
2. 如果某个信息未提及,该字段返回null
3. duration(天数)、budget(预算)、travelers(人数)必须是数字
4. preferences(偏好)提取用户提到的兴趣爱好、特殊需求等`;

    const userPrompt = `请从以下文本中提取旅行信息：\n\n${text}`;

    let resultText = await aiContext.generateResponse(systemPrompt, userPrompt, { temperature: 0.3 });
    
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
  console.log(`✓ AI 服务: ${aiContext && aiContext.strategy ? '已配置 ✅ (' + aiContext.strategy.constructor.name + ')' : '未配置 ❌'}`);
  console.log(`✓ Supabase: ${process.env.SUPABASE_URL ? '已配置 ✅' : '未配置 ❌'}`);
  console.log(`✓ 前端可见 Supabase Anon Key: ${runtimeConfig.supabaseAnonKey ? '已注入 ✅' : '未注入 ❌'}`);
  console.log(`✓ 高德地图 Key: ${runtimeConfig.amapKey ? '已注入 ✅' : '未注入 ❌'}`);
  
  // 显示安全提醒
  console.log('\n=== 🔒 安全提醒 ===');
  console.log('✓ 确保您的 API 密钥没有被硬编码在代码中');
  console.log('✓ 所有的密钥应该通过环境变量配置');
  console.log('✓ 请勿将 .env 文件提交到版本控制系统中\n');
});

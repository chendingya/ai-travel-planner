/**
 * 行程规划路由
 * 处理旅行计划生成和旅行信息解析
 */

const express = require("express");
const router = express.Router();

/**
 * 创建行程规划路由
 * @param {object} textGenerator 文本生成器实例
 */
function createPlanRoutes(textGenerator) {
  // 检查 AI 是否可用的中间件
  const checkAI = (req, res, next) => {
    if (!textGenerator.isAvailable()) {
      return res.status(500).json({
        error: "AI 功能当前不可用 - 未配置 API 密钥",
        message: "系统管理员需要配置 AI API 密钥才能使用此功能",
      });
    }
    next();
  };

  /**
   * POST /api/plan
   * 生成旅行计划
   */
  router.post("/plan", checkAI, async (req, res) => {
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
- 偏好：${preferences || "无特殊偏好"}

要求：
1) 每天安排3-6个具体景点或活动，且活动仅限于目的地城市及其行政区
2) 不要输出经纬度坐标，只给出 location/city/district/address(可选) 与 description
3) 活动时间要符合实际（考虑通勤与游览时间）
4) 预算分配合理，并给出餐饮/住宿/交通/门票等建议
5) 偏好（如动漫/美食/亲子等）需体现在景点与餐厅选择中
6) 每一天必须给出当晚入住酒店 (hotel)，并在 accommodation 中总结所有酒店及适用天数
7) 除非确有跨城或夜间移动需求，尽量使用同一家酒店覆盖整个行程，并在 accommodation.days/day_range 中明确范围

请严格按照纯 JSON 格式返回，无任何额外说明文字或标记。`;

      let planText = await textGenerator.generateResponse(systemPrompt, userPrompt, {
        temperature: 0.7,
      });

      // 尝试提取 JSON(去除可能的 markdown 代码块标记)
      if (planText.startsWith("```json")) {
        planText = planText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (planText.startsWith("```")) {
        planText = planText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      // 尝试解析 JSON
      let planData;
      try {
        planData = JSON.parse(planText);
        console.log("✅ 旅行计划生成成功(结构化 JSON)!");
      } catch (parseError) {
        console.error("⚠️ JSON 解析失败,返回原始文本:", parseError.message);
        return res.json({ plan: planText, isRawText: true });
      }

      res.json({ plan: planData, isStructured: true });
    } catch (error) {
      console.error("❌ Error generating plan:", error);
      res.status(500).json({
        error: "Failed to generate travel plan",
        message: "生成旅行计划时发生错误,请稍后再试",
        details: error.message,
      });
    }
  });

  /**
   * POST /api/parse-travel-info
   * 解析旅行信息
   */
  router.post("/parse-travel-info", checkAI, async (req, res) => {
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

      let resultText = await textGenerator.generateResponse(systemPrompt, userPrompt, {
        temperature: 0.3,
      });

      // 去除可能的 markdown 代码块标记
      if (resultText.startsWith("```json")) {
        resultText = resultText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (resultText.startsWith("```")) {
        resultText = resultText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      // 解析 JSON
      let parsedData;
      try {
        parsedData = JSON.parse(resultText);
      } catch (parseError) {
        console.error("❌ JSON 解析失败:", parseError.message);
        parsedData = {
          destination: "未知",
          duration: 0,
          budget: null,
          travelers: null,
          preferences: "解析失败",
        };
        console.warn("⚠️ 使用默认结构继续处理");
      }
      console.log("✅ 文本解析成功:", parsedData);

      res.json(parsedData);
    } catch (error) {
      console.error("❌ Error parsing travel info:", error);
      res.status(500).json({
        error: "Failed to parse travel info",
        message: "解析旅行信息时发生错误",
      });
    }
  });

  return router;
}

module.exports = createPlanRoutes;

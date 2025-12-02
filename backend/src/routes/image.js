/**
 * 图片生成路由
 * 处理图片生成、明信片、速记卡片等相关 API
 */

const express = require("express");
const router = express.Router();

/**
 * 创建图片相关路由
 * @param {object} textGenerator 文本生成器实例
 * @param {object} imageGenerator 图片生成器实例
 */
function createImageRoutes(textGenerator, imageGenerator) {
  // 检查 AI 是否可用的中间件
  const checkTextAI = (req, res, next) => {
    if (!textGenerator.isAvailable()) {
      return res.status(500).json({
        error: "AI 功能当前不可用 - 未配置 API 密钥",
      });
    }
    next();
  };

  // 检查图片生成是否可用
  const checkImageAI = (req, res, next) => {
    if (!imageGenerator.isAvailable()) {
      return res.status(500).json({
        error: "图片生成功能当前不可用",
        message: "系统管理员需要配置腾讯云密钥或魔搭社区密钥才能使用图片生成功能",
      });
    }
    next();
  };

  // 请求取消处理
  const handleAbort = (req) => {
    let isAborted = false;
    req.on("aborted", () => {
      if (isAborted) return;
      isAborted = true;
      console.log("🚫 客户端断开连接，请求被取消");
    });
    return () => isAborted;
  };

  /**
   * POST /api/generate-prompt
   * 生成速记卡片提示词
   */
  router.post("/generate-prompt", checkTextAI, async (req, res) => {
    const getAborted = handleAbort(req);

    try {
      const { destination, duration, dailyItinerary } = req.body;

      console.log(`🎨 正在为 ${destination} ${duration}日游生成速记卡片提示词...`);

      // 构建每日简要信息
      const dailySummary = dailyItinerary
        .map((day, index) => {
          const dayNum = index + 1;
          const theme = day.theme || "精彩行程";
          const activities = day.activities || [];
          const mainActivities = activities
            .slice(0, 3)
            .map((a) => a.location || a.description)
            .filter(Boolean);

          return `Day ${dayNum}: ${theme} - ${mainActivities.join("、")}`;
        })
        .join("\n");

      const systemPrompt = `你是一个专业的旅行海报设计师。请根据用户的旅行计划生成一段适合AI绘图的提示词(Prompt)。

要求：
1. 风格：手绘水彩风格，清新明快
2. 构图：垂直分层手账风格，从上至下按日期分区
3. 色调：以蓝、绿为主，粉黄点缀
4. 元素：包含地标建筑、特色美食、自然风光等
5. 文字标注：每日主题和关键活动
6. 整体氛围：轻松活泼、有留白

请直接返回完整的绘图提示词，无需额外说明。`;

      const userPrompt = `请为以下旅行计划生成绘图提示词：

目的地：${destination}
天数：${duration}天

每日行程：
${dailySummary}

请生成一段详细的、适合AI绘图使用的提示词。`;

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      const prompt = await textGenerator.generateResponse(systemPrompt, userPrompt, {
        temperature: 0.8,
      });

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      console.log("✅ 提示词生成成功");
      res.json({ prompt });
    } catch (error) {
      console.error("❌ Error generating prompt:", error);
      res.status(500).json({
        error: "Failed to generate prompt",
        message: "生成提示词时发生错误，请稍后再试",
      });
    }
  });

  /**
   * POST /api/generate-image
   * 生成图片
   */
  router.post("/generate-image", checkImageAI, async (req, res) => {
    const getAborted = handleAbort(req);

    try {
      const { prompt, provider, negativePrompt, resolution, size } = req.body;

      if (!prompt) {
        return res.status(400).json({
          error: "Missing prompt",
          message: "请提供图片生成提示词",
        });
      }

      const selectedProvider = provider || imageGenerator.getDefaultProvider();
      console.log(`🖼️ 正在调用 ${selectedProvider} 生图API...`);
      console.log(`📝 提示词长度: ${prompt.length} 字符`);

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      const result = await imageGenerator.generate(prompt, {
        provider: selectedProvider,
        negativePrompt,
        resolution,
        size,
      });

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      console.log(`✅ 图片生成成功 (提供商: ${result.provider})`);
      console.log(`🔗 图片URL: ${result.imageUrl}`);

      res.json(result);
    } catch (error) {
      console.error("❌ Error generating image:", error);

      let errorMessage = "生成图片时发生错误，请稍后再试";
      if (error.code) {
        switch (error.code) {
          case "AuthFailure":
            errorMessage = "腾讯云认证失败，请检查密钥配置";
            break;
          case "OperationDenied.TextIllegalDetected":
            errorMessage = "提示词包含违规内容，请修改后重试";
            break;
          case "FailedOperation.GenerateImageFailed":
            errorMessage = "图片生成失败，请重试";
            break;
          case "RequestLimitExceeded":
            errorMessage = "请求次数超过限制，请稍后再试";
            break;
          case "ResourceUnavailable.InArrears":
            errorMessage = "账号已欠费，请充值后继续使用";
            break;
          default:
            errorMessage = error.message || errorMessage;
        }
      } else {
        errorMessage = error.message || errorMessage;
      }

      res.status(500).json({
        error: "Failed to generate image",
        message: errorMessage,
        code: error.code,
      });
    }
  });

  /**
   * GET /api/image-providers
   * 获取可用的图片生成提供商列表
   */
  router.get("/image-providers", (req, res) => {
    res.json(imageGenerator.getProvidersInfo());
  });

  /**
   * POST /api/generate-postcard-prompt
   * 生成旅游明信片提示词
   */
  router.post("/generate-postcard-prompt", checkTextAI, async (req, res) => {
    const getAborted = handleAbort(req);

    try {
      const { destination, duration, dailyItinerary, style, styleName, styleSuffix } = req.body;

      console.log(`🎨 正在为 ${destination} ${duration}日游生成【${styleName}】旅游明信片提示词...`);

      // 构建每日简要信息
      const dailySummary = dailyItinerary
        .map((day, index) => {
          const theme = day.theme || "精彩行程";
          const activities = day.activities || [];
          const mainActivities = activities
            .slice(0, 2)
            .map((a) => a.location || a.description)
            .filter(Boolean);

          return `${theme}：${mainActivities.join("、")}`;
        })
        .join("，");

      const systemPrompt = `你是一个专业的旅游明信片设计师，精通湖湘文化与传统艺术。请根据用户的旅行计划和指定的艺术风格生成一段中文的AI绘图提示词。

旅游明信片设计要求：
1. 明信片尺寸比例：4:3的横向构图，适合明信片布局
2. 主要元素：目的地标志性景观、当地文化符号、特色建筑
3. 艺术风格：${styleSuffix || "中国传统艺术风格"}
4. 装饰元素：邮票图案、邮戳、传统花纹、标题文字
5. 色彩风格：符合指定艺术风格的配色，协调统一
6. 整体布局：留有寄语空间，兼具美观和实用性

提示词要求：
- 使用中文描述，不用英文
- 控制在1500字符以内（必须！）
- 详细描述每个设计元素
- 突出地域特色和文化内涵
- 描述清晰具体，便于AI生成

请直接返回简洁的中文的绘图提示词，无需额外说明。`;

      const userPrompt = `请为以下旅行计划生成【${styleName}】风格的旅游明信片设计提示词：

目的地：${destination}
旅行天数：${duration}天
行程亮点：${dailySummary}

艺术风格特点：${styleSuffix || "中国传统艺术风格"}

请生成一段中文的明信片设计提示词，要体现${destination}的特色景观和${styleName}的艺术风格。`;

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      let prompt = await textGenerator.generateResponse(systemPrompt, userPrompt, {
        temperature: 0.75,
      });

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      // 如果提示词超过1800字符，进行截断处理
      if (prompt.length > 1800) {
        console.log(`⚠️ 提示词过长 (${prompt.length}字符)，进行截断...`);
        const truncated = prompt.substring(0, 1800);
        const lastPeriod = Math.max(
          truncated.lastIndexOf("。"),
          truncated.lastIndexOf("，"),
          truncated.lastIndexOf(","),
          truncated.lastIndexOf(".")
        );
        prompt = lastPeriod > 1500 ? truncated.substring(0, lastPeriod + 1) : truncated;
        console.log(`📏 截断后长度: ${prompt.length}字符`);
      }

      console.log("✅ 明信片提示词生成成功");
      res.json({ prompt, style, styleName });
    } catch (error) {
      console.error("❌ Error generating postcard prompt:", error);
      res.status(500).json({
        error: "Failed to generate postcard prompt",
        message: "生成明信片提示词时发生错误，请稍后再试",
      });
    }
  });

  return router;
}

module.exports = createImageRoutes;

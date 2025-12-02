/**
 * 分享文案路由
 * 处理妙笔云章分享文案生成功能
 */

const express = require("express");
const router = express.Router();

/**
 * 创建分享文案相关路由
 * @param {object} textGenerator 文本生成器实例
 */
function createShareRoutes(textGenerator) {
  // 检查 AI 是否可用的中间件
  const checkAI = (req, res, next) => {
    if (!textGenerator.isAvailable()) {
      return res.status(500).json({
        error: "AI 功能当前不可用 - 未配置 API 密钥",
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
   * POST /api/generate-share-content
   * 生成妙笔云章分享文案
   */
  router.post("/generate-share-content", checkAI, async (req, res) => {
    const getAborted = handleAbort(req);

    try {
      const { destination, duration, dailyItinerary, style } = req.body;

      // 定义风格映射
      const styleMap = {
        poetic: {
          name: "诗意文艺风",
          description: "运用诗词典故、优美意境，营造诗画般的旅行描述",
          keywords: "唐诗宋词意境、山水画卷、文人墨客情怀",
        },
        humorous: {
          name: "幽默搞笑风",
          description: "轻松诙谐、接地气的表达，带有网络流行语和段子手风格",
          keywords: "调侃自嘲、流行梗、反差萌",
        },
        documentary: {
          name: "纪录片文案风",
          description: "深沉大气、富有历史感的叙述，如《舌尖上的中国》般的文案",
          keywords: "历史厚重感、人文关怀、画面感强",
        },
        xiaohongshu: {
          name: "小红书种草风",
          description: "清新活泼、emoji丰富、攻略感强的种草文案",
          keywords: "emoji、感叹句、攻略干货、种草安利",
        },
        ancient: {
          name: "古风文言风",
          description: "典雅的文言文风格，仿古文书信体",
          keywords: "之乎者也、古文句式、典故引用",
        },
      };

      const selectedStyle = styleMap[style] || styleMap.poetic;

      console.log(`📝 正在为 ${destination} ${duration}日游生成【${selectedStyle.name}】分享文案...`);

      // 构建行程摘要
      const itinerarySummary = dailyItinerary
        .map((day, index) => {
          const theme = day.theme || `第${index + 1}天`;
          const activities = day.activities || [];
          const highlights = activities
            .slice(0, 3)
            .map((a) => a.location || a.description)
            .filter(Boolean);
          return `${theme}：${highlights.join("、")}`;
        })
        .join("；");

      const systemPrompt = `你是一个专业的社交媒体文案撰写专家，精通各种文案风格的创作。

当前需要创作【${selectedStyle.name}】风格的旅行分享文案。

风格说明：${selectedStyle.description}
风格关键词：${selectedStyle.keywords}

创作要求：
1. 完美契合所选风格的语言特色
2. 突出目的地的特色和魅力
3. 包含具体的行程亮点和个人感受
4. 文案长度控制在200-400字
5. 适合发布在朋友圈或小红书等社交平台

${style === "xiaohongshu" ? "特别注意：要大量使用emoji表情，段落分明，有感叹句和种草语气" : ""}
${style === "ancient" ? "特别注意：使用文言文句式，可适当引用古诗词，保持典雅" : ""}
${style === "humorous" ? "特别注意：要有自嘲调侃，可用网络流行语，轻松有趣" : ""}

请直接返回文案内容，无需额外说明。`;

      const userPrompt = `请为以下旅行创作【${selectedStyle.name}】风格的分享文案：

目的地：${destination}
旅行天数：${duration}天
行程概要：${itinerarySummary}

请创作一篇适合发布在社交媒体的分享文案。`;

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      const content = await textGenerator.generateResponse(systemPrompt, userPrompt, {
        temperature: 0.85,
      });

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      console.log("✅ 分享文案生成成功");
      res.json({
        content,
        style,
        styleName: selectedStyle.name,
      });
    } catch (error) {
      console.error("❌ Error generating share content:", error);
      res.status(500).json({
        error: "Failed to generate share content",
        message: "生成分享文案时发生错误，请稍后再试",
      });
    }
  });

  return router;
}

module.exports = createShareRoutes;

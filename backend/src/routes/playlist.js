/**
 * 歌单路由
 * 处理听见山河 BGM 歌单生成功能
 */

const express = require("express");
const router = express.Router();

/**
 * 创建歌单相关路由
 * @param {object} textGenerator 文本生成器实例
 */
function createPlaylistRoutes(textGenerator) {
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
   * POST /api/generate-playlist
   * 生成听见山河 BGM 歌单
   */
  router.post("/generate-playlist", checkAI, async (req, res) => {
    const getAborted = handleAbort(req);

    try {
      const { destination, duration, style, highlights, dailyItinerary } = req.body;

      console.log(`🎵 正在为 ${destination} ${duration}日游生成BGM歌单...`);
      console.log(`🎨 风格: ${style}, 重点: ${highlights?.join("、") || "无"}`);

      // 构建行程主题信息（兼容两种参数格式）
      let themes = "";
      if (dailyItinerary && dailyItinerary.length > 0) {
        themes = dailyItinerary
          .map((day, index) => {
            const theme = day.theme || `第${index + 1}天`;
            const activities = day.activities || [];
            const dayHighlights = activities
              .map((a) => a.location || a.description)
              .filter(Boolean)
              .slice(0, 2);
            return `${theme}: ${dayHighlights.join("、")}`;
          })
          .join("; ");
      } else if (highlights && highlights.length > 0) {
        themes = highlights.join("、");
      }

      const systemPrompt = `你是一个专业的音乐策展人，精通中国各地的文化音乐和流行音乐。
请根据用户的旅行目的地和行程，为他们推荐一个旅行BGM歌单。

歌单要求：
1. 推荐8-12首歌曲
2. 包含与目的地相关的地域特色音乐（如湖南的民歌、花鼓戏等）
3. 包含适合旅途心情的流行音乐
4. 每首歌需要标注：歌名、歌手、推荐理由
5. 歌曲要真实存在，能在主流音乐平台找到
6. 按照旅程心情排序：出发-途中-抵达-游览-返程
${style ? `7. 歌曲风格应符合"${style}"的旅行氛围` : ""}

请严格按照以下JSON格式返回：
{
  "title": "歌单名称（要有创意）",
  "description": "歌单整体描述（50字以内）",
  "songs": [
    {
      "title": "歌曲名",
      "artist": "歌手/乐队",
      "genre": "音乐风格",
      "reason": "推荐理由（30字以内）"
    }
  ]
}

只返回JSON，不要其他内容。`;

      const userPrompt = `请为以下旅行推荐BGM歌单：

目的地：${destination}
旅行天数：${duration}天
${style ? `旅行风格：${style}` : ""}
${themes ? `行程亮点：${themes}` : ""}

请推荐与${destination}文化相关且适合旅途心情的歌曲。`;

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      let response = await textGenerator.generateResponse(systemPrompt, userPrompt, {
        temperature: 0.8,
      });

      if (getAborted()) {
        return res.status(499).json({ error: "Request cancelled" });
      }

      // 去除可能的 markdown 代码块标记
      if (response.startsWith("```json")) {
        response = response.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (response.startsWith("```")) {
        response = response.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      // 解析 JSON 响应
      let playlist;
      try {
        // 尝试直接解析
        playlist = JSON.parse(response);
      } catch (e) {
        // 尝试提取 JSON 部分
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          playlist = JSON.parse(jsonMatch[0]);
        } else {
          console.error("❌ JSON 解析失败，原始响应:", response);
          throw new Error("无法解析歌单数据");
        }
      }

      // 验证歌单格式（兼容 title/playlistName）
      const playlistTitle = playlist.title || playlist.playlistName;
      if (!playlistTitle || !playlist.songs || !Array.isArray(playlist.songs)) {
        console.error("❌ 歌单格式不正确:", playlist);
        throw new Error("歌单格式不正确");
      }

      // 规范化响应格式
      const result = {
        title: playlistTitle,
        description: playlist.description || "",
        songs: playlist.songs,
        destination,
        style,
      };

      console.log(`✅ 歌单生成成功: ${result.title} (${result.songs.length}首歌)`);

      res.json(result);
    } catch (error) {
      console.error("❌ Error generating playlist:", error);
      res.status(500).json({
        error: "Failed to generate playlist",
        message: "生成歌单时发生错误，请稍后再试",
      });
    }
  });

  return router;
}

module.exports = createPlaylistRoutes;

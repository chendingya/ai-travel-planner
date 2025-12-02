/**
 * 路由聚合模块
 * 统一注册所有 API 路由
 */

const createPlanRoutes = require("./plan");
const createImageRoutes = require("./image");
const createChatRoutes = require("./chat");
const createShareRoutes = require("./share");
const createPlaylistRoutes = require("./playlist");

/**
 * 注册所有路由
 * @param {object} app Express 应用实例
 * @param {object} dependencies 依赖项
 */
function registerRoutes(app, dependencies) {
  const { textGenerator, imageGenerator, mcpManager, supabaseService } = dependencies;

  // 健康检查路由
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        textGeneration: textGenerator.isAvailable(),
        imageGeneration: imageGenerator.isAvailable(),
        mcp: mcpManager.isAvailable(),
      },
    });
  });

  // 注册旅行计划路由 (挂载到 /api 路径下)
  app.use("/api", createPlanRoutes(textGenerator));

  // 注册图片生成路由
  app.use("/api", createImageRoutes(textGenerator, imageGenerator));

  // 注册 AI 聊天路由
  app.use("/api", createChatRoutes(textGenerator, mcpManager, supabaseService));

  // 注册分享文案路由
  app.use("/api", createShareRoutes(textGenerator));

  // 注册歌单路由
  app.use("/api", createPlaylistRoutes(textGenerator));

  console.log("✅ 所有路由已注册");
}

module.exports = { registerRoutes };

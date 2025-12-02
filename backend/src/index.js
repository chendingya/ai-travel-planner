/**
 * 湖南旅游助手后端服务入口
 * 重构版 - 模块化架构
 */

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

// 导入配置
const { serverConfig, runtimeConfig, checkConfig } = require("./config");

// 导入服务
const { initTextGenerator } = require("./services/textGenerator");
const { initImageGenerator } = require("./services/imageGenerator");
const { initSupabase, getConversationHistory, saveConversationHistory, clearConversationHistory } = require("./services/supabase");
const { mcpManager } = require("./services/mcpManager");

// 导入路由
const { registerRoutes } = require("./routes");

// 创建 Express 应用
const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 静态资源（前端打包产物）
const staticDir = path.join(__dirname, "..", "public");
app.use(express.static(staticDir));

// 供前端在运行时动态加载公开配置
app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  const safeConfig = {
    supabaseUrl: runtimeConfig.supabaseUrl,
    supabaseAnonKey: runtimeConfig.supabaseAnonKey,
    amapKey: runtimeConfig.amapKey,
    amapSecurityCode: runtimeConfig.amapSecurityCode,
    amapRestKey: runtimeConfig.amapRestKey,
  };
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify(safeConfig)};`);
});

// 根路径：优先返回前端 index.html，若不存在则返回文本
app.get("/", (req, res) => {
  const indexPath = path.join(staticDir, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.send("Hello from AI Travel Planner Backend! 🚀");
    }
  });
});

// 健康检查端点
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * 初始化并启动服务器
 */
async function startServer() {
  console.log("\n🚀 正在启动湖南旅游助手后端服务...\n");

  // 检查配置
  checkConfig();

  // 初始化服务
  console.log("\n=== 初始化服务 ===");
  
  // 初始化 Supabase
  initSupabase();

  // 初始化文本生成器
  const textGenerator = initTextGenerator();

  // 初始化图片生成器
  const imageGenerator = initImageGenerator();

  // 初始化 MCP 客户端（异步，不阻塞启动）
  mcpManager.initialize().catch(err => {
    console.error("❌ MCP 初始化失败:", err.message);
  });

  // 注册路由
  console.log("\n=== 注册路由 ===");
  registerRoutes(app, {
    textGenerator,
    imageGenerator,
    mcpManager,
    supabaseService: {
      getConversationHistory,
      saveConversationHistory,
      clearConversationHistory,
    },
  });

  // SPA 回退：将除 /api 与 /health 外的 GET 请求指向前端 index.html
  app.get(/^(?!\/api|\/health).*/, (req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  // 启动服务器
  const port = serverConfig.port;
  app.listen(port, () => {
    console.log(`\n🚀 Server is running on port ${port}`);
    console.log(`📍 Backend API: http://localhost:${port}`);

    // 显示配置状态
    console.log("\n=== 配置状态 ===");
    const textProviders = textGenerator.getAvailableProviders();
    console.log(
      `✓ AI 文本服务: ${
        textGenerator.isAvailable()
          ? `已配置 ✅ (${textProviders.map(p => p.name).join(" -> ")})`
          : "未配置 ❌"
      }`
    );
    console.log(
      `✓ 图片生成提供商: ${
        imageGenerator.isAvailable()
          ? `已配置 ✅ (${imageGenerator.getAvailableProviders().join(", ")})`
          : "未配置 ❌"
      }`
    );
    console.log(`✓ 默认图片提供商: ${imageGenerator.getDefaultProvider() || "无"}`);
    console.log(
      `✓ Supabase: ${runtimeConfig.supabaseUrl ? "已配置 ✅" : "未配置 ❌"}`
    );
    console.log(
      `✓ 前端可见 Supabase Anon Key: ${
        runtimeConfig.supabaseAnonKey ? "已注入 ✅" : "未注入 ❌"
      }`
    );
    console.log(
      `✓ 高德地图 Key: ${runtimeConfig.amapKey ? "已注入 ✅" : "未注入 ❌"}`
    );
    console.log(
      `✓ MCP 工具: ${mcpManager.isAvailable() ? "已配置 ✅" : "初始化中..."}`
    );

    // 显示安全提醒
    console.log("\n=== 🔒 安全提醒 ===");
    console.log("✓ 确保您的 API 密钥没有被硬编码在代码中");
    console.log("✓ 所有的密钥应该通过环境变量配置");
    console.log("✓ 请勿将 .env 文件提交到版本控制系统中\n");
  });
}

// 优雅关闭处理
process.on("SIGINT", async () => {
  console.log("\n🛑 收到关闭信号，正在清理资源...");
  await mcpManager.close();
  console.log("👋 服务已停止");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 收到终止信号，正在清理资源...");
  await mcpManager.close();
  console.log("👋 服务已停止");
  process.exit(0);
});

// 启动服务器
startServer().catch(err => {
  console.error("❌ 服务器启动失败:", err);
  process.exit(1);
});

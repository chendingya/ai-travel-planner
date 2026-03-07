/**
 * 后端应用入口
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const applyLangChainTokenPatch = () => {
  try {
    const base = require('@langchain/core/language_models/base');
    if (base && base.BaseLanguageModel && base.BaseLanguageModel.prototype) {
      base.BaseLanguageModel.prototype.getNumTokens = async function getNumTokens(content) {
        const text = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((item) => (typeof item === 'string' ? item : item?.text || '')).join('')
            : String(content ?? '');
        return Math.ceil(text.length / 4);
      };
    }
    if (base && typeof base.calculateMaxTokens === 'function') {
      const getContext = typeof base.getModelContextSize === 'function' ? base.getModelContextSize : () => 4097;
      base.calculateMaxTokens = async ({ prompt, modelName }) => {
        const text = typeof prompt === 'string' ? prompt : String(prompt ?? '');
        const numTokens = Math.ceil(text.length / 4);
        return getContext(modelName) - numTokens;
      };
    }
  } catch (error) {
    console.warn('LangChain token patch failed:', error?.message || error);
  }
};

applyLangChainTokenPatch();

// 配置
const { config, getEnabledTextProviders, getEnabledImageProviders } = require('./config');

// 中间件
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');

// LangChain Manager
const LangChainManager = require('./services/langchain/LangChainManager');

// Services
const PlanService = require('./services/planService');
const AIChatService = require('./services/aiChatService');
const PromptService = require('./services/promptService');
const ImageService = require('./services/imageService');
const PlaylistService = require('./services/playlistService');
const PostcardService = require('./services/postcardService');
const ShareService = require('./services/shareService');
const MCPService = require('./services/mcpService');
const TTSService = require('./services/ttsService');
const ProviderConfigService = require('./services/providerConfigService');

// Controllers
const PlanController = require('./controllers/planController');
const AIChatController = require('./controllers/aiChatController');
const PromptController = require('./controllers/promptController');
const ImageController = require('./controllers/imageController');
const PlaylistController = require('./controllers/playlistController');
const PostcardController = require('./controllers/postcardController');
const ShareController = require('./controllers/shareController');
const ProviderConfigController = require('./controllers/providerConfigController');

// Supabase
const supabase = require('./supabase');
const swaggerUi = require('swagger-ui-express');
const { createOpenApiSpec } = require('./swagger');

// 路由
const apiRoutes = require('./routes');

// 创建 Express 应用
const app = express();

// 保持服务器引用，防止进程退出
let server = null;

// 中间件
const corsOptions = {
  ...config.cors,
};
if (corsOptions.credentials && corsOptions.origin === '*') {
  // credentials=true 时不能返回通配符；使用 true 让 cors 中间件回显请求 Origin。
  corsOptions.origin = true;
}
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

const audioDir = path.join(process.cwd(), 'runtime', 'audio');
app.use('/audio', express.static(audioDir));
const staticDir = path.join(process.cwd(), 'public');
app.use(express.static(staticDir));

const openApiSpec = createOpenApiSpec();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: 健康检查
 *     security: []
 *     responses:
 *       200:
 *         description: 服务正常
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      text: getEnabledTextProviders().length,
      image: getEnabledImageProviders().length,
    },
  });
});

/**
 * @openapi
 * /config.js:
 *   get:
 *     tags: [System]
 *     summary: 前端运行时配置注入
 *     security: []
 *     responses:
 *       200:
 *         description: 配置脚本
 */
app.get('/config.js', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || '';
  const amapKey = process.env.AMAP_KEY || '';
  const amapSecurityCode = process.env.AMAP_SECURITY_CODE || '';
  const amapRestKey = process.env.AMAP_REST_KEY || '';

  const runtimeConfig = {
    supabaseUrl,
    supabaseAnonKey,
    amapKey,
    amapSecurityCode,
    amapRestKey,
  };

  // 返回 JavaScript 文件
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify(runtimeConfig)};`);
});

app.get('/api/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

/**
 * 初始化应用
 */
async function initializeApp() {
  try {
    // 获取启用的提供商
    const textProviders = getEnabledTextProviders();
    const imageProviders = getEnabledImageProviders();

    // 初始化 LangChain Manager
    const langChainManager = new LangChainManager(textProviders, imageProviders);
    app.locals.langChainManager = langChainManager;

    // 初始化 Provider 配置服务（支持 Supabase 持久化 + 热更新）
    const providerConfigService = new ProviderConfigService({ supabase, langChainManager });
    await providerConfigService.bootstrap();
    app.locals.providerConfigService = providerConfigService;

    console.log('Available text providers:', langChainManager.getAvailableTextProviders().map((p) => p.name));
    console.log('Available image providers:', langChainManager.getAvailableImageProviders().map((p) => p.name));

    // 初始化 Services
    const mcpService = new MCPService();
    const mcpInit = await mcpService.initialize();
    app.locals.mcpService = mcpService;
    const perServer = mcpInit && typeof mcpInit === 'object' ? mcpInit.per_server : null;
    const entries = perServer && typeof perServer === 'object' ? Object.entries(perServer) : [];
    const okServers = entries.filter(([, info]) => info && info.ok).map(([name, info]) => ({
      name,
      tool_count: info.tool_count,
      duration_ms: info.duration_ms,
    }));
    const failedServers = entries.filter(([, info]) => info && info.ok === false).map(([name, info]) => ({
      name,
      error: info.error || 'unknown error',
      duration_ms: info.duration_ms,
    }));
    if (okServers.length) {
      console.log('MCP servers ready:', okServers.map((s) => `${s.name}(tools:${s.tool_count ?? 0})`).join(', '));
    } else {
      console.log('MCP servers ready: none');
    }
    if (failedServers.length) {
      console.log('MCP servers failed:', failedServers.map((s) => `${s.name}(${s.error})`).join(', '));
    }

    const configuredServers = mcpService.listServers();
    const configuredEntries = configuredServers && typeof configuredServers === 'object' ? Object.entries(configuredServers) : [];
    
    const planService = new PlanService(langChainManager, mcpService, supabase);
    const ttsService = new TTSService({ audioDir });
    const aiChatService = new AIChatService(langChainManager, supabase, { mcpService, ttsService });
    const promptService = new PromptService(langChainManager);
    const imageService = new ImageService(langChainManager, supabase);
    const playlistService = new PlaylistService(langChainManager, supabase);
    const postcardService = new PostcardService(promptService, imageService);
    const shareService = new ShareService(langChainManager);

    // 初始化 Controllers
    const planController = new PlanController(planService);
    const aiChatController = new AIChatController(aiChatService);
    const promptController = new PromptController(promptService);
    const imageController = new ImageController(imageService);
    const playlistController = new PlaylistController(playlistService);
    const postcardController = new PostcardController(postcardService);
    const shareController = new ShareController(shareService);
    const providerConfigController = new ProviderConfigController(providerConfigService);

    // 注册控制器
    const controllers = {
      planController,
      aiChatController,
      promptController,
      imageController,
      playlistController,
      postcardController,
      shareController,
      providerConfigController,
    };

    // 注册路由（带控制器）- 必须在 404 处理之前
    app.use('/api', apiRoutes(controllers));
    app.get(/^\/(?!api|audio|config\.js).*/, (req, res, next) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });

    // 404 处理 - 必须在所有路由之后
    app.use(notFoundHandler);

    // 错误处理 - 必须在最后
    app.use(errorHandler);

    console.log('✓ All services initialized successfully');

    // 注意：启动时不测试提供商连接，避免因未配置 API key 而失败
    // 提供商连接将在实际使用时自动处理降级

    return true;
  } catch (error) {
    console.error('Failed to initialize application:', error);
    return false;
  }
}

/**
 * 启动服务器
 */
async function startServer() {
  const initialized = await initializeApp();

  if (!initialized) {
    console.error('Failed to initialize application. Exiting...');
    process.exit(1);
  }

  const PORT = config.server.port;
  const HOST = config.server.host;

  server = app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Server is running on http://${HOST}:${PORT}`);
    console.log(`📚 API documentation: http://${HOST}:${PORT}/api/docs`);
    console.log(`❤️  Health check: http://${HOST}:${PORT}/health\n`);
  });

  console.log('Server instance created, keeping process alive...');

  // 保持进程运行 - 防止 Node.js 认为工作完成而退出
  process.stdin.resume();
}

// 启动应用
startServer();

module.exports = app;

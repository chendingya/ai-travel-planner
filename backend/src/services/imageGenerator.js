/**
 * 图片生成组件
 * 支持多个图片生成提供商：腾讯混元、魔搭社区
 */

const tencentcloud = require("tencentcloud-sdk-nodejs");

// --- 策略模式实现图片生成 ---

/**
 * 图片生成策略基类
 */
class ImageGenerationStrategy {
  constructor(name) {
    this.name = name;
  }

  async generate(prompt, options = {}) {
    throw new Error("Method 'generate' must be implemented.");
  }
}

/**
 * 腾讯混元策略
 */
class HunyuanImageStrategy extends ImageGenerationStrategy {
  constructor(client) {
    super("hunyuan");
    this.client = client;
  }

  async generate(prompt, options = {}) {
    if (!this.client) {
      throw new Error("混元生图功能当前不可用，请配置腾讯云密钥");
    }

    const params = {
      Prompt: prompt,
      NegativePrompt: options.negativePrompt || "黑色、模糊、低质量、变形",
      Resolution: options.resolution || "1024:768", // 默认使用4:3比例，更适合明信片
      RspImgType: "url",
      LogoAdd: 1,
    };

    console.log(`🎨 [Hunyuan] 开始生成图片...`);
    const data = await this.client.TextToImageLite(params);

    if (!data || !data.ResultImage) {
      throw new Error("混元API返回数据格式错误");
    }

    console.log(`✅ [Hunyuan] 图片生成成功`);
    return {
      imageUrl: data.ResultImage,
      seed: data.Seed,
      provider: "hunyuan",
    };
  }
}

/**
 * 魔搭社区策略 (ModelScope)
 */
class ModelScopeImageStrategy extends ImageGenerationStrategy {
  constructor(apiKey, baseUrl, model) {
    super("modelscope");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || "https://api-inference.modelscope.cn/";
    this.model = model || "Tongyi-MAI/Z-Image-Turbo";
  }

  async generate(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error("魔搭社区API密钥未配置");
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-ModelScope-Async-Mode": "true",
    };

    // 第一步：提交生成任务
    console.log(`🎨 [ModelScope] 提交图片生成任务...`);
    const submitResponse = await fetch(`${this.baseUrl}v1/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        n: options.n || 1,
        size: options.size || "1024x768", // 默认使用4:3比例
      }),
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error("❌ [ModelScope] 任务提交失败:", errorText);
      throw new Error(`魔搭社区任务提交失败: ${submitResponse.status}`);
    }

    const submitData = await submitResponse.json();
    const taskId = submitData.task_id;

    if (!taskId) {
      throw new Error("魔搭社区未返回任务ID");
    }

    console.log(`📋 [ModelScope] 任务已提交，任务ID: ${taskId}`);

    // 第二步：轮询任务状态
    const maxRetries = 60; // 最多等待5分钟 (60 * 5秒)
    const pollInterval = 5000; // 5秒

    for (let i = 0; i < maxRetries; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      console.log(`⏳ [ModelScope] 轮询任务状态 (${i + 1}/${maxRetries})...`);

      const statusResponse = await fetch(`${this.baseUrl}v1/tasks/${taskId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-ModelScope-Task-Type": "image_generation",
        },
      });

      if (!statusResponse.ok) {
        console.warn(`⚠️ [ModelScope] 状态查询失败: ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`📊 [ModelScope] 任务状态: ${statusData.task_status}`);

      if (statusData.task_status === "SUCCEED") {
        if (!statusData.output_images || statusData.output_images.length === 0) {
          throw new Error("魔搭社区未返回图片");
        }

        console.log(`✅ [ModelScope] 图片生成成功`);
        return {
          imageUrl: statusData.output_images[0],
          taskId: taskId,
          provider: "modelscope",
        };
      } else if (statusData.task_status === "FAILED") {
        throw new Error(
          `魔搭社区图片生成失败: ${statusData.error_message || "未知错误"}`
        );
      }
      // PENDING 或 RUNNING 状态继续轮询
    }

    throw new Error("魔搭社区图片生成超时");
  }
}

/**
 * 图片生成上下文类
 * 管理多个图片生成策略
 */
class ImageGeneratorContext {
  constructor() {
    this.strategies = new Map();
    this.defaultStrategy = null;
  }

  /**
   * 注册策略
   */
  registerStrategy(strategy) {
    this.strategies.set(strategy.name, strategy);
    if (!this.defaultStrategy) {
      this.defaultStrategy = strategy.name;
    }
    console.log(`✅ 图片生成策略已注册: ${strategy.name}`);
  }

  /**
   * 设置默认策略
   */
  setDefault(name) {
    if (this.strategies.has(name)) {
      this.defaultStrategy = name;
    }
  }

  /**
   * 获取可用的提供商列表
   */
  getAvailableProviders() {
    return Array.from(this.strategies.keys());
  }

  /**
   * 检查是否有可用策略
   */
  isAvailable() {
    return this.strategies.size > 0;
  }

  /**
   * 获取默认策略名称
   */
  getDefaultProvider() {
    return this.defaultStrategy;
  }

  /**
   * 获取策略数量
   */
  getStrategiesCount() {
    return this.strategies.size;
  }

  /**
   * 获取提供商详细信息
   */
  getProvidersInfo() {
    const providerInfo = {
      hunyuan: {
        name: "腾讯混元",
        description: "腾讯云混元生图极速版",
        icon: "cloud",
      },
      modelscope: {
        name: "魔搭社区",
        description: "ModelScope 图片生成",
        icon: "app",
      },
    };

    return {
      providers: this.getAvailableProviders().map((p) => ({
        id: p,
        ...providerInfo[p],
      })),
      default: this.defaultStrategy,
    };
  }

  /**
   * 生成图片
   * @param {string} prompt 图片生成提示词
   * @param {object} options 选项（provider, negativePrompt, resolution, size）
   */
  async generate(prompt, options = {}) {
    const providerName = options.provider || this.defaultStrategy;
    const strategy = this.strategies.get(providerName);

    if (!strategy) {
      throw new Error(`未知的图片生成提供商: ${providerName}`);
    }

    return await strategy.generate(prompt, options);
  }
}

/**
 * 初始化腾讯混元客户端
 */
function initHunyuanClient() {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    console.warn(
      "⚠️ TENCENT_SECRET_ID 或 TENCENT_SECRET_KEY 未设置，混元生图功能将不可用"
    );
    return null;
  }

  const AiartClient = tencentcloud.aiart.v20221229.Client;
  const clientConfig = {
    credential: {
      secretId,
      secretKey,
    },
    region: "ap-guangzhou",
    profile: {
      httpProfile: {
        endpoint: "aiart.tencentcloudapi.com",
      },
    },
  };

  console.log("✅ 混元生图客户端初始化成功");
  return new AiartClient(clientConfig);
}

/**
 * 初始化图片生成器
 */
function initImageGenerator() {
  const context = new ImageGeneratorContext();

  // 1. 注册腾讯混元
  const hunyuanClient = initHunyuanClient();
  if (hunyuanClient) {
    context.registerStrategy(new HunyuanImageStrategy(hunyuanClient));
  }

  // 2. 注册魔搭社区
  if (process.env.MODELSCOPE_API_KEY) {
    const apiKey = process.env.MODELSCOPE_API_KEY;
    const baseUrl = process.env.MODELSCOPE_BASE_URL || "https://api-inference.modelscope.cn/";
    const model = process.env.MODELSCOPE_IMAGE_MODEL || "Tongyi-MAI/Z-Image-Turbo";
    context.registerStrategy(new ModelScopeImageStrategy(apiKey, baseUrl, model));
  }

  // 设置默认提供商
  const defaultProvider = process.env.IMAGE_PROVIDER || "hunyuan";
  if (context.strategies.has(defaultProvider)) {
    context.setDefault(defaultProvider);
    console.log(`✅ 默认图片生成提供商: ${defaultProvider}`);
  } else if (context.strategies.size > 0) {
    const first = context.strategies.keys().next().value;
    context.setDefault(first);
    console.log(`⚠️ 指定的默认提供商 ${defaultProvider} 不可用，使用 ${first}`);
  }

  // 检查是否有可用策略
  if (!context.isAvailable()) {
    console.warn("⚠️ 警告: 没有配置任何图片生成 API，图片生成功能将不可用");
    console.warn("请配置以下环境变量之一:");
    console.warn("  - TENCENT_SECRET_ID + TENCENT_SECRET_KEY (腾讯混元)");
    console.warn("  - MODELSCOPE_API_KEY (魔搭社区)");
  } else {
    const providers = context.getAvailableProviders();
    console.log(`✅ 图片生成器初始化完成，共 ${providers.length} 个提供商可用`);
    console.log(`   可用提供商: ${providers.join(", ")}`);
  }

  return context;
}

// 导出
module.exports = {
  ImageGeneratorContext,
  HunyuanImageStrategy,
  ModelScopeImageStrategy,
  initImageGenerator,
  initHunyuanClient,
};

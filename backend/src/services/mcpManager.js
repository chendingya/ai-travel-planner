/**
 * MCP 客户端管理器
 * 管理与 MCP 服务器的连接和工具调用
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");
const { mcpConfig } = require("../config");

class MCPClientManager {
  constructor() {
    this.clients = new Map();
    this.tools = [];
    this.openAIToolMap = new Map(); // Map<openAIName, { serverName, toolName }>
    this.initialized = false;
  }

  /**
   * 初始化所有 MCP 服务器连接
   */
  async initialize() {
    if (this.initialized) return;

    console.log("🔧 正在初始化 MCP 客户端...");

    for (const [name, config] of Object.entries(mcpConfig.servers)) {
      try {
        await this.connectServer(name, config);
      } catch (error) {
        console.error(`❌ 连接 MCP 服务器 ${name} 失败:`, error.message);
      }
    }

    this.initialized = true;
    console.log(`✅ MCP 客户端初始化完成，共 ${this.tools.length} 个工具可用`);
  }

  /**
   * 连接单个 MCP 服务器
   */
  async connectServer(name, config) {
    console.log(`  📡 正在连接 ${name}...`);

    const client = new Client(
      { name: `hunan-travel-${name}`, version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    let transport;
    if (config.transport === "stdio") {
      // stdio 模式：使用 StdioClientTransport 启动本地进程
      console.log(`  🚀 启动进程: ${config.command} ${config.args.join(" ")}`);

      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        stderr: "pipe", // 捕获 stderr 以便调试
      });

      // 监听 stderr 输出
      const stderrStream = transport.stderr;
      if (stderrStream) {
        stderrStream.on("data", (data) => {
          console.log(`[${name}] ${data.toString()}`);
        });
      }
    } else if (config.transport === "sse") {
      // SSE 模式：连接远程服务器
      transport = new SSEClientTransport(new URL(config.url));
    } else {
      throw new Error(`不支持的传输类型: ${config.transport}`);
    }

    await client.connect(transport);

    // 获取该服务器的工具列表
    const toolsResult = await client.listTools();
    const serverTools = toolsResult.tools || [];

    console.log(`  ✅ ${name} 已连接，提供 ${serverTools.length} 个工具`);

    // 存储客户端和工具映射
    this.clients.set(name, { client, tools: serverTools });

    // 将工具添加到总工具列表
    for (const tool of serverTools) {
      this.tools.push({
        serverName: name,
        ...tool,
      });
    }
  }

  /**
   * 获取所有可用工具
   */
  getTools() {
    return this.tools;
  }

  /**
   * 将 MCP 工具转换为 OpenAI Function Calling 格式
   */
  getToolsForOpenAI() {
    this.openAIToolMap.clear();
    const nameCounts = {};
    this.tools.forEach((t) => {
      nameCounts[t.name] = (nameCounts[t.name] || 0) + 1;
    });

    return this.tools.map((tool) => {
      let openAIName = tool.name;
      // 只有在名称冲突时才添加前缀
      if (nameCounts[tool.name] > 1) {
        openAIName = `${tool.serverName}_${tool.name}`;
      }

      // 确保名称符合 OpenAI 要求 (字母、数字、下划线、连字符)
      openAIName = openAIName.replace(/[^a-zA-Z0-9_-]/g, "_");

      this.openAIToolMap.set(openAIName, {
        serverName: tool.serverName,
        toolName: tool.name,
      });

      return {
        type: "function",
        function: {
          name: openAIName,
          description: tool.description || "",
          parameters: tool.inputSchema || { type: "object", properties: {} },
        },
      };
    });
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(openAIName, args) {
    let serverName, toolName;

    const info = this.openAIToolMap.get(openAIName);
    if (info) {
      serverName = info.serverName;
      toolName = info.toolName;
    } else {
      // 兼容旧格式或直接调用
      if (openAIName.includes("__")) {
        [serverName, toolName] = openAIName.split("__");
      } else {
        throw new Error(`未知的工具名称: ${openAIName}`);
      }
    }

    const clientInfo = this.clients.get(serverName);

    if (!clientInfo) {
      throw new Error(`未找到 MCP 服务器: ${serverName}`);
    }

    console.log(`🔧 调用工具: ${openAIName} (${serverName} -> ${toolName})`);
    console.log(`📝 参数:`, JSON.stringify(args, null, 2));

    try {
      const result = await clientInfo.client.callTool({
        name: toolName,
        arguments: args,
      });

      console.log(`✅ 工具执行成功`);
      return result;
    } catch (error) {
      console.error(`❌ 工具执行失败:`, error);
      throw error;
    }
  }

  /**
   * 关闭所有 MCP 连接
   */
  async close() {
    for (const [name, { client }] of this.clients) {
      try {
        await client.close();
        console.log(`🔌 已断开 ${name}`);
      } catch (error) {
        console.error(`断开 ${name} 失败:`, error);
      }
    }
    this.clients.clear();
    this.tools = [];
    this.openAIToolMap.clear();
    this.initialized = false;
  }

  /**
   * 检查 MCP 是否可用
   */
  isAvailable() {
    return this.initialized && this.tools.length > 0;
  }

  /**
   * 获取 MCP 配置信息
   */
  getConfig() {
    return {
      initialized: this.initialized,
      serverCount: this.clients.size,
      toolCount: this.tools.length,
      servers: Array.from(this.clients.keys()),
    };
  }
}

// 创建全局单例实例
const mcpManager = new MCPClientManager();

module.exports = {
  MCPClientManager,
  mcpManager,
};

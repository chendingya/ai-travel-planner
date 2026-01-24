/**
 * 旅行规划服务
 * 封装旅行规划相关的业务逻辑
 */
const { safeParseJSON } = require('../utils/helpers');

class PlanService {
  constructor(langChainManager, mcpService) {
    this.langChainManager = langChainManager;
    this.mcpService = mcpService;
  }

  _getMcpPreferredProvider() {
    const raw =
      process.env.AI_TEXT_PROVIDER_MCP_PRIMARY || process.env.AI_TEXT_PROVIDER_MCP_PREFERRED || '';
    return typeof raw === 'string' ? raw.trim() : '';
  }

  _ensureAiMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    if (!Array.isArray(meta.providers)) meta.providers = [];
    return meta;
  }

  _recordProvider(meta, adapter, kind = 'text') {
    const target = this._ensureAiMeta(meta);
    if (!target) return;
    const provider = typeof adapter?.name === 'string' ? adapter.name : '';
    const model = typeof adapter?.model === 'string' ? adapter.model : '';
    if (!provider && !model) return;
    const exists = target.providers.some((p) => p && p.provider === provider && p.model === model && p.kind === kind);
    if (!exists) target.providers.push({ kind, provider, model });
  }

  async _invokeTextWithMcpPreferred(messages, options = {}) {
    const preferredProvider = this._getMcpPreferredProvider();
    const onAdapterStart = typeof options.onAdapterStart === 'function' ? options.onAdapterStart : null;
    if (!preferredProvider) return await this.langChainManager.invokeText(messages, { onAdapterStart });
    return await this.langChainManager.invokeText(messages, {
      provider: preferredProvider,
      allowedProviders: [preferredProvider],
      onAdapterStart,
    });
  }

  parseMoneyToNumber(raw) {
    if (raw == null) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : 0;
    if (typeof raw === 'boolean') return 0;

    if (typeof raw === 'object') {
      const candidates = [raw.value, raw.amount, raw.cost, raw.price, raw.money, raw.total];
      for (const cand of candidates) {
        const n = this.parseMoneyToNumber(cand);
        if (n > 0) return n;
      }
      return 0;
    }

    const s = String(raw).trim();
    if (!s) return 0;

    const compact = s.replace(/[,，\s]/g, '').replace(/[¥￥元块人民币]/g, '');
    const factor = /[万wW]/.test(compact) ? 10000 : /[千kK]/.test(compact) ? 1000 : 1;
    const m = compact.match(/-?\d+(\.\d+)?/);
    if (!m) return 0;
    const n = Number(m[0]);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n * factor;
  }

  normalizeBudgetBreakdown(input) {
    if (input == null) return null;

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        return this.normalizeBudgetBreakdown(parsed);
      } catch {
        return null;
      }
    }

    const ignoredKeys = new Set(['total', 'sum', 'total_budget', 'budget', '合计', '总计', '总预算', '预算']);
    const out = {};

    const add = (k, v) => {
      const key = String(k ?? '').trim();
      if (!key || ignoredKeys.has(key) || ignoredKeys.has(key.toLowerCase())) return;
      const n = this.parseMoneyToNumber(v);
      out[key] = (out[key] || 0) + n;
    };

    if (Array.isArray(input)) {
      for (const item of input) {
        if (Array.isArray(item) && item.length >= 2) {
          add(item[0], item[1]);
          continue;
        }
        if (!item || typeof item !== 'object') continue;
        const key = item.key ?? item.category ?? item.type ?? item.name ?? item.label;
        const val = item.value ?? item.amount ?? item.cost ?? item.price ?? item.money ?? item.total;
        if (key != null && val != null) add(key, val);
      }
      return Object.keys(out).length ? out : null;
    }

    if (typeof input === 'object') {
      if (input.budget_breakdown != null) return this.normalizeBudgetBreakdown(input.budget_breakdown);
      if (Array.isArray(input.items)) return this.normalizeBudgetBreakdown(input.items);
      if (Array.isArray(input.categories)) return this.normalizeBudgetBreakdown(input.categories);

      for (const [k, v] of Object.entries(input)) add(k, v);
      return Object.keys(out).length ? out : null;
    }

    return null;
  }

  normalizePlanObject(plan) {
    if (!plan || typeof plan !== 'object') return plan;
    const normalized = { ...plan };

    const bd = this.normalizeBudgetBreakdown(normalized.budget_breakdown);
    if (bd) normalized.budget_breakdown = bd;
    else if (normalized.budget_breakdown != null) normalized.budget_breakdown = null;

    if (normalized.total_budget != null) {
      const total = this.parseMoneyToNumber(normalized.total_budget);
      normalized.total_budget = Number.isFinite(total) && total >= 0 ? total : 0;
    }

    return normalized;
  }

  normalizeGeneratedPlan(result) {
    if (!result) return { isStructured: false, plan: '' };

    if (typeof result === 'string') {
      return { isStructured: false, plan: result };
    }

    if (typeof result !== 'object') {
      return { isStructured: false, plan: String(result) };
    }

    if (result.isStructured && result.plan) {
      return result;
    }

    if (typeof result.rawContent === 'string') {
      return { isStructured: false, plan: result.rawContent };
    }

    if (Array.isArray(result.daily_itinerary)) {
      return { isStructured: true, plan: this.normalizePlanObject(result) };
    }

    if (Array.isArray(result.itinerary)) {
      const daily_itinerary = result.itinerary.map((day, idx) => {
        const dayNumber = Number.isFinite(Number(day?.day)) ? Number(day.day) : idx + 1;
        const theme = day?.title || day?.theme || `第 ${dayNumber} 天`;

        const hotel = (() => {
          if (!day?.hotel) return null;
          if (typeof day.hotel === 'string') return { name: day.hotel };
          if (typeof day.hotel === 'object') return day.hotel;
          return null;
        })();

        const activities = Array.isArray(day?.activities)
          ? day.activities.map((activity) => {
              if (!activity) return { time: '', description: '', coords: null };
              if (typeof activity === 'string') return { time: '', description: activity, coords: null };
              if (typeof activity !== 'object') return { time: '', description: String(activity), coords: null };
              return {
                time: activity.time || '',
                location: activity.location || '',
                city: activity.city || '',
                district: activity.district || '',
                address: activity.address || '',
                notes: activity.notes || '',
                description: activity.description || activity.activity || activity.name || '',
                coords: Array.isArray(activity.coords) ? activity.coords : null,
              };
            })
          : [];

        return { day: dayNumber, theme, hotel, activities };
      });

      const plan = {
        daily_itinerary,
        accommodation: Array.isArray(result.accommodation) ? result.accommodation : [],
        restaurants: Array.isArray(result.restaurants) ? result.restaurants : [],
        transport: result.transport && typeof result.transport === 'object' ? result.transport : {},
        budget_breakdown: result.budget_breakdown ?? null,
        tips: Array.isArray(result.tips) ? result.tips : [],
      };

      return { isStructured: true, plan: this.normalizePlanObject(plan) };
    }

    return { isStructured: false, plan: JSON.stringify(result, null, 2) };
  }

  /**
   * 解析旅行信息（快捷输入）
   */
  async parseTravelInfo(quickInput, options = {}) {
    try {
      const systemPrompt = `你是一个旅行信息提取助手。请从用户的快捷输入中提取结构化的旅行信息。

输出JSON格式，包含以下字段：
- destination: 目的地
- duration: 天数（如果提供）
- budget: 预算（如果提供）
- travelers: 人数（如果提供）
- preferences: 偏好与需求（字符串，尽量合并成一句话）

约定：
- duration、travelers 为整数；budget 为整数（元）
- 如果用户说“3万/三万元”，budget 输出 30000
- 如果缺失则输出 null`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: quickInput },
      ];

      const aiMeta = this._ensureAiMeta(options?.aiMeta);
      if (aiMeta && typeof aiMeta.mcp !== 'boolean') aiMeta.mcp = false;
      if (typeof this.langChainManager?._debug === 'function') {
        this.langChainManager._debug('plan.parse.start', { input_len: String(quickInput ?? '').length });
      }
      const result = await this._invokeTextWithMcpPreferred(messages, {
        onAdapterStart: async ({ adapter }) => this._recordProvider(aiMeta, adapter, 'text'),
      });
      if (typeof this.langChainManager?._debug === 'function') {
        this.langChainManager._debug('plan.parse.ok', { output_len: String(result ?? '').length });
      }

      const parsed = safeParseJSON(result, null);
      if (parsed !== null) return parsed;
      console.warn('Failed to parse travel info, returning raw');
      return { rawContent: result };
    } catch (error) {
      console.error('Parse travel info failed:', error);
      throw new Error('解析旅行信息失败');
    }
  }

  /**
   * 生成旅行计划
   */
  async generatePlan(formData, options = {}) {
    try {
      const withTimeout = (promise, timeoutMs, code) => {
        const msRaw = Number(timeoutMs);
        const ms = Number.isFinite(msRaw) && msRaw > 0 ? msRaw : 90000;
        return Promise.race([
          Promise.resolve(promise),
          new Promise((_, reject) => {
            const t = setTimeout(() => {
              const err = new Error(code || 'PLAN_TIMEOUT');
              err.status = 504;
              err.code = code || 'PLAN_TIMEOUT';
              reject(err);
            }, ms);
            if (t && typeof t.unref === 'function') t.unref();
          }),
        ]);
      };

      const systemPrompt = `你是一个专业的旅行规划师。请根据用户提供的结构化旅行信息，生成一份可执行的旅行计划。

**核心要求 - 必须严格遵守**：
1. **必须使用工具获取真实信息**：
   - 不要依赖你的内部知识来估算价格或检查可用性。
   - 可以调用工具（如 bing-search, amap-maps, 12306-mcp 等）来获取：
     - 真实的交通方式和票价（火车/飞机）。
     - 真实的酒店名称、位置和当前价格。
     - 景点的实际开放时间和门票价格。
     - 目的地的天气情况（如果适用）。

2. **思考与执行流程**：
   - 第一步：分析用户需求，列出需要查询的信息（交通、住宿、景点）。
   - 第二步：**调用工具**获取这些信息。每个信息调用 1-2 次工具即可，不要重复查询。
   - 第三步：根据查询到的真实信息，规划行程。
   - 第四步：**立即生成符合下方 Schema 的 JSON 格式计划**，不要继续调用工具。

3. **输出格式要求**：
   - 最终输出只包含 JSON，不要有 Markdown 标记，不要有解释性文字。
   - 金额字段必须是数字（整数，单位：元）。
   - 内容必须中文。
   - **重要：在收集到足够信息后，立即输出最终的 JSON，不要继续调用工具！**

输出 JSON Schema（示例字段名，按此输出）：
{
  "destination": "目的地",
  "duration": 3,
  "total_budget": 30000,
  "daily_itinerary": [
    {
      "day": 1,
      "theme": "当天主题",
      "hotel": { "name": "酒店名", "address": "地址", "price_range": "价格区间" },
      "activities": [
        {
          "time": "09:00-10:30",
          "location": "地点",
          "city": "城市",
          "district": "区域",
          "address": "更具体地址",
          "notes": "注意事项",
          "description": "做什么"
        }
      ]
    }
  ],
  "accommodation": [],
  "restaurants": [],
  "transport": {},
  "budget_breakdown": {
    "transportation": 0,
    "accommodation": 0,
    "meals": 0,
    "attractions": 0,
    "tickets": 0,
    "shopping": 0,
    "other": 0
  },
  "tips": []
}`;

      const messages = [
        { role: 'user', content: JSON.stringify(formData ?? {}, null, 2) },
      ];

      const tools = this.mcpService ? await this.mcpService.getLangChainTools() : [];
      if (typeof this.langChainManager?._debug === 'function') {
        this.langChainManager._debug('plan.tools', { tool_count: tools.length });
      }

      const preferredProvider = this._getMcpPreferredProvider();
      const aiMeta = this._ensureAiMeta(options?.aiMeta);
      if (aiMeta) aiMeta.mcp = tools.length > 0;

      const planTimeoutMs = Number(process.env.AI_PLAN_TIMEOUT_MS || process.env.MCP_PLAN_TIMEOUT_MS || '120000');
      const modelTimeoutMs = Number(process.env.AI_PLAN_MODEL_TIMEOUT_MS || process.env.MCP_PLAN_MODEL_TIMEOUT_MS || '60000');
      const mcpProviderName = typeof process.env.AI_TEXT_PROVIDER_MCP_PRIMARY === 'string' && process.env.AI_TEXT_PROVIDER_MCP_PRIMARY.trim()
        ? process.env.AI_TEXT_PROVIDER_MCP_PRIMARY.trim()
        : typeof process.env.AI_TEXT_PROVIDER_MCP_PREFERRED === 'string' && process.env.AI_TEXT_PROVIDER_MCP_PREFERRED.trim()
          ? process.env.AI_TEXT_PROVIDER_MCP_PREFERRED.trim()
          : '';
      const allowedProviders = mcpProviderName ? [mcpProviderName] : [];
      const recursionLimit = Number(process.env.AI_CHAT_AGENT_RECURSION_LIMIT || '60');

      const result = await withTimeout(
        this.langChainManager.invokeToolCallingAgent({
          messages,
          tools,
          prompt: systemPrompt,
          provider: preferredProvider,
          allowedProviders: preferredProvider ? [preferredProvider] : allowedProviders,
          modelInvokeTimeoutMs: modelTimeoutMs,
          recursionLimit: recursionLimit,
          onAdapterStart: async ({ adapter }) => this._recordProvider(aiMeta, adapter, 'text'),
        }),
        planTimeoutMs,
        'PLAN_TIMEOUT'
      );
      if (aiMeta && result?.provider) {
        const model = typeof result?.provider === 'string'
          ? (this.langChainManager?.textAdapters || []).find((a) => a?.name === result.provider)?.model
          : '';
        const adapter = { name: result.provider, model };
        this._recordProvider(aiMeta, adapter, 'text');
      }

      if (result.steps && Array.isArray(result.steps) && typeof this.langChainManager?._debug === 'function') {
        const simplifiedSteps = result.steps.map(m => {
          const role = m.role || (m.constructor ? m.constructor.name : 'Unknown');
          const content = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? JSON.stringify(m.content) : String(m.content || ''));
          const toolCalls = m.tool_calls || m.additional_kwargs?.tool_calls;
          const toolResults = role === 'ToolMessage' ? content : undefined;
          return {
            role,
            content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
            toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
            toolResults
          };
        });
        this.langChainManager._debug('plan.steps', { steps: simplifiedSteps });
      }

      const raw = result.text;
      const parsed = safeParseJSON(raw, null);
      return this.normalizeGeneratedPlan(parsed ?? raw);
    } catch (error) {
      console.error('Generate plan failed:', error);
      throw new Error('生成旅行计划失败');
    }
  }

  /**
   * 生成完整旅行计划（包含解析和规划）
   */
  async generateCompletePlan(quickInput, options = {}) {
    try {
      // 第一步：解析快捷输入
      const parsedInfo = await this.parseTravelInfo(quickInput, options);

      // 第二步：生成旅行计划
      const plan = await this.generatePlan(parsedInfo, options);

      return {
        parsedInfo,
        plan,
      };
    } catch (error) {
      console.error('Generate complete plan failed:', error);
      throw new Error('生成完整旅行计划失败');
    }
  }
}

module.exports = PlanService;

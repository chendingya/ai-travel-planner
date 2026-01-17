/**
 * 旅行规划服务
 * 封装旅行规划相关的业务逻辑
 */
const { safeParseJSON } = require('../utils/helpers');

class PlanService {
  constructor(langChainManager) {
    this.langChainManager = langChainManager;
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
  async parseTravelInfo(quickInput) {
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

      const result = await this.langChainManager.invokeText(messages);

      const parsed = safeParseJSON(result, null);
      if (parsed !== null) return parsed;
      console.warn('Failed to parse travel info, returning raw');
      return { rawContent: result };
    } catch (error) {
      console.error('Parse travel info failed:', error);
      throw new Error('Failed to parse travel info');
    }
  }

  /**
   * 生成旅行计划
   */
  async generatePlan(formData) {
    try {
      const systemPrompt = `你是一个专业的旅行规划师。请根据用户提供的结构化旅行信息，生成一份可执行的旅行计划。

要求：
1) 只输出 JSON，不要输出 Markdown，不要用代码块包裹
2) 字段尽量完整，不确定的字段用 null 或空数组/空对象
3) 行程要真实可行，时间安排合理，活动描述简洁
4) 请用中文输出
5) 金额相关字段必须输出数字（整数，单位：元），不要带 ¥/￥/元/万 等单位，不要输出字符串

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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(formData ?? {}, null, 2) },
      ];

      const raw = await this.langChainManager.invokeText(messages);
      const parsed = safeParseJSON(raw, null);
      return this.normalizeGeneratedPlan(parsed ?? raw);
    } catch (error) {
      console.error('Generate plan failed:', error);
      throw new Error('Failed to generate travel plan');
    }
  }

  /**
   * 生成完整旅行计划（包含解析和规划）
   */
  async generateCompletePlan(quickInput) {
    try {
      // 第一步：解析快捷输入
      const parsedInfo = await this.parseTravelInfo(quickInput);

      // 第二步：生成旅行计划
      const plan = await this.generatePlan(parsedInfo);

      return {
        parsedInfo,
        plan,
      };
    } catch (error) {
      console.error('Generate complete plan failed:', error);
      throw new Error('Failed to generate complete travel plan');
    }
  }
}

module.exports = PlanService;

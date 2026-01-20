const { AsyncLocalStorage } = require('node:async_hooks');

class AIChatService {
  constructor(langChainManager, supabase, deps = {}) {
    this.langChainManager = langChainManager;
    this.supabase = supabase;
    this.mcpService = deps.mcpService || null;
    this.ttsService = deps.ttsService || null;
    this._toolRateLimitBuckets = new Map();
    this._toolRateLimitBucketsCleanupAt = 0;
    this._modelCooldownUntil = new Map();
    this._traceStore = new AsyncLocalStorage();
  }

  runWithTrace(trace, runner) {
    const t = trace && typeof trace === 'object' ? { ...trace } : {};
    const fn = typeof runner === 'function' ? runner : () => runner;
    return this._traceStore.run(t, fn);
  }

  _currentTrace() {
    const t = this._traceStore.getStore();
    return t && typeof t === 'object' ? t : null;
  }

  _isRateLimitError(error) {
    if (!error) return false;
    if (error?.status === 429) return true;
    if (error?.lc_error_code === 'MODEL_RATE_LIMIT') return true;
    const msg = String(error?.message || error).toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('model_rate_limit');
  }

  _isTimeoutError(error) {
    if (!error) return false;
    if (error?.status === 504) return true;
    const code = typeof error?.code === 'string' ? error.code : '';
    if (code && code.toUpperCase().includes('TIMEOUT')) return true;
    const msg = String(error?.message || error).toLowerCase();
    return msg.includes('timeout');
  }

  _isToolSchemaNotSupportedError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    return (
      msg.includes('tools') &&
      (msg.includes('unsupported') ||
        msg.includes('not supported') ||
        msg.includes('unknown') ||
        msg.includes('invalid') ||
        msg.includes('unexpected'))
    );
  }

  _redactText(text) {
    const raw = typeof text === 'string' ? text : String(text ?? '');
    return raw
      .replace(/(bearer\s+)[a-z0-9\-\._~\+\/]+=*/gi, '$1***')
      .replace(/\b(sk|rk|ak|pk)-[a-z0-9\-_]{8,}\b/gi, '***');
  }

  _pickHeaders(headersLike) {
    const out = {};
    const allow = new Set([
      'date',
      'server',
      'via',
      'retry-after',
      'x-request-id',
      'x-requestid',
      'x-amzn-requestid',
      'x-amz-cf-id',
      'cf-ray',
      'modelscope-ratelimit-requests-limit',
      'modelscope-ratelimit-requests-remaining',
      'modelscope-ratelimit-model-requests-limit',
      'modelscope-ratelimit-model-requests-remaining',
      'x-ratelimit-limit-requests',
      'x-ratelimit-remaining-requests',
      'x-ratelimit-reset-requests',
      'x-ratelimit-limit-tokens',
      'x-ratelimit-remaining-tokens',
      'x-ratelimit-reset-tokens',
    ]);

    const setIfOk = (k, v) => {
      const key = typeof k === 'string' ? k.toLowerCase() : '';
      if (!key) return;
      const val = typeof v === 'string' ? v : v == null ? '' : String(v);
      if (!val) return;
      if (allow.has(key) || key.startsWith('x-ratelimit-')) out[key] = val;
    };

    const h = headersLike;
    if (!h) return out;

    if (typeof h.get === 'function') {
      for (const k of allow) setIfOk(k, h.get(k));
      if (typeof h.entries === 'function') {
        let i = 0;
        for (const [k, v] of h.entries()) {
          if (i++ > 40) break;
          setIfOk(k, v);
        }
      }
      return out;
    }

    if (h && typeof h === 'object') {
      for (const [k, v] of Object.entries(h)) setIfOk(k, v);
      return out;
    }

    return out;
  }

  _summarizeError(error) {
    const e = error || {};
    const name = typeof e?.name === 'string' ? e.name : '';
    const rawMessage = typeof e?.message === 'string' ? e.message : String(e);
    const message = this._redactText(rawMessage).trim();
    const status =
      Number.isFinite(Number(e?.status)) ? Number(e.status) : Number.isFinite(Number(e?.response?.status)) ? Number(e.response.status) : null;
    const code = typeof e?.code === 'string' ? e.code : typeof e?.lc_error_code === 'string' ? e.lc_error_code : '';
    const type = typeof e?.type === 'string' ? e.type : '';
    const headers = this._pickHeaders(e?.headers || e?.response?.headers);
    const out = { name, message, status, code, type, headers };
    return out;
  }

  async _probeOpenAIModelsEndpoint({ provider, baseURL, apiKey }) {
    if (!this._debugEnabled()) return;
    const providerName = typeof provider === 'string' ? provider.trim() : '';
    const rawBase = typeof baseURL === 'string' ? baseURL.trim() : '';
    const key = typeof apiKey === 'string' ? apiKey : '';
    if (!providerName || !rawBase || !key) return;

    const trace = this._currentTrace();
    const markerKey = `${providerName}|${rawBase}`;
    if (trace) {
      const map = trace._probes && typeof trace._probes === 'object' ? trace._probes : {};
      if (map[markerKey]) return;
      map[markerKey] = true;
      trace._probes = map;
    }

    const base = rawBase.replace(/\/+$/, '');
    const url = `${base}/models`;
    const abortController = new AbortController();
    const timeoutMsRaw = Number(process.env.AI_CHAT_PROVIDER_PROBE_TIMEOUT_MS || '5000');
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 5000;
    const t = setTimeout(() => abortController.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: abortController.signal,
      });
      const text = await res.text();
      const preview = this._redactText(text).slice(0, 400);
      this._debug('provider.probe', {
        provider: providerName,
        url,
        ms: Date.now() - start,
        status: res.status,
        headers: this._pickHeaders(res.headers),
        body_len: text.length,
        body_preview: preview,
      });
    } catch (e) {
      this._debug('provider.probe.err', {
        provider: providerName,
        url,
        ms: Date.now() - start,
        error: this._summarizeError(e),
      });
    } finally {
      clearTimeout(t);
    }
  }

  async _probeOpenAIChatCompletionsEndpoint({ provider, baseURL, apiKey, model }) {
    if (!this._debugEnabled()) return;
    const providerName = typeof provider === 'string' ? provider.trim() : '';
    const rawBase = typeof baseURL === 'string' ? baseURL.trim() : '';
    const key = typeof apiKey === 'string' ? apiKey : '';
    const modelName = typeof model === 'string' ? model : '';
    if (!providerName || !rawBase || !key || !modelName) return;

    const trace = this._currentTrace();
    const markerKey = `${providerName}|${rawBase}|${modelName}|chat_completions`;
    if (trace) {
      const map = trace._probes && typeof trace._probes === 'object' ? trace._probes : {};
      if (map[markerKey]) return;
      map[markerKey] = true;
      trace._probes = map;
    }

    const base = rawBase.replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    const abortController = new AbortController();
    const timeoutMsRaw = Number(process.env.AI_CHAT_PROVIDER_PROBE_TIMEOUT_MS || '5000');
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 5000;
    const t = setTimeout(() => abortController.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'ping' }],
          temperature: 0,
        }),
        signal: abortController.signal,
      });
      const text = await res.text();
      const preview = this._redactText(text).slice(0, 400);
      this._debug('provider.probe.chat_completions', {
        provider: providerName,
        model: modelName,
        url,
        ms: Date.now() - start,
        status: res.status,
        headers: this._pickHeaders(res.headers),
        body_len: text.length,
        body_preview: preview,
      });
    } catch (e) {
      this._debug('provider.probe.chat_completions.err', {
        provider: providerName,
        model: modelName,
        url,
        ms: Date.now() - start,
        error: this._summarizeError(e),
      });
    } finally {
      clearTimeout(t);
    }
  }

  _ensureError(value, fallbackMessage) {
    if (value instanceof Error) return value;
    const fallback = typeof fallbackMessage === 'string' && fallbackMessage.trim() ? fallbackMessage.trim() : 'Unknown error';
    const msg = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    const err = new Error(msg);
    err.original = value;
    return err;
  }

  _isToolInteropError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes('tool_call_id') || msg.includes('tool_calls') || msg.includes('function_call')) return true;
    if (msg.includes("cannot read properties of undefined") && msg.includes("reading 'message'")) return true;
    return false;
  }

  _isProviderProtocolError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes("cannot read properties of undefined") && msg.includes("reading 'message'")) return true;
    if (msg.includes('invalid json response body')) return true;
    if (msg.includes('unexpected token') && msg.includes('json')) return true;
    return false;
  }

  _modelCooldownConfig() {
    const cooldownMsRaw = Number(process.env.AI_CHAT_MODEL_COOLDOWN_MS || '60000');
    const cooldownMs = Number.isFinite(cooldownMsRaw) && cooldownMsRaw > 0 ? cooldownMsRaw : 60000;
    return { cooldownMs };
  }

  _setModelCooldown(providerName, msOverride) {
    const name = typeof providerName === 'string' ? providerName.trim() : '';
    if (!name) return;
    const cfg = this._modelCooldownConfig();
    const msRaw = Number(msOverride);
    const ms = Number.isFinite(msRaw) && msRaw > 0 ? msRaw : cfg.cooldownMs;
    this._modelCooldownUntil.set(name, Date.now() + ms);
  }

  _filterAdaptersByCooldown(adapters) {
    const raw = Array.isArray(adapters) ? adapters : [];
    const now = Date.now();
    const available = raw.filter((a) => {
      const name = typeof a?.name === 'string' ? a.name : '';
      if (!name) return true;
      const until = this._modelCooldownUntil.get(name);
      return !(typeof until === 'number' && until > now);
    });
    return available.length ? available : raw;
  }

  _toolRateLimitConfig() {
    const windowMsRaw = Number(process.env.AI_CHAT_TOOL_RATE_LIMIT_WINDOW_MS || '60000');
    const maxCallsRaw = Number(process.env.AI_CHAT_TOOL_RATE_LIMIT_MAX_CALLS || '20');
    const windowMs = Number.isFinite(windowMsRaw) && windowMsRaw > 0 ? windowMsRaw : 60000;
    const maxCalls = Number.isFinite(maxCallsRaw) && maxCallsRaw > 0 ? maxCallsRaw : 20;
    return { windowMs, maxCalls };
  }

  _toolRateLimitKey(sessionId, options) {
    const raw =
      options?.rate_limit_key ??
      options?.rateLimitKey ??
      options?.client_ip ??
      options?.clientIp ??
      sessionId ??
      '';
    const key = typeof raw === 'string' ? raw.trim() : '';
    return key ? key : 'global';
  }

  _safeStringify(value) {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  _truncateText(text, maxChars) {
    const raw = typeof text === 'string' ? text : String(text ?? '');
    const limitRaw = Number(maxChars);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 6000;
    if (raw.length <= limit) return raw;
    return `${raw.slice(0, limit)}\n\n(内容过长，已截断；原始长度 ${raw.length})`;
  }

  _consumeToolQuota(key, cost = 1) {
    const normalizedKey = typeof key === 'string' && key.trim() ? key.trim() : 'global';
    const cfg = this._toolRateLimitConfig();
    const now = Date.now();

    if (!this._toolRateLimitBucketsCleanupAt) this._toolRateLimitBucketsCleanupAt = now;
    if (now - this._toolRateLimitBucketsCleanupAt >= cfg.windowMs) {
      for (const [k, b] of this._toolRateLimitBuckets.entries()) {
        if (!b || typeof b !== 'object') {
          this._toolRateLimitBuckets.delete(k);
          continue;
        }
        if (now - (b.windowStartMs || 0) >= cfg.windowMs) this._toolRateLimitBuckets.delete(k);
      }
      this._toolRateLimitBucketsCleanupAt = now;
    }

    const bucket = this._toolRateLimitBuckets.get(normalizedKey);
    const within = bucket && typeof bucket === 'object' && now - (bucket.windowStartMs || 0) < cfg.windowMs;
    const next = within ? { ...bucket } : { windowStartMs: now, count: 0 };

    const c = Number.isFinite(Number(cost)) && Number(cost) > 0 ? Number(cost) : 1;
    if ((next.count || 0) + c > cfg.maxCalls) {
      this._toolRateLimitBuckets.set(normalizedKey, next);
      return false;
    }
    next.count = (next.count || 0) + c;
    this._toolRateLimitBuckets.set(normalizedKey, next);
    return true;
  }

  _requireToolQuota(key, meta) {
    if (this._consumeToolQuota(key, 1)) return;
    const err = new Error('TOOL_RATE_LIMIT');
    err.status = 429;
    err.code = 'TOOL_RATE_LIMIT';
    if (meta) err.meta = meta;
    throw err;
  }

  _withTimeout(promise, timeoutMs, code) {
    const msRaw = Number(timeoutMs);
    const ms = Number.isFinite(msRaw) && msRaw > 0 ? msRaw : 30000;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        const t = setTimeout(() => {
          const err = new Error(code || 'TIMEOUT');
          err.status = 504;
          err.code = code || 'TIMEOUT';
          reject(err);
        }, ms);
        if (t && typeof t.unref === 'function') t.unref();
      }),
    ]);
  }

  _timeoutConfig() {
    const modelInvokeTimeoutMsRaw = Number(process.env.AI_CHAT_MODEL_INVOKE_TIMEOUT_MS || '60000');
    const toolInvokeTimeoutMsRaw = Number(process.env.AI_CHAT_TOOL_INVOKE_TIMEOUT_MS || '90000');
    const mcpCallTimeoutMsRaw = Number(process.env.AI_CHAT_MCP_CALL_TIMEOUT_MS || '45000');
    const modelInvokeTimeoutMs =
      Number.isFinite(modelInvokeTimeoutMsRaw) && modelInvokeTimeoutMsRaw > 0 ? modelInvokeTimeoutMsRaw : 60000;
    const toolInvokeTimeoutMs =
      Number.isFinite(toolInvokeTimeoutMsRaw) && toolInvokeTimeoutMsRaw > 0 ? toolInvokeTimeoutMsRaw : 90000;
    const mcpCallTimeoutMs =
      Number.isFinite(mcpCallTimeoutMsRaw) && mcpCallTimeoutMsRaw > 0 ? mcpCallTimeoutMsRaw : 45000;
    return { modelInvokeTimeoutMs, toolInvokeTimeoutMs, mcpCallTimeoutMs };
  }

  _normalizeProviderName(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  _pickPreferredProviderName({ enableTools }) {
    const mcpPreferred = this._normalizeProviderName(
      process.env.AI_TEXT_PROVIDER_MCP_PRIMARY || process.env.AI_TEXT_PROVIDER_MCP_PREFERRED
    );
    const defaultPreferred = this._normalizeProviderName(
      process.env.AI_TEXT_PROVIDER_DEFAULT_PRIMARY || process.env.AI_TEXT_PROVIDER_DEFAULT_PREFERRED
    );
    const useMcpPreferred = !!this.mcpService && !!enableTools;
    return useMcpPreferred ? mcpPreferred : defaultPreferred;
  }

  _toolResultConfig() {
    const maxCharsRaw = Number(process.env.AI_CHAT_TOOL_RESULT_MAX_CHARS || '6000');
    const maxChars = Number.isFinite(maxCharsRaw) && maxCharsRaw > 0 ? maxCharsRaw : 6000;
    return { maxChars };
  }

  _debugEnabled() {
    const v = process.env.AI_CHAT_DEBUG;
    if (!v) return false;
    return v === '1' || v.toLowerCase() === 'true';
  }

  _debug(event, data) {
    if (!this._debugEnabled()) return;
    const payload = data && typeof data === 'object' ? data : { value: data };
    const trace = this._currentTrace();
    const requestId = typeof trace?.requestId === 'string' ? trace.requestId : '';
    const merged = requestId ? { requestId, ...payload } : payload;
    const ts = new Date().toISOString();
    console.log(`[${ts}] ai-chat:${event}`, JSON.stringify(merged));
  }

  async tryTables(tableNames, runner) {
    let lastError = null;
    for (const tableName of tableNames) {
      const result = await runner(tableName);
      const error = result?.error || null;
      lastError = error;
      if (!error) return result;
      if (error.code === 'PGRST205') continue;
      return result;
    }
    return { data: null, error: lastError };
  }

  isTransientSupabaseError(error) {
    const msg = `${error?.message || ''}\n${error?.details || ''}`.toLowerCase();
    return (
      msg.includes('fetch failed') ||
      msg.includes('connect timeout') ||
      msg.includes('und_err_connect_timeout') ||
      msg.includes('etimedout') ||
      msg.includes('timeout')
    );
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async withRetry(operation, { retries = 2, baseDelayMs = 300 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error;
        if (!this.isTransientSupabaseError(error) || attempt >= retries) break;
        await this.sleep(baseDelayMs * (attempt + 1));
      }
    }
    throw lastError;
  }

  safeTitleFromMessages(messages) {
    if (!Array.isArray(messages)) return '新对话';
    const firstUser = messages.find((m) => m && typeof m === 'object' && m.role === 'user' && typeof m.content === 'string' && m.content.trim());
    const raw = firstUser?.content?.trim() || '';
    if (!raw) return '新对话';
    return raw.length > 18 ? `${raw.slice(0, 18)}...` : raw;
  }

  _normalizeMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            if (typeof part.text === 'string') return part.text;
            if (typeof part.content === 'string') return part.content;
          }
          return '';
        })
        .join('');
    }
    if (content == null) return '';
    return String(content);
  }

  _tryParseJsonObject(text) {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {}
    const m = raw.match(/\{[\s\S]*\}/);
    if (m && m[0]) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    return null;
  }

  _normalizeToolCalls(calls) {
    const rawCalls = Array.isArray(calls) ? calls : [];
    const out = [];
    for (const c of rawCalls) {
      if (!c || typeof c !== 'object') continue;
      const id = c.id || c.tool_call_id || c.toolCallId || '';
      const fn = c.function && typeof c.function === 'object' ? c.function : null;
      const name =
        (typeof fn?.name === 'string' && fn.name) ||
        (typeof c.name === 'string' && c.name) ||
        (typeof c.tool_name === 'string' && c.tool_name) ||
        '';
      const args = fn && Object.prototype.hasOwnProperty.call(fn, 'arguments')
        ? fn.arguments
        : c.args ?? c.arguments ?? c.input ?? {};
      const normalizedName = typeof name === 'string' ? name : '';
      const fallbackIdBase = normalizedName || 'tool';
      out.push({ id: id || `${fallbackIdBase}-${out.length}`, name: normalizedName, args });
    }
    return out;
  }

  _extractToolCalls(aiMsg) {
    const normalizeFlexible = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return this._normalizeToolCalls(value);
      if (typeof value === 'string') {
        const parsed = this._tryParseJsonObject(value);
        if (Array.isArray(parsed)) return this._normalizeToolCalls(parsed);
        if (parsed && typeof parsed === 'object') return this._normalizeToolCalls([parsed]);
        return [];
      }
      if (value && typeof value === 'object') {
        if (Object.prototype.hasOwnProperty.call(value, 'id') || Object.prototype.hasOwnProperty.call(value, 'function') || Object.prototype.hasOwnProperty.call(value, 'name')) {
          return this._normalizeToolCalls([value]);
        }
        const numericKeys = Object.keys(value).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        if (numericKeys.length) return this._normalizeToolCalls(numericKeys.map((k) => value[k]).filter(Boolean));
      }
      return [];
    };

    const direct = normalizeFlexible(aiMsg?.tool_calls);
    if (direct.length) return direct;

    const ak = aiMsg?.additional_kwargs;
    const akCalls = normalizeFlexible(ak?.tool_calls);
    if (akCalls.length) return akCalls;

    const kwargs = aiMsg?.kwargs;
    const kwCalls = normalizeFlexible(kwargs?.tool_calls);
    if (kwCalls.length) return kwCalls;

    const lcKwargs = aiMsg?.lc_kwargs;
    const lcCalls = normalizeFlexible(lcKwargs?.tool_calls);
    if (lcCalls.length) return lcCalls;

    const functionCall = ak?.function_call || kwargs?.function_call || null;
    if (functionCall && typeof functionCall === 'object') {
      const name = typeof functionCall.name === 'string' ? functionCall.name : '';
      const argumentsRaw = functionCall.arguments;
      if (name) return this._normalizeToolCalls([{ id: 'function_call', name, args: argumentsRaw }]);
    }

    return [];
  }

  _extractToolCallsFromText(text) {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw) return [];
    const parsed = this._tryParseJsonObject(raw);
    if (!parsed) return [];
    if (Array.isArray(parsed)) return this._normalizeToolCalls(parsed);
    if (Array.isArray(parsed.tool_calls)) return this._normalizeToolCalls(parsed.tool_calls);
    if (Array.isArray(parsed.toolCalls)) return this._normalizeToolCalls(parsed.toolCalls);
    if (parsed.tool_call && typeof parsed.tool_call === 'object') return this._normalizeToolCalls([parsed.tool_call]);
    if (parsed.toolCall && typeof parsed.toolCall === 'object') return this._normalizeToolCalls([parsed.toolCall]);
    if (parsed.name && Object.prototype.hasOwnProperty.call(parsed, 'arguments')) {
      return this._normalizeToolCalls([{ id: 'tool_call', name: parsed.name, args: parsed.arguments }]);
    }
    return [];
  }

  _inferTrainTicketIntent(text) {
    const raw = typeof text === 'string' ? text : '';
    const hasTicket = /票|余票|车次/.test(raw);
    const hasTrain = /高铁|动车|火车|列车/.test(raw);
    if (!hasTicket && !hasTrain) return null;

    const m1 = raw.match(/从(?<from>[\u4e00-\u9fa5]{2,10})(?:到|至)(?<to>[\u4e00-\u9fa5]{2,10})/);
    const m2 = raw.match(/(?<from>[\u4e00-\u9fa5]{2,10})(?:到|至)(?<to>[\u4e00-\u9fa5]{2,10})/);
    const cleanup = (s) => {
      const t = typeof s === 'string' ? s.trim() : '';
      if (!t) return '';
      const noSpace = t.replace(/\s+/g, '');
      const cut = noSpace.replace(/(出发.*)$/u, '').replace(/(的|高铁|动车|火车|列车|余票|车次|票|信息|时刻表|时刻|查询|情况|多少钱|价格|有哪些).*/u, '');
      return cut.trim();
    };

    const from = cleanup(m1?.groups?.from || m2?.groups?.from || '');
    const to = cleanup(m1?.groups?.to || m2?.groups?.to || '');
    if (!from || !to) return null;

    const trainFilterFlags = /高铁/.test(raw) ? 'G' : /动车/.test(raw) ? 'D' : '';

    let date = '';
    const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const cn = raw.match(/\b(20\d{2})年(\d{1,2})月(\d{1,2})日\b/);
    if (!date && cn) {
      const mm = String(cn[2]).padStart(2, '0');
      const dd = String(cn[3]).padStart(2, '0');
      date = `${cn[1]}-${mm}-${dd}`;
    }

    const relative = /明天|后天|今天/.test(raw) ? raw.match(/明天|后天|今天/)?.[0] : '';
    return { from, to, date, relative, trainFilterFlags };
  }

  async _resolveRelativeDate(relativeWord) {
    const word = typeof relativeWord === 'string' ? relativeWord : '';
    if (!word) return '';
    if (!this.mcpService) return '';

    const currentRaw = await this.mcpService.callTool('12306-mcp', 'get-current-date', {});
    const currentText = this._normalizeMessageContent(currentRaw?.content);
    const base = typeof currentText === 'string' ? currentText.trim() : '';
    const m = base.match(/\b(20\d{2})[-\/\.](\d{1,2})[-\/\.](\d{1,2})\b/);
    if (!m) return '';
    const mm0 = String(m[2]).padStart(2, '0');
    const dd0 = String(m[3]).padStart(2, '0');
    const d = new Date(`${m[1]}-${mm0}-${dd0}T00:00:00+08:00`);
    const delta = word === '今天' ? 0 : word === '明天' ? 1 : word === '后天' ? 2 : 0;
    d.setDate(d.getDate() + delta);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async _queryTicketsViaMcp({ from, to, date, relative, trainFilterFlags }) {
    if (!this.mcpService) throw new Error('MCP service not configured');

    const effectiveDate = date || (relative ? await this._resolveRelativeDate(relative) : '');
    if (!effectiveDate) throw new Error('无法解析查询日期');

    const call12306 = async (toolName, args) => {
      const { mcpCallTimeoutMs } = this._timeoutConfig();
      const start = Date.now();
      const out = await this._withTimeout(
        this.mcpService.callTool('12306-mcp', toolName, args),
        mcpCallTimeoutMs,
        'MCP_CALL_TIMEOUT'
      );
      this._debug('mcp.call', { server: '12306-mcp', tool: toolName, ms: Date.now() - start });
      return out;
    };

    const cityTextRaw = await call12306('get-station-code-of-citys', { citys: `${from}|${to}` });
    const cityText = this._normalizeMessageContent(cityTextRaw?.content).trim();
    const cityMap = this._tryParseJsonObject(cityText);
    const fromCode = cityMap?.[from]?.station_code ? String(cityMap[from].station_code) : '';
    const toCode = cityMap?.[to]?.station_code ? String(cityMap[to].station_code) : '';
    if (!fromCode || !toCode) throw new Error('无法解析出发/到达站编码');

    const ticketsRaw = await call12306('get-tickets', {
      date: effectiveDate,
      fromStation: fromCode,
      toStation: toCode,
      trainFilterFlags: typeof trainFilterFlags === 'string' ? trainFilterFlags : '',
      format: 'text',
      limitedNum: 20,
    });
    const ticketsText = this._normalizeMessageContent(ticketsRaw?.content).trim();
    return { effectiveDate, from, to, fromCode, toCode, ticketsText };
  }

  async ensureAiChatSession(conversationId) {
    const { data, error } = await this.supabase
      .from('ai_chat_sessions')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (!error && data) return true;
    if (error && error.code !== 'PGRST116') throw error;

    const { error: insertError } = await this.supabase
      .from('ai_chat_sessions')
      .insert([{ conversation_id: conversationId, messages: [] }]);

    if (insertError) throw insertError;
    return true;
  }

  /**
   * AI 对话
   */
  async chat(message, sessionId, options = {}) {
    try {
      // 获取历史消息（如果存在）
      const history = sessionId ? await this.getSessionHistory(sessionId) : [];
      const enableTools = !!(options.enable_tools ?? options.enableTools);
      const includeAudio = !!(options.include_audio ?? options.includeAudio);
      const voice = typeof (options.voice ?? options.voiceId) === 'string' ? (options.voice ?? options.voiceId) : '';

      const trace = this._currentTrace();
      const aiMeta = trace && typeof trace.aiMeta === 'object' ? trace.aiMeta : null;
      if (aiMeta) {
        aiMeta.mcp = enableTools && !!this.mcpService;
      }

      const recordAdapterMeta = (adapter) => {
        if (!aiMeta) return;
        const provider = typeof adapter?.name === 'string' ? adapter.name : '';
        const model = typeof adapter?.model === 'string' ? adapter.model : '';
        if (provider) aiMeta.provider = provider;
        if (model) aiMeta.model = model;
      };

      this._debug('chat.start', {
        sessionId,
        enableTools,
        includeAudio,
        hasMcp: !!this.mcpService,
        message: typeof message === 'string' ? message.slice(0, 160) : String(message),
      });

      const systemPrompt = `你是一个专业的旅行助手，擅长解答各类旅行问题。

你的职责：
1. 提供实用的旅行建议和攻略
2. 推荐热门景点和美食
3. 解答旅行中的常见问题
4. 提供旅行安全提示
5. 使用友好、专业的语气回答

请用中文回答，保持简洁明了。`;

      const toolRateLimitKey = this._toolRateLimitKey(sessionId, options);
      const maxToolCallsPerChatRaw = Number(process.env.AI_CHAT_TOOL_MAX_CALLS_PER_CHAT || '12');
      const maxToolCallsPerChat = Number.isFinite(maxToolCallsPerChatRaw) && maxToolCallsPerChatRaw > 0 ? maxToolCallsPerChatRaw : 12;
      const { modelInvokeTimeoutMs, toolInvokeTimeoutMs } = this._timeoutConfig();
      const { maxChars: toolResultMaxChars } = this._toolResultConfig();

      let response = '';
      if (enableTools) {
        if (!this.mcpService) {
          const optionProvider = this._normalizeProviderName(options?.provider);
          const preferredProvider = optionProvider || this._pickPreferredProviderName({ enableTools: false });
          const allowedProviders = preferredProvider ? [preferredProvider] : [];
          response = await this.langChainManager.invokeText([
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message },
          ], { provider: preferredProvider, allowedProviders, onAdapterStart: async ({ adapter }) => recordAdapterMeta(adapter) });
        } else {
          const [{ SystemMessage, HumanMessage, AIMessage }] = await Promise.all([
            import('@langchain/core/messages'),
          ]);

          const { z } = require('zod');
          const { DynamicStructuredTool } = require('@langchain/core/tools');

          const trainTicketsTool = new DynamicStructuredTool({
            name: 'query_train_tickets',
            description:
              '查询12306火车票/高铁/动车余票信息。输入出发城市from、到达城市to、日期date(YYYY-MM-DD)或相对日期relative(今天/明天/后天)，可选trainFilterFlags(G=高铁,D=动车)。返回可直接展示的文本结果。',
            schema: z
              .object({
                from: z.string().optional(),
                to: z.string().optional(),
                date: z.string().optional(),
                relative: z.enum(['今天', '明天', '后天']).optional(),
                trainFilterFlags: z.string().optional(),
              })
              .passthrough(),
            func: async (input) => {
              const from = typeof input?.from === 'string' ? input.from.trim() : '';
              const to = typeof input?.to === 'string' ? input.to.trim() : '';
              const date = typeof input?.date === 'string' ? input.date.trim() : '';
              const relative = typeof input?.relative === 'string' ? input.relative.trim() : '';
              const trainFilterFlags =
                typeof input?.trainFilterFlags === 'string' && input.trainFilterFlags.trim()
                  ? input.trainFilterFlags.trim()
                  : '';

              if (!from || !to) throw new Error('缺少出发城市from或到达城市to');
              const start = Date.now();
              const r = await this._queryTicketsViaMcp({ from, to, date, relative, trainFilterFlags });
              this._debug('train.result', { ms: Date.now() - start, date: r.effectiveDate, from: r.from, to: r.to, text_len: r.ticketsText.length });
              const kind = trainFilterFlags === 'G' ? '高铁' : trainFilterFlags === 'D' ? '动车' : '列车';
              return `已为你查询 ${r.effectiveDate} ${r.from} → ${r.to} 的${kind}余票信息：\n\n${r.ticketsText}`;
            },
          });

          let mcpTools = [];
          try {
            mcpTools = await this.mcpService.getLangChainTools();
          } catch (e) {
            this._debug('tools.list.err', { error: String(e?.message || e) });
            mcpTools = [];
          }
          const baseTools = [...mcpTools, trainTicketsTool];
          let toolCallsInChat = 0;
          const wrapTool = (t) => {
            const schema =
              t && typeof t === 'object' && t.schema && typeof t.schema === 'object'
                ? t.schema
                : z.object({}).passthrough();
            const description = t && typeof t === 'object' && typeof t.description === 'string' ? t.description : '';
            const name = t && typeof t === 'object' && typeof t.name === 'string' ? t.name : '';
            return new DynamicStructuredTool({
              name,
              description,
              schema,
              func: async (input) => {
                toolCallsInChat += 1;
                if (toolCallsInChat > maxToolCallsPerChat) {
                  const err = new Error('TOOL_CALLS_EXCEEDED');
                  err.code = 'TOOL_CALLS_EXCEEDED';
                  err.status = 429;
                  throw err;
                }
                this._requireToolQuota(toolRateLimitKey, { tool: name });
                const raw = await this._withTimeout(t.invoke(input), toolInvokeTimeoutMs, 'TOOL_INVOKE_TIMEOUT');
                const text = this._normalizeMessageContent(raw);
                return this._truncateText(text, toolResultMaxChars);
              },
            });
          };

          const tools = baseTools.map(wrapTool);

          const adaptersRaw = Array.isArray(this.langChainManager?.textAdapters)
            ? this.langChainManager.textAdapters.filter((a) => a && typeof a.createLLM === 'function')
            : [];
          const optionProvider = this._normalizeProviderName(options?.provider);
          const preferredProvider = optionProvider || this._pickPreferredProviderName({ enableTools: true });
          const adapters = (() => {
            const filtered = this._filterAdaptersByCooldown(adaptersRaw);
            if (!preferredProvider) return filtered;
            const scoped = filtered.filter((a) => a?.name === preferredProvider);
            return scoped.length ? scoped : filtered;
          })();
          const modelByProvider = new Map(
            adapters.map((a) => [typeof a?.name === 'string' ? a.name : '', typeof a?.model === 'string' ? a.model : ''])
          );
          if (!adapters.length) {
            response = '当前未配置可用的文本大模型提供商，暂时无法处理该请求。请先配置 AI_TEXT_PROVIDERS_JSON 后重试。';
            if (sessionId) {
              await this.saveMessage(sessionId, message, response);
            }
            this._debug('chat.done', { sessionId, response_len: response.length, audio_task_id: null, audio_error: null });
            return { message: response, sessionId, audio_task_id: null, audio_error: null };
          }

          this._debug('tools.ready', { tool_count: tools.length, providers: adapters.map((a) => a?.name).filter(Boolean).slice(0, 8) });

          const toolNamesForPrompt = tools.map((t) => t?.name).filter(Boolean).slice(0, 32);

          const toolSystemPromptNative = `${systemPrompt}

工具使用规则（很重要）：
1. 当问题需要实时信息（车票/天气/搜索/网页等）时，先调用合适工具，再基于工具结果作答；不要编造实时数据。
2. 车票/高铁/动车余票查询：优先调用 query_train_tickets，补全 from、to，以及 date(YYYY-MM-DD) 或 relative(今天/明天/后天)。
3. 工具返回后，用中文把关键信息整理成清晰结果（可用列表/表格），并说明信息可能随时变动。
4. 如果工具失败或返回为空，说明原因并给出下一步建议（比如让用户补充信息）。
5. 工具调用最多 ${maxToolCallsPerChat} 次；达到上限后必须停止工具调用并输出当前结论或让用户补充信息。

可用工具：${toolNamesForPrompt.join(', ')}`;

          const maxIterationsRaw = Number(process.env.AI_CHAT_AGENT_MAX_ITERATIONS || '8');
          const maxIterationsParsed = Number.isFinite(maxIterationsRaw) && maxIterationsRaw > 0 ? maxIterationsRaw : 8;
          const maxIterations = Math.min(Math.max(1, maxIterationsParsed), 30);
          const recursionLimitEnvRaw = Number(process.env.AI_CHAT_AGENT_RECURSION_LIMIT || '');
          const recursionLimit =
            Number.isFinite(recursionLimitEnvRaw) && recursionLimitEnvRaw > 0
              ? recursionLimitEnvRaw
              : Math.max(50, maxIterations * 12 + 20, maxToolCallsPerChat * 8 + 20);

          const toBaseMessages = (items) => {
            const out = [];
            for (const m of Array.isArray(items) ? items : []) {
              if (!m || typeof m !== 'object') continue;
              if (m.role === 'user') out.push(new HumanMessage(m.content));
              else if (m.role === 'assistant') out.push(new AIMessage(m.content));
              else if (m.role === 'system') out.push(new SystemMessage(m.content));
            }
            return out;
          };

          const baseMessages = [...toBaseMessages(history), new HumanMessage(message)];

          const modelscopeMaxRequestsRaw = Number(process.env.AI_CHAT_MODELSCOPE_MAX_REQUESTS_PER_CHAT || '20');
          const modelscopeMaxRequestsPerChat =
            Number.isFinite(modelscopeMaxRequestsRaw) && modelscopeMaxRequestsRaw > 0 ? modelscopeMaxRequestsRaw : 20;

          let lastErr = null;
          try {
            const provider = preferredProvider && adapters.some((a) => a?.name === preferredProvider) ? preferredProvider : '';
            this._debug('agent.invoke', { provider: 'auto', recursionLimit, tool_count: tools.length });
            const started = Date.now();
            const out = await this.langChainManager.invokeToolCallingAgent({
              adapters,
              provider,
              messages: baseMessages,
              tools,
              prompt: toolSystemPromptNative,
              recursionLimit,
              modelInvokeTimeoutMs,
              modelscopeMaxRequestsPerChat,
              onAdapterStart: async ({ adapter }) => {
                const provider = typeof adapter?.name === 'string' ? adapter.name : '';
                if (provider) this._debug('agent.invoke.try', { provider });
                recordAdapterMeta(adapter);
              },
              onAdapterError: async ({ adapter, error }) => {
                const provider = adapter?.name;
                const summary = this._summarizeError(error);
                const baseURL = typeof adapter?.baseURL === 'string' ? adapter.baseURL : '';
                const modelName = typeof adapter?.model === 'string' ? adapter.model : '';
                const baseURLHasV1 = typeof baseURL === 'string' ? baseURL.includes('/v1') : false;
                this._debug('agent.invoke.err', { provider, model: modelName, baseURL, baseURLHasV1, error: summary });

                if (
                  typeof adapter?.name === 'string' &&
                  adapter.name.startsWith('modelscope') &&
                  (this._isRateLimitError(error) || error?.code === 'MODEL_EMPTY_RESPONSE' || this._isProviderProtocolError(error) || this._isTimeoutError(error))
                ) {
                  await this._probeOpenAIModelsEndpoint({ provider: adapter?.name, baseURL, apiKey: adapter?.apiKey });
                  await this._probeOpenAIChatCompletionsEndpoint({ provider: adapter?.name, baseURL, apiKey: adapter?.apiKey, model: modelName });
                }

                if (this._isRateLimitError(error)) this._setModelCooldown(provider);
              },
            });
            this._debug('agent.invoke.ok', { provider: out?.provider || '', ms: Date.now() - started });
            if (aiMeta) {
              const providerUsed = typeof out?.provider === 'string' ? out.provider : '';
              if (providerUsed) aiMeta.provider = providerUsed;
              const modelUsed = providerUsed ? modelByProvider.get(providerUsed) : '';
              if (modelUsed) aiMeta.model = modelUsed;
              aiMeta.mcp = true;
            }
            response = typeof out?.text === 'string' ? out.text : '';
            if (!response) {
              lastErr = new Error('MODEL_EMPTY_RESPONSE');
              lastErr.code = 'MODEL_EMPTY_RESPONSE';
            }
          } catch (e) {
            lastErr = e;
          }

          if (!response) {
            if (lastErr && (this._isRateLimitError(lastErr) || this._isTimeoutError(lastErr))) {
              response = this._isTimeoutError(lastErr)
                ? '当前模型响应超时，我暂时无法完成这个请求。请稍后重试。'
                : '当前请求过于频繁，我暂时无法完成这个请求。请稍后重试。';
            } else if (lastErr && (lastErr?.code === 'GRAPH_RECURSION_LIMIT' || lastErr?.name === 'GraphRecursionError')) {
              response = '模型在工具调用上进入了过多步骤/循环，我已中止本次执行。请你补充更明确的出发地、目的地、日期等关键信息，或换个更具体的问法后重试。';
            } else if (lastErr && lastErr?.code === 'TOOL_CALLS_EXCEEDED') {
              response = `本次对话的工具调用次数已达到上限（${maxToolCallsPerChat} 次），我已停止继续调用工具。请补充更明确的信息后重试（例如城市/日期/筛选条件）。`;
            } else if (lastErr && lastErr?.code === 'MODELSCOPE_REQUEST_LIMIT') {
              response = '魔搭模型在本次请求中已达到调用上限（单次最多20次），我已停止继续使用该提供商并尝试切换模型，但仍未能得到最终回答。请稍后重试或切换其它提供商。';
            } else if (lastErr && (lastErr?.code === 'MODEL_EMPTY_RESPONSE' || lastErr?.message === 'MODEL_EMPTY_RESPONSE')) {
              response = '模型未返回有效内容（可能被限流/超时或未能完成工具调用链）。我已尝试切换模型但仍失败，请稍后重试或更换更具体的问题。';
            } else if (lastErr && this._isProviderProtocolError(lastErr)) {
              response = '当前模型服务接口不兼容或配置异常（可能 baseURL 指向了非 OpenAI 兼容接口）。请检查该提供商的 baseURL 与 API Key 配置后重试。';
            } else {
              response = '未能生成最终回答，请重试。';
            }
          }
        }
      } else {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message },
        ];
        const optionProvider = this._normalizeProviderName(options?.provider);
        const preferredProvider = optionProvider || this._pickPreferredProviderName({ enableTools: false });
        const allowedProviders = preferredProvider ? [preferredProvider] : [];
        const mergedOptions = preferredProvider
          ? { ...options, provider: preferredProvider, allowedProviders }
          : { ...options, allowedProviders };
        response = await this.langChainManager.invokeText(messages, mergedOptions);
      }

      // 保存对话记录
      if (sessionId) {
        await this.saveMessage(sessionId, message, response);
      }

      let audio_task_id = null;
      let audio_error = null;
      if (includeAudio) {
        if (!this.ttsService) {
          audio_error = 'TTS功能不可用';
        } else {
          try {
            const created = await this.ttsService.createTask({ text: response, voice });
            audio_task_id = created.taskId;
          } catch (e) {
            audio_error = String(e?.message || e);
          }
        }
      }

      this._debug('chat.done', { sessionId, response_len: response.length, audio_task_id, audio_error });
      return {
        message: response,
        sessionId,
        audio_task_id,
        audio_error,
      };
    } catch (error) {
      console.error('AI chat failed:', error);
      const msg = error && typeof error === 'object' && typeof error.message === 'string'
        ? error.message
        : 'Failed to get AI response';
      throw new Error(msg);
    }
  }

  async getMcpStatus(scope) {
    if (!this.mcpService) {
      return {
        servers: {},
        per_server: null,
        tool_probe: { ok: false, duration_ms: 0, tool_count: 0, tool_names: [], error: 'MCP service not configured' },
      };
    }
    return await this.mcpService.status({ scope });
  }

  async createTtsTask(text, voice) {
    if (!this.ttsService) {
      throw new Error('TTS service not configured');
    }
    return await this.ttsService.createTask({ text, voice });
  }

  getTtsTask(taskId) {
    if (!this.ttsService) return null;
    return this.ttsService.getTask(taskId);
  }

  /**
   * 创建新的会话
   */
  async createSession(title) {
    try {
      const { randomUUID } = require('crypto');
      const conversationId = randomUUID();

      const { data, error } = await this.supabase
        .from('ai_chat_sessions')
        .insert([{ conversation_id: conversationId, messages: [] }])
        .select('*')
        .single();

      if (!error) {
        return {
          id: data.conversation_id,
          conversation_id: data.conversation_id,
          title: title || '新对话',
          message_count: Array.isArray(data.messages) ? data.messages.length : 0,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }

      if (error.code !== 'PGRST205') throw error;

      const fallback = await this.supabase
        .from('chat_sessions')
        .insert([{ title: title || '新对话' }])
        .select()
        .single();

      if (fallback.error) throw fallback.error;
      return fallback.data;
    } catch (error) {
      console.error('Create session failed:', error);
      throw new Error('Failed to create chat session');
    }
  }

  /**
   * 获取会话列表
   */
  async getSessions() {
    try {
      const primary = await this.withRetry(async () => {
        const result = await this.supabase
          .from('ai_chat_sessions')
          .select('*')
          .order('updated_at', { ascending: false });

        if (!result?.error) return result;
        if (result.error.code === 'PGRST205' || result.error.code === '42703') return result;
        if (this.isTransientSupabaseError(result.error)) throw result.error;
        throw result.error;
      });

      if (!primary.error) return primary.data;
      if (primary.error.code === '42703') {
        const fallbackOrder = await this.withRetry(async () => {
          const result = await this.supabase
            .from('ai_chat_sessions')
            .select('*')
            .order('created_at', { ascending: false });

          if (!result?.error) return result;
          if (result.error.code === 'PGRST205') return result;
          if (this.isTransientSupabaseError(result.error)) throw result.error;
          throw result.error;
        });

        if (!fallbackOrder.error) return fallbackOrder.data;
        if (fallbackOrder.error.code !== 'PGRST205') throw fallbackOrder.error;
      } else if (primary.error.code !== 'PGRST205') {
        throw primary.error;
      }

      const fallback = await this.withRetry(async () => {
        const result = await this.supabase
          .from('chat_sessions')
          .select('*')
          .order('created_at', { ascending: false });

        if (!result?.error) return result;
        if (this.isTransientSupabaseError(result.error)) throw result.error;
        throw result.error;
      });

      if (fallback.error) throw fallback.error;
      return fallback.data;
    } catch (error) {
      console.error('Get sessions failed:', error);
      if (this.isTransientSupabaseError(error)) return [];
      throw new Error('Failed to get chat sessions');
    }
  }

  /**
   * 获取会话历史记录
   */
  async getSessionHistory(sessionId) {
    try {
      const { data, error } = await this.withRetry(async () => {
        const result = await this.supabase
          .from('ai_chat_sessions')
          .select('messages')
          .eq('conversation_id', sessionId)
          .maybeSingle();

        if (!result?.error) return result;

        if (result.error.code === 'PGRST205' || result.error.code === 'PGRST116') return result;
        if (this.isTransientSupabaseError(result.error)) throw result.error;
        throw result.error;
      });

      if (!error) {
        const messages = Array.isArray(data?.messages) ? data.messages : [];
        return messages
          .map((m) => {
            if (!m || typeof m !== 'object') return null;
            const role = m.role === 'user' || m.role === 'assistant' || m.role === 'system' ? m.role : null;
            const content = typeof m.content === 'string' ? m.content : '';
            if (!role || !content) return null;
            return { role, content };
          })
          .filter(Boolean);
      }

      if (error.code === 'PGRST116') return [];
      if (error.code !== 'PGRST205') throw error;

      const fallback = await this.supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (fallback.error) throw fallback.error;
      return (fallback.data || []).map((msg) => ({ role: msg.role, content: msg.content }));
    } catch (error) {
      console.error('Get session history failed:', error);
      throw new Error('Failed to get session history');
    }
  }

  /**
   * 保存消息
   */
  async saveMessage(sessionId, userMessage, aiResponse) {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.supabase
        .from('ai_chat_sessions')
        .select('messages')
        .eq('conversation_id', sessionId)
        .maybeSingle();

      if (!error) {
        const current = Array.isArray(data?.messages) ? data.messages : [];
        const nextMessages = [
          ...current,
          { role: 'user', content: userMessage, created_at: now },
          { role: 'assistant', content: aiResponse, created_at: now },
        ];

        const { error: updateError } = await this.supabase
          .from('ai_chat_sessions')
          .update({ messages: nextMessages })
          .eq('conversation_id', sessionId);

        if (updateError) throw updateError;
        return;
      }

      if (error.code === 'PGRST116') {
        const nextMessages = [
          { role: 'user', content: userMessage, created_at: now },
          { role: 'assistant', content: aiResponse, created_at: now },
        ];

        const { error: insertError } = await this.supabase
          .from('ai_chat_sessions')
          .insert([{ conversation_id: sessionId, messages: nextMessages }]);

        if (!insertError) return;
        if (insertError.code !== '23505') throw insertError;

        const { data: refetched, error: refetchError } = await this.supabase
          .from('ai_chat_sessions')
          .select('messages')
          .eq('conversation_id', sessionId)
          .maybeSingle();

        if (refetchError) throw refetchError;
        const current = Array.isArray(refetched?.messages) ? refetched.messages : [];
        const merged = [
          ...current,
          { role: 'user', content: userMessage, created_at: now },
          { role: 'assistant', content: aiResponse, created_at: now },
        ];
        const { error: updateError } = await this.supabase
          .from('ai_chat_sessions')
          .update({ messages: merged })
          .eq('conversation_id', sessionId);
        if (updateError) throw updateError;
        return;
      }

      if (error.code !== 'PGRST205') throw error;

      const { error: userError } = await this.supabase
        .from('chat_messages')
        .insert([{ session_id: sessionId, role: 'user', content: userMessage }]);
      if (userError) throw userError;

      const { error: aiError } = await this.supabase
        .from('chat_messages')
        .insert([{ session_id: sessionId, role: 'assistant', content: aiResponse }]);
      if (aiError) throw aiError;
    } catch (error) {
      console.error('Save message failed:', error);
      // 不抛出错误，避免影响对话
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    try {
      const { error } = await this.supabase
        .from('ai_chat_sessions')
        .delete()
        .eq('conversation_id', sessionId);

      if (!error) return;
      if (error.code !== 'PGRST205') throw error;

      await this.supabase.from('chat_messages').delete().eq('session_id', sessionId);
      const fallback = await this.supabase.from('chat_sessions').delete().eq('id', sessionId);
      if (fallback.error) throw fallback.error;
    } catch (error) {
      console.error('Delete session failed:', error);
      throw new Error('Failed to delete chat session');
    }
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(sessionId, title) {
    try {
      const { error } = await this.supabase
        .from('ai_chat_sessions')
        .update({ title })
        .eq('conversation_id', sessionId);

      if (!error) return;

      if (error.code === 'PGRST204' || error.code === '42703') return;
      if (error.code !== 'PGRST205') throw error;

      const fallback = await this.supabase.from('chat_sessions').update({ title }).eq('id', sessionId);
      if (fallback.error) throw fallback.error;
    } catch (error) {
      console.error('Update session title failed:', error);
      throw new Error('Failed to update session title');
    }
  }
}

module.exports = AIChatService;

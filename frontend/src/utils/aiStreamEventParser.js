const MAX_TEXT = 220;

const maybeParseJson = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const maybeParseJsonLoose = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  const strict = maybeParseJson(text);
  if (strict != null) return strict;

  const withoutEllipsis = text.replace(/\s*\.\.\.\s*$/, '');
  const strictWithoutEllipsis = maybeParseJson(withoutEllipsis);
  if (strictWithoutEllipsis != null) return strictWithoutEllipsis;

  const firstObject = withoutEllipsis.indexOf('{');
  const firstArray = withoutEllipsis.indexOf('[');
  let start = -1;
  if (firstObject >= 0 && firstArray >= 0) start = Math.min(firstObject, firstArray);
  else start = Math.max(firstObject, firstArray);
  if (start < 0) return null;

  const startChar = withoutEllipsis[start];
  const endChar = startChar === '{' ? '}' : ']';
  let end = withoutEllipsis.lastIndexOf(endChar);
  while (end > start) {
    const candidate = withoutEllipsis.slice(start, end + 1);
    const parsed = maybeParseJson(candidate);
    if (parsed != null) return parsed;
    end = withoutEllipsis.lastIndexOf(endChar, end - 1);
  }
  return null;
};

const extractQuotedJsonString = (text, key) => {
  if (typeof text !== 'string' || !text) return '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const m = text.match(reg);
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1] || '';
  }
};

const normalizeText = (value, maxLen = MAX_TEXT) => {
  if (value == null) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
};

const normalizeMultilineText = (value, maxLen = 1800) => {
  if (value == null) return '';
  const text = String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
};

const unwrapToolPayload = (value, depth = 0) => {
  if (depth > 4 || value == null) return value;

  if (typeof value === 'string') {
    const parsed = maybeParseJsonLoose(value);
    if (parsed != null) return unwrapToolPayload(parsed, depth + 1);

    const kwargsContent = extractQuotedJsonString(value, 'content');
    if (kwargsContent) {
      const parsedKwargsContent = maybeParseJsonLoose(kwargsContent);
      if (parsedKwargsContent != null) return unwrapToolPayload(parsedKwargsContent, depth + 1);
      return kwargsContent;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 1) return unwrapToolPayload(value[0], depth + 1);
    return value;
  }

  if (typeof value === 'object') {
    if (value.kwargs && value.kwargs.content != null) {
      return unwrapToolPayload(value.kwargs.content, depth + 1);
    }
    if (value.additional_kwargs && value.additional_kwargs.content != null) {
      return unwrapToolPayload(value.additional_kwargs.content, depth + 1);
    }
    if (value.data && value.data.content != null) {
      return unwrapToolPayload(value.data.content, depth + 1);
    }
    if (value.output != null) return unwrapToolPayload(value.output, depth + 1);
    if (value.result != null) return unwrapToolPayload(value.result, depth + 1);
    if (value.content != null && value.content !== value) return unwrapToolPayload(value.content, depth + 1);
    if (value.input != null && value.input !== value) return unwrapToolPayload(value.input, depth + 1);
    return value;
  }

  return value;
};

const firstMeaningfulLine = (text) => {
  if (typeof text !== 'string') return '';
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[#>*\-\s`]+/, '').trim())
    .filter(Boolean);
  return lines[0] || '';
};

const extractCallArgsSummary = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  if (typeof obj.city === 'string' && obj.city.trim()) return `city=${obj.city.trim()}`;
  if (obj.input != null) {
    const input = unwrapToolPayload(obj.input, 0);
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      if (typeof input.city === 'string' && input.city.trim()) return `city=${input.city.trim()}`;
      const keys = Object.keys(input).slice(0, 3);
      if (keys.length) {
        return keys
          .map((k) => `${k}=${normalizeText(typeof input[k] === 'object' ? JSON.stringify(input[k]) : input[k], 40)}`)
          .join('，');
      }
    }
    if (typeof input === 'string') return normalizeText(input, 120);
  }
  return '';
};

const summarizeObject = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  if (typeof obj.status === 'string' && typeof obj.content === 'string') {
    const first = firstMeaningfulLine(obj.content);
    const status = normalizeText(obj.status, 20);
    if (first) return `${status}: ${normalizeText(first, 130)}`;
  }
  const keys = Object.keys(obj).slice(0, 4);
  if (!keys.length) return '';
  return keys
    .map((k) => `${k}=${normalizeText(typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : obj[k], 80)}`)
    .join('，');
};

const summarizeWeather = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  const city = obj.city || obj.province || obj.cityname || '';
  const forecasts = Array.isArray(obj.forecasts) ? obj.forecasts : [];
  const first = forecasts[0] || null;
  if (!city || !first) return '';
  const date = first.date || '';
  const day = first.dayweather || '';
  const night = first.nightweather || '';
  const dayTemp = first.daytemp || '';
  const nightTemp = first.nighttemp || '';
  return normalizeText(`${city} ${date} 白天${day} ${dayTemp}°C，夜间${night} ${nightTemp}°C`, 180);
};

const summarizePoiResults = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  const pois = Array.isArray(obj.pois) ? obj.pois : Array.isArray(obj.poi_list) ? obj.poi_list : [];
  if (!pois.length) return '';
  const names = pois
    .slice(0, 3)
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      if (typeof item === 'object') return item.name || item.title || item.poi_name || '';
      return '';
    })
    .filter(Boolean);
  const city = obj.city || obj.cityname || (pois[0] && typeof pois[0] === 'object' ? (pois[0].cityname || pois[0].city || '') : '');
  if (!names.length) return normalizeText(`${city ? `${city} ` : ''}找到${pois.length}个地点`, 180);
  return normalizeText(`${city ? `${city} ` : ''}找到${pois.length}个地点：${names.join('、')}${pois.length > names.length ? '等' : ''}`, 180);
};

const isLowQualitySummary = (value) => {
  const s = normalizeText(value, 260);
  if (!s) return true;
  if (s.length > 120 && (s.includes('={') || s.includes('=[{') || s.includes('"id"') || s.includes('"address"'))) {
    return true;
  }
  return false;
};

const pickSummary = (toolName, kind, rawContent) => {
  const unwrapped = unwrapToolPayload(rawContent);

  if (kind === 'call') {
    if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      const argsSummary = extractCallArgsSummary(unwrapped);
      if (argsSummary) return argsSummary;
    }
    if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      return summarizeObject(unwrapped) || '已收到工具参数';
    }
    return normalizeText(unwrapped, 180) || '已收到工具参数';
  }

  const looksLikeWeather =
    unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped) && Array.isArray(unwrapped.forecasts) && unwrapped.forecasts.length > 0;
  if (toolName.includes('weather') || looksLikeWeather) {
    const weather = summarizeWeather(unwrapped);
    if (weather) return weather;
  }
  const poiSummary = summarizePoiResults(unwrapped);
  if (poiSummary) return poiSummary;

  if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    return summarizeObject(unwrapped) || '工具执行完成';
  }

  if (typeof unwrapped === 'string') {
    const line = firstMeaningfulLine(unwrapped);
    if (line) return normalizeText(line, 160);
  }

  return normalizeText(unwrapped, 180) || (kind === 'error' ? '工具执行失败' : '工具执行完成');
};

const sanitizeSummary = (value, fallback) => {
  const s = normalizeText(value, 180);
  if (!s) return fallback;
  if (s === '{' || s === '[' || s === '}' || s === ']') return fallback;
  return s;
};

const shouldPreferDetailedToolText = (toolName, kind) => kind === 'result' && toolName === 'search_travel_knowledge';

const pickDetailedToolText = (payload, toolName, kind) => {
  if (!shouldPreferDetailedToolText(toolName, kind)) return '';

  const candidates = [
    payload?.content,
    unwrapToolPayload(payload?.content),
    unwrapToolPayload(payload?.rawContent),
    payload?.rawContent,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = normalizeMultilineText(candidate, 2000);
    if (!normalized) continue;
    if (normalized.includes('\n')) return normalized;
    if (normalized.length > 120) return normalized;
  }

  return '';
};

const parsePayload = (chunk) => {
  const raw = chunk?.data;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return { content: raw };
    }
  }
  return null;
};

const normalizeUnifiedPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.type === 'string' && payload.type.trim()) return payload;

  if (Array.isArray(payload.tools)) {
    return { ...payload, type: 'meta' };
  }

  if (payload.result != null) {
    return { ...payload, type: 'final' };
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return { ...payload, type: 'error' };
  }

  if (typeof payload.content === 'string') {
    return { ...payload, type: 'text' };
  }

  return payload;
};

const resolveToolNameFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.toolName,
    payload.tool_name,
    payload.tool,
    payload.name,
    payload?.metadata?.tool_name,
    payload?.metadata?.name,
    payload?.data?.toolName,
    payload?.data?.tool_name,
    payload?.data?.name,
    payload?.function?.name,
  ];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return '';
};

const resolveToolCallIdFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.toolCallId,
    payload.tool_call_id,
    payload.run_id,
    payload.id,
    payload?.data?.toolCallId,
    payload?.data?.tool_call_id,
    payload?.data?.id,
  ];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return '';
};

export const createAIStreamEventParser = ({ includeRaw = false, rawMaxLen = 300 } = {}) => {
  let shouldAppendNextTextChunk = false;

  const buildToolThinkingChunk = (payload, kind) => {
    const toolName = normalizeText(resolveToolNameFromPayload(payload) || 'unknown_tool', 60);
    const rawPayloadText = payload?.rawContent || payload?.content || payload?.output || payload?.input || '';
    const fallback = kind === 'error' ? '工具执行失败' : kind === 'call' ? '已收到工具参数' : '工具执行完成';
    const localSummary = sanitizeSummary(pickSummary(toolName, kind, rawPayloadText), fallback);
    const backendSummary = sanitizeSummary(payload?.summary, '');
    const summary = backendSummary && !isLowQualitySummary(backendSummary) ? backendSummary : localSummary;
    const detailedText = pickDetailedToolText(payload, toolName, kind);

    const title = kind === 'call'
      ? `🔧 工具调用 · ${toolName}`
      : kind === 'result'
        ? `✅ 工具返回 · ${toolName}`
        : `❌ 工具异常 · ${toolName}`;

    let text = detailedText || summary;
    if (includeRaw && !detailedText) {
      const raw = normalizeText(rawPayloadText, rawMaxLen);
      if (raw) text = `${text}\n\n原文片段: ${raw}`;
    }

    return {
      type: 'thinking',
      strategy: 'append',
      status: kind === 'error' ? 'error' : 'complete',
      data: {
        title,
        text,
      },
    };
  };

  const buildEvent = (payload, type, sessionId) => {
    const source = normalizeText(payload?.source || 'chat', 24) || 'chat';
    const phase = normalizeText(payload?.phase || '', 24);
    const base = { type, source, sessionId, phase };

    if (type === 'meta') {
      return { ...base, tools: Array.isArray(payload?.tools) ? payload.tools : [] };
    }
    if (type === 'memory_metrics') {
      const metrics = payload?.metrics && typeof payload.metrics === 'object' ? payload.metrics : {};
      return { ...base, metrics };
    }
    if (type === 'tool_call' || type === 'tool_result' || type === 'tool_error') {
      const kind = type === 'tool_call' ? 'call' : type === 'tool_result' ? 'result' : 'error';
      const toolName = normalizeText(resolveToolNameFromPayload(payload), 60);
      const rawPayloadText = payload?.rawContent || payload?.content || payload?.output || payload?.input || '';
      const fallback = kind === 'error' ? '工具执行失败' : kind === 'call' ? '已收到工具参数' : '工具执行完成';
      const localSummary = sanitizeSummary(pickSummary(toolName, kind, rawPayloadText), fallback);
      const backendSummary = sanitizeSummary(payload?.summary, '');
      const summary = backendSummary && !isLowQualitySummary(backendSummary) ? backendSummary : localSummary;
      const detailedToolText = shouldPreferDetailedToolText(toolName, kind);
      return {
        ...base,
        toolName,
        toolCallId: normalizeText(resolveToolCallIdFromPayload(payload), 120),
        summary,
        content: detailedToolText ? normalizeMultilineText(payload?.content || '', 1200) : normalizeText(payload?.content || '', 1200),
        rawContent: detailedToolText ? normalizeMultilineText(rawPayloadText, 2600) : normalizeText(rawPayloadText, 2600),
      };
    }
    if (type === 'text' || type === 'think') {
      return { ...base, content: typeof payload?.content === 'string' ? payload.content : '' };
    }
    if (type === 'final') {
      return { ...base, result: payload?.result != null ? payload.result : payload };
    }
    if (type === 'error') {
      return { ...base, message: normalizeText(payload?.message || payload?.content || '请求失败', 300) };
    }
    if (type === 'ping') {
      return { ...base, ts: Number(payload?.ts) || Date.now() };
    }
    return base;
  };

  const parseChunk = (chunk) => {
    const rawPayload = parsePayload(chunk);
    const payload = normalizeUnifiedPayload(rawPayload);
    if (!payload) return null;

    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';
    const type = payload?.type || (payload?.content ? 'text' : '');
    const event = buildEvent(payload, type, sessionId);

    if (type === 'meta') {
      return { sessionId, content: null, event };
    }

    if (type === 'memory_metrics') {
      return { sessionId, content: null, event };
    }

    if (type === 'tool_call') {
      shouldAppendNextTextChunk = true;
      return { sessionId, content: buildToolThinkingChunk(payload, 'call'), event };
    }

    if (type === 'tool_result') {
      shouldAppendNextTextChunk = true;
      return { sessionId, content: buildToolThinkingChunk(payload, 'result'), event };
    }

    if (type === 'tool_error') {
      shouldAppendNextTextChunk = true;
      return { sessionId, content: buildToolThinkingChunk(payload, 'error'), event };
    }

    if (type === 'think') {
      shouldAppendNextTextChunk = true;
      return {
        sessionId,
        content: {
          type: 'thinking',
          strategy: 'append',
          data: {
            title: '思考中...',
            text: typeof payload?.content === 'string' ? payload.content : '',
          },
        },
        event,
      };
    }

    if (type === 'text' || typeof payload?.content === 'string') {
      const content = {
        type: 'markdown',
        data: typeof payload?.content === 'string' ? payload.content : '',
      };
      if (shouldAppendNextTextChunk) {
        content.strategy = 'append';
        shouldAppendNextTextChunk = false;
      }
      return {
        sessionId,
        content,
        event,
      };
    }

    return { sessionId, content: null, event };
  };

  return {
    parseChunk,
    reset() {
      shouldAppendNextTextChunk = false;
    },
  };
};

export default createAIStreamEventParser;

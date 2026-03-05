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
  const city = obj.city || obj.province || '';
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

  if (toolName.includes('weather')) {
    const weather = summarizeWeather(unwrapped);
    if (weather) return weather;
  }

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

export const createAIStreamEventParser = ({ includeRaw = false, rawMaxLen = 300 } = {}) => {
  const buildToolThinkingChunk = (payload, kind) => {
    const toolName = normalizeText(payload?.toolName || payload?.tool || payload?.name || 'unknown_tool', 60);
    const rawPayloadText = payload?.rawContent || payload?.content || payload?.output || payload?.input || '';
    const fallback = kind === 'error' ? '工具执行失败' : kind === 'call' ? '已收到工具参数' : '工具执行完成';
    const summary = sanitizeSummary(payload?.summary, sanitizeSummary(pickSummary(toolName, kind, rawPayloadText), fallback));

    const title = kind === 'call'
      ? `🔧 工具调用 · ${toolName}`
      : kind === 'result'
        ? `✅ 工具返回 · ${toolName}`
        : `❌ 工具异常 · ${toolName}`;

    let text = summary;
    if (includeRaw) {
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

  const parseChunk = (chunk) => {
    const payload = parsePayload(chunk);
    if (!payload) return null;

    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';
    const type = payload?.type || (payload?.content ? 'text' : '');

    if (type === 'meta') {
      return { sessionId, content: null };
    }

    if (type === 'tool_call') {
      return { sessionId, content: buildToolThinkingChunk(payload, 'call') };
    }

    if (type === 'tool_result') {
      return { sessionId, content: buildToolThinkingChunk(payload, 'result') };
    }

    if (type === 'tool_error') {
      return { sessionId, content: buildToolThinkingChunk(payload, 'error') };
    }

    if (type === 'think') {
      return {
        sessionId,
        content: {
          type: 'thinking',
          data: {
            title: '思考中...',
            text: typeof payload?.content === 'string' ? payload.content : '',
          },
        },
      };
    }

    if (type === 'text' || typeof payload?.content === 'string') {
      return {
        sessionId,
        content: {
          type: 'markdown',
          data: typeof payload?.content === 'string' ? payload.content : '',
        },
      };
    }

    return { sessionId, content: null };
  };

  return {
    parseChunk,
    reset() {
      // parser currently stateless, reserved for future stateful merge
    },
  };
};

export default createAIStreamEventParser;

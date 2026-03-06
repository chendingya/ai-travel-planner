const MAX_TEXT = 220;

const normalizeText = (value, maxLen = MAX_TEXT) => {
  if (value == null) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
};

const parseJsonLoose = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {}

  const noEllipsis = text.replace(/\s*\.\.\.\s*$/, '');
  try {
    return JSON.parse(noEllipsis);
  } catch (_) {}

  const firstObj = noEllipsis.indexOf('{');
  const firstArr = noEllipsis.indexOf('[');
  const start = firstObj >= 0 && firstArr >= 0 ? Math.min(firstObj, firstArr) : Math.max(firstObj, firstArr);
  if (start < 0) return null;

  const startChar = noEllipsis[start];
  const endChar = startChar === '{' ? '}' : ']';
  let end = noEllipsis.lastIndexOf(endChar);
  while (end > start) {
    const candidate = noEllipsis.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}
    end = noEllipsis.lastIndexOf(endChar, end - 1);
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
  } catch (_) {
    return m[1] || '';
  }
};

const unwrapToolPayload = (value, depth = 0) => {
  if (depth > 5 || value == null) return value;

  if (typeof value === 'string') {
    const parsed = parseJsonLoose(value);
    if (parsed != null) return unwrapToolPayload(parsed, depth + 1);
    const kwargsContent = extractQuotedJsonString(value, 'content');
    if (kwargsContent) {
      const parsedContent = parseJsonLoose(kwargsContent);
      if (parsedContent != null) return unwrapToolPayload(parsedContent, depth + 1);
      return kwargsContent;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 1) return unwrapToolPayload(value[0], depth + 1);
    return value;
  }

  if (typeof value === 'object') {
    if (value.kwargs?.content != null) return unwrapToolPayload(value.kwargs.content, depth + 1);
    if (value.additional_kwargs?.content != null) return unwrapToolPayload(value.additional_kwargs.content, depth + 1);
    if (value.data?.content != null) return unwrapToolPayload(value.data.content, depth + 1);
    if (value.output != null) return unwrapToolPayload(value.output, depth + 1);
    if (value.result != null) return unwrapToolPayload(value.result, depth + 1);
    if (value.content != null && value.content !== value) return unwrapToolPayload(value.content, depth + 1);
    if (value.input != null && value.input !== value) return unwrapToolPayload(value.input, depth + 1);
    return value;
  }

  return value;
};

const pickStr = (obj, keys = []) => {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const firstLine = (value) => {
  if (typeof value !== 'string') return '';
  const lines = value
    .split('\n')
    .map((line) => line.replace(/^[#>*\-\s`]+/, '').trim())
    .filter(Boolean);
  return lines[0] || '';
};

const stringifyForStream = (value, maxLen = 1800) => {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (value == null) {
    text = '';
  } else {
    try {
      text = JSON.stringify(value);
    } catch (_) {
      text = String(value);
    }
  }
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > maxLen ? `${compact.slice(0, maxLen)}...` : compact;
};

const normalizeToolNameValue = (value) => {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  const lowered = text.toLowerCase();
  const invalid = new Set([
    'tool',
    'tools',
    'langchain',
    'runnable',
    'runnables',
    'dynamictool',
    'dynamicstructuredtool',
  ]);
  if (invalid.has(lowered)) return '';
  return text;
};

const resolveToolName = (input = {}) => {
  if (typeof input === 'string') return normalizeToolNameValue(input) || 'tool';
  if (!input || typeof input !== 'object') return 'tool';

  const event = input.event && typeof input.event === 'object' ? input.event : null;
  const data = input.data && typeof input.data === 'object' ? input.data : event?.data;
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : event?.metadata;

  const candidates = [
    input.toolName,
    input.tool_name,
    input.name,
    input.tool,
    event?.name,
    data?.name,
    metadata?.tool_name,
    metadata?.name,
  ];

  for (const item of candidates) {
    const normalized = normalizeToolNameValue(item);
    if (normalized) return normalized;
  }

  const fallback = normalizeToolNameValue(input.fallback);
  return fallback || 'tool';
};

const toCallIdToken = (value) => normalizeText(value, 64).replace(/[^a-zA-Z0-9:_\-\.]/g, '');

const fallbackToolCallId = (toolName, rawValue) => {
  const left = toCallIdToken(toolName || 'tool') || 'tool';
  const right = toCallIdToken(stringifyForStream(rawValue, 72)) || 'na';
  return `${left}:${right}`;
};

const resolveToolCallId = (input = {}) => {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object') return '';

  const event = input.event && typeof input.event === 'object' ? input.event : null;
  const data = input.data && typeof input.data === 'object' ? input.data : event?.data;

  const candidates = [
    input.toolCallId,
    input.tool_call_id,
    input.runId,
    input.run_id,
    input.id,
    event?.run_id,
    data?.tool_call_id,
    data?.id,
  ];

  for (const item of candidates) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }

  const fallback = fallbackToolCallId(resolveToolName(input), input.rawValue);
  return fallback || '';
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
      if (typeof item === 'object') return pickStr(item, ['name', 'title', 'poi_name']);
      return '';
    })
    .filter(Boolean);
  const firstPoi = pois[0] && typeof pois[0] === 'object' ? pois[0] : null;
  const city = pickStr(obj, ['city', 'cityname']) || pickStr(firstPoi, ['cityname', 'city']) || '';
  if (!names.length) return normalizeText(`${city ? `${city} ` : ''}找到${pois.length}个地点`, 180);
  const suffix = pois.length > names.length ? '等' : '';
  return normalizeText(`${city ? `${city} ` : ''}找到${pois.length}个地点：${names.join('、')}${suffix}`, 180);
};

const summarizeWebResults = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  const list = Array.isArray(obj.results) ? obj.results : Array.isArray(obj.data) ? obj.data : [];
  if (!list.length) return '';
  const titles = list
    .slice(0, 3)
    .map((item) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      if (typeof item === 'object') return pickStr(item, ['title', 'name', 'snippet']);
      return '';
    })
    .filter(Boolean);
  if (!titles.length) return normalizeText(`返回${list.length}条结果`, 120);
  const suffix = list.length > titles.length ? '等' : '';
  return normalizeText(`返回${list.length}条结果：${titles.join('；')}${suffix}`, 180);
};

const summarizeGeoResults = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  const rows = Array.isArray(obj.return) ? obj.return : Array.isArray(obj.geocodes) ? obj.geocodes : [];
  if (!rows.length) return '';
  const names = rows
    .slice(0, 2)
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const country = pickStr(item, ['country']);
      const province = pickStr(item, ['province']);
      const city = pickStr(item, ['city', 'cityname']);
      const district = pickStr(item, ['district']);
      const pieces = [country, province, city, district].filter(Boolean);
      return pieces.join(' ');
    })
    .filter(Boolean);
  if (!names.length) return normalizeText(`返回${rows.length}条地理结果`, 160);
  const suffix = rows.length > names.length ? '等' : '';
  return normalizeText(`返回${rows.length}条地理结果：${names.join('；')}${suffix}`, 180);
};

const summarizeToolPayload = ({ toolName = '', phase = 'result', value }) => {
  const phaseName = typeof phase === 'string' ? phase : 'result';
  const name = resolveToolName({ toolName, fallback: 'tool' });
  const data = unwrapToolPayload(value, 0);

  if (phaseName === 'call') {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const city = pickStr(data, ['city', 'cityname']) || pickStr(data.input, ['city', 'cityname']);
      const keyword =
        pickStr(data, ['keyword', 'keywords', 'query', 'q']) ||
        pickStr(data.input, ['keyword', 'keywords', 'query', 'q']);
      if (city || keyword) {
        const parts = [];
        if (city) parts.push(`city=${city}`);
        if (keyword) parts.push(`keyword=${keyword}`);
        return parts.join('，');
      }
      const keys = Object.keys(data).slice(0, 3);
      if (keys.length) {
        return keys
          .map((key) => `${key}=${normalizeText(typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key], 50)}`)
          .join('，');
      }
      return '已收到工具参数';
    }
    if (typeof data === 'string') {
      return normalizeText(firstLine(data) || data || '已收到工具参数', 180);
    }
    return '已收到工具参数';
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const hasForecast = Array.isArray(data.forecasts) && data.forecasts.length > 0;
    if (name.includes('weather') || hasForecast) {
      const city = pickStr(data, ['city', 'province', 'cityname']);
      const first = Array.isArray(data.forecasts) ? data.forecasts[0] : null;
      if (city && first) {
        return normalizeText(
          `${city} ${first.date || ''} 白天${first.dayweather || ''} ${first.daytemp || ''}°C，夜间${first.nightweather || ''} ${first.nighttemp || ''}°C`,
          180
        );
      }
    }

    const poiSummary = summarizePoiResults(data);
    if (poiSummary) return poiSummary;

    const webSummary = summarizeWebResults(data);
    if (webSummary) return webSummary;

    const geoSummary = summarizeGeoResults(data);
    if (geoSummary) return geoSummary;

    if (typeof data.status === 'string' && typeof data.content === 'string') {
      const line = firstLine(data.content);
      if (line) return normalizeText(`${data.status}: ${line}`, 180);
    }

    const keys = Object.keys(data).slice(0, 3);
    if (keys.length) {
      return keys
        .map((key) => `${key}=${normalizeText(typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key], 50)}`)
        .join('，');
    }
  }

  const fallback = phaseName === 'error' ? '工具执行失败' : '工具执行完成';
  if (typeof data === 'string') return normalizeText(firstLine(data) || data || fallback, 180);
  return fallback;
};

const buildToolEventPayload = ({ source = 'chat', phase = 'result', toolName = '', toolCallId = '', rawValue, eventPhase = '' }) => {
  const phaseName = phase === 'call' || phase === 'result' || phase === 'error' ? phase : 'result';
  const typeMap = { call: 'tool_call', result: 'tool_result', error: 'tool_error' };
  const normalizedToolName = resolveToolName({ toolName, fallback: 'tool' });
  const providedToolCallId = typeof toolCallId === 'string' ? toolCallId.trim() : '';
  const normalizedToolCallId = providedToolCallId || fallbackToolCallId(normalizedToolName, rawValue);
  const normalized = unwrapToolPayload(rawValue, 0);
  const payload = {
    source,
    type: typeMap[phaseName],
    toolName: normalizedToolName,
    toolCallId: normalizedToolCallId,
    summary: summarizeToolPayload({ toolName: normalizedToolName, phase: phaseName, value: rawValue }),
    content: stringifyForStream(normalized, 1200),
    rawContent: stringifyForStream(rawValue, 2600),
  };
  if (eventPhase) payload.phase = eventPhase;
  return payload;
};

const buildToolEventFromLangChainEvent = (event, { source = 'chat' } = {}) => {
  const eventName = typeof event?.event === 'string' ? event.event : '';
  let phase = '';
  if (eventName === 'on_tool_start') phase = 'call';
  if (eventName === 'on_tool_end') phase = 'result';
  if (eventName === 'on_tool_error') phase = 'error';
  if (!phase) return null;

  const rawValue =
    phase === 'call'
      ? event?.data?.input ?? event?.data?.inputs ?? event?.data ?? null
      : phase === 'result'
        ? event?.data?.output ?? event?.data ?? null
        : event?.data?.error ?? event?.data ?? 'Tool call failed';

  const toolName = resolveToolName({ event, data: event?.data, metadata: event?.metadata, fallback: 'tool' });
  const toolCallId = resolveToolCallId({
    event,
    data: event?.data,
    runId: event?.run_id,
    toolName,
    rawValue,
  });

  return buildToolEventPayload({
    source,
    phase,
    toolName,
    toolCallId,
    rawValue,
  });
};

const createToolStepCallbacks = ({
  onStep,
  source = 'plan',
  callPhase = 'tooling',
  resultPhase = 'synthesis',
  errorPhase = 'synthesis',
} = {}) => {
  if (typeof onStep !== 'function') return null;

  const queue = [];
  const runIdMap = new Map();

  const emit = (kind, toolName, toolCallId, rawValue) => {
    const eventPhase = kind === 'call' ? callPhase : kind === 'error' ? errorPhase : resultPhase;
    onStep(
      buildToolEventPayload({
        source,
        phase: kind,
        toolName,
        toolCallId,
        rawValue,
        eventPhase,
      })
    );
  };

  return {
    handleToolStart: (tool, input, runId, parentRunId, tags, metadata) => {
      const toolName = resolveToolName({
        toolName: tool?.name,
        metadata,
        fallback: 'tool',
      });
      const toolCallId = resolveToolCallId({ runId, toolName, rawValue: input });
      const entry = { toolName, toolCallId };
      queue.push(entry);
      if (typeof runId === 'string' && runId.trim()) runIdMap.set(runId.trim(), entry);
      emit('call', toolName, toolCallId, input);
    },
    handleToolEnd: (output, runId) => {
      const runKey = typeof runId === 'string' ? runId.trim() : '';
      const entry = (runKey && runIdMap.get(runKey)) || queue.shift() || null;
      if (runKey) runIdMap.delete(runKey);
      const toolName = entry?.toolName || resolveToolName({ fallback: 'tool' });
      const toolCallId = entry?.toolCallId || resolveToolCallId({ runId, toolName, rawValue: output });
      emit('result', toolName, toolCallId, output);
    },
    handleToolError: (error, runId) => {
      const runKey = typeof runId === 'string' ? runId.trim() : '';
      const entry = (runKey && runIdMap.get(runKey)) || queue.shift() || null;
      if (runKey) runIdMap.delete(runKey);
      const toolName = entry?.toolName || resolveToolName({ fallback: 'tool' });
      const toolCallId = entry?.toolCallId || resolveToolCallId({ runId, toolName, rawValue: error });
      emit('error', toolName, toolCallId, error || 'Tool call failed');
    },
    handleAgentAction: (action) => {
      const rawInput = action?.toolInput ?? action?.tool_input ?? action?.input ?? null;
      const toolName = resolveToolName({
        toolName: action?.tool || action?.toolName || action?.name,
        fallback: 'tool',
      });
      const toolCallId = resolveToolCallId({
        toolCallId: action?.toolCallId || action?.tool_call_id || action?.id || action?.runId || action?.run_id,
        toolName,
        rawValue: rawInput,
      });
      emit('call', toolName, toolCallId, rawInput);
    },
  };
};

module.exports = {
  unwrapToolPayload,
  resolveToolName,
  resolveToolCallId,
  summarizeToolPayload,
  buildToolEventPayload,
  buildToolEventFromLangChainEvent,
  createToolStepCallbacks,
};

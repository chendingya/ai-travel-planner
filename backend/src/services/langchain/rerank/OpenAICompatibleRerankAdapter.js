const { ChatOpenAI } = require('@langchain/openai');
const OpenAI = require('openai');
const BaseRerankAdapter = require('./BaseRerankAdapter');

function extractFirstJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return '';

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) return fencedMatch[1].trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

function parseScoresFromJsonText(rawText, expectedCount) {
  const payload = extractFirstJsonObject(rawText);
  const parsed = JSON.parse(payload);

  let scores = [];
  if (Array.isArray(parsed)) {
    scores = parsed.map((item) => Number(item?.score ?? item?.relevance_score ?? item));
  } else if (Array.isArray(parsed?.scores)) {
    scores = parsed.scores.map((item) => Number(item));
  } else if (Array.isArray(parsed?.results)) {
    scores = parsed.results.map((item) => Number(item?.relevance_score ?? item?.score ?? 0));
  } else if (Array.isArray(parsed?.data)) {
    scores = parsed.data.map((item) => Number(item?.score ?? item?.relevance_score ?? 0));
  }

  const normalized = scores.map((item) => (Number.isFinite(item) ? item : 0));
  if (Number.isFinite(expectedCount) && expectedCount > 0) {
    if (normalized.length < expectedCount) {
      return normalized.concat(new Array(expectedCount - normalized.length).fill(0));
    }
    return normalized.slice(0, expectedCount);
  }
  return normalized;
}

function parseScoresFromLooseText(rawText, expectedCount) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lineScores = lines
    .map((line) => {
      const cleaned = line.replace(/^[\-\*\d\s\.\):]+/, '').trim() || line;
      const nums = cleaned.match(/-?\d+(?:\.\d+)?/g) || [];
      if (!nums.length) return null;
      const parsed = nums.map((item) => Number(item)).filter((item) => Number.isFinite(item));
      if (!parsed.length) return null;
      const bounded = parsed.find((item) => item >= 0 && item <= 1);
      return bounded ?? parsed[parsed.length - 1];
    })
    .filter((item) => Number.isFinite(item));

  if (Number.isFinite(expectedCount) && expectedCount > 0 && lineScores.length >= expectedCount) {
    return lineScores.slice(0, expectedCount);
  }

  const allNumbers = (text.match(/-?\d+(?:\.\d+)?/g) || [])
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));

  const boundedNumbers = allNumbers.filter((item) => item >= 0 && item <= 1);
  const picked = boundedNumbers.length >= (expectedCount || 1) ? boundedNumbers : allNumbers;

  if (Number.isFinite(expectedCount) && expectedCount > 0) {
    if (picked.length < expectedCount) {
      return picked.concat(new Array(expectedCount - picked.length).fill(0));
    }
    return picked.slice(0, expectedCount);
  }

  return picked;
}

function parseScores(rawText, expectedCount) {
  try {
    return parseScoresFromJsonText(rawText, expectedCount);
  } catch (_) {
    return parseScoresFromLooseText(rawText, expectedCount);
  }
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallback;
}

function truncateForPrompt(value, maxChars) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  const limit = toPositiveInt(maxChars, 200);
  if (normalized.length <= limit) return normalized;
  if (limit <= 1) return normalized.slice(0, limit);
  return `${normalized.slice(0, limit - 1)}…`;
}

function compactDocumentsForPrompt(docs, options = {}) {
  const totalBudget = toPositiveInt(
    options.totalDocChars ?? process.env.AI_RERANK_TOTAL_DOC_CHARS,
    2400
  );
  const perDocLimit = toPositiveInt(
    options.maxDocChars ?? process.env.AI_RERANK_DOC_MAX_CHARS,
    240
  );
  const minDocLimit = toPositiveInt(
    options.minDocChars ?? process.env.AI_RERANK_DOC_MIN_CHARS,
    60
  );

  const list = Array.isArray(docs) ? docs : [];
  if (!list.length) return [];

  const dynamicLimit = Math.max(minDocLimit, Math.floor(totalBudget / list.length));
  const finalPerDocLimit = Math.min(perDocLimit, dynamicLimit);

  return list.map((doc, index) => `[${index}] ${truncateForPrompt(doc, finalPerDocLimit)}`);
}

function buildRerankPrompts(query, docs, options = {}) {
  const queryLimit = toPositiveInt(
    options.maxQueryChars ?? process.env.AI_RERANK_QUERY_MAX_CHARS,
    400
  );
  const compactQuery = truncateForPrompt(query, queryLimit);
  const compactDocs = compactDocumentsForPrompt(docs, options);

  return {
    systemPrompt: [
      'You are a reranker.',
      'Return strict JSON only.',
      'Format exactly as {"scores":[0.0]}.',
      'Use one score per document in the same order as input.',
      'Each score must be a number between 0 and 1.',
      'Do not include any explanation, markdown, or extra text.',
    ].join(' '),
    userPrompt: [
      `Query: ${compactQuery}`,
      '',
      'Documents:',
      ...compactDocs,
      '',
      'Return JSON only in this exact shape:',
      `{"scores":[${compactDocs.map(() => '0.0').join(',')}]}`,
    ].join('\n'),
  };
}

class OpenAICompatibleRerankAdapter extends BaseRerankAdapter {
  requestTimeoutMs() {
    const envTimeout = Number(process.env.AI_RERANK_HTTP_TIMEOUT_MS || process.env.AI_CHAT_MODEL_HTTP_TIMEOUT_MS || this.timeoutMs || 10000);
    return Number.isFinite(envTimeout) && envTimeout > 0 ? Math.max(1000, envTimeout) : 10000;
  }

  maxRetries() {
    const raw = Number(process.env.AI_RERANK_HTTP_MAX_RETRIES || process.env.AI_CHAT_MODEL_HTTP_MAX_RETRIES || '0');
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }

  _joinBaseAndPath(baseURL, path) {
    const base = String(baseURL || '').trim().replace(/\/+$/, '');
    const p = String(path || '').trim().startsWith('/') ? String(path || '').trim() : `/${String(path || '').trim()}`;
    if (base.toLowerCase().endsWith('/v1') && p.toLowerCase().startsWith('/v1/')) {
      return `${base}${p.slice(3)}`;
    }
    return `${base}${p}`;
  }

  _resolvedOpenAIBaseURL() {
    const normalizedPath = String(this.path || '').trim();
    if (!normalizedPath) return this.baseURL;
    const full = this._joinBaseAndPath(this.baseURL, normalizedPath);
    return full
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/responses$/i, '');
  }

  _normalizeTextContent(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            if (typeof part.text === 'string') return part.text;
            if (typeof part.content === 'string') return part.content;
            if (typeof part.value === 'string') return part.value;
          }
          return '';
        })
        .join('');
    }
    if (value && typeof value === 'object') {
      if (typeof value.content === 'string') return value.content;
      if (typeof value.text === 'string') return value.text;
    }
    return '';
  }

  _extractResponseText(json) {
    if (typeof json?.output_text === 'string' && json.output_text.trim()) {
      return json.output_text.trim();
    }

    const outputItems = Array.isArray(json?.output) ? json.output : [];
    const parts = [];
    outputItems.forEach((item) => {
      const contentItems = Array.isArray(item?.content) ? item.content : [];
      contentItems.forEach((content) => {
        const textValue = typeof content?.text === 'string' ? content.text : '';
        if (textValue) parts.push(textValue);
      });
    });
    if (parts.length) return parts.join('\n').trim();

    const chatContent = json?.choices?.[0]?.message?.content;
    if (typeof chatContent === 'string') return chatContent.trim();
    if (Array.isArray(chatContent)) {
      const textParts = chatContent
        .map((item) => (typeof item?.text === 'string' ? item.text : ''))
        .filter(Boolean);
      if (textParts.length) return textParts.join('\n').trim();
    }

    return '';
  }

  _createChatLLM() {
    return new ChatOpenAI({
      apiKey: this.apiKey || undefined,
      configuration: this._resolvedOpenAIBaseURL() ? { baseURL: this._resolvedOpenAIBaseURL() } : undefined,
      modelName: this.model,
      temperature: 0,
      maxTokens: 1024,
      timeout: this.requestTimeoutMs(),
      maxRetries: this.maxRetries(),
      streaming: false,
    });
  }

  async _rerankViaChatOpenAI(query, docs) {
    const { systemPrompt, userPrompt } = buildRerankPrompts(query, docs);

    const llm = this._createChatLLM();
    const result = await llm.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const content = this._normalizeTextContent(result && typeof result === 'object' ? result.content : result);
    if (!content || !content.trim()) {
      throw new Error('OpenAI Rerank 缺少可解析文本');
    }
    return parseScores(content, docs.length);
  }

  async _rerankViaResponses(query, docs) {
    const { systemPrompt, userPrompt } = buildRerankPrompts(query, docs);

    const client = new OpenAI({
      apiKey: this.apiKey || undefined,
      baseURL: this._resolvedOpenAIBaseURL() || undefined,
      timeout: this.requestTimeoutMs(),
      maxRetries: this.maxRetries(),
    });

    const resp = await client.responses.create({
      model: this.model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_output_tokens: Math.min(1024, Math.max(128, docs.length * 8)),
    });

    const text = this._extractResponseText(resp);
    if (!text || !text.trim()) {
      throw new Error('OpenAI Rerank Responses 缺少可解析文本');
    }
    return parseScores(text, docs.length);
  }

  async rerank(query, documents) {
    const docs = Array.isArray(documents) ? documents : [];
    if (!docs.length) return [];

    const normalizedPath = String(this.path || '').trim().toLowerCase();
    const isResponsesApi = normalizedPath.includes('/v1/responses');
    const scores = isResponsesApi
      ? await this._rerankViaResponses(query, docs)
      : await this._rerankViaChatOpenAI(query, docs);

    return scores.map((score, index) => ({ index, score }));
  }
}

module.exports = OpenAICompatibleRerankAdapter;
module.exports.__private = {
  extractFirstJsonObject,
  parseScoresFromJsonText,
  parseScoresFromLooseText,
  parseScores,
  buildRerankPrompts,
};

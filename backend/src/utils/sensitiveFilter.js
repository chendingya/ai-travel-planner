function normalizeText(input) {
  let s = typeof input === 'string' ? input : String(input ?? '');
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '').trim();
  return s;
}

function rules() {
  return [
    {
      id: 'nanjing-memorial-full',
      re: /memorial hall of the victims in nanjing massacre by japanese invaders/gi,
      replacement: 'solemn memorial museum in Nanjing',
    },
    { id: 'nanjing-massacre', re: /nanjing massacre/gi, replacement: 'a historic tragedy' },
    { id: 'japanese-invaders', re: /japanese invaders/gi, replacement: 'foreign invaders' },
    { id: 'massacre', re: /\bmassacre\b/gi, replacement: 'tragedy' },
    { id: 'victims', re: /\bvictims?\b/gi, replacement: 'people' },
  ];
}

function detect(text) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  const matched = [];
  for (const r of rules()) {
    r.re.lastIndex = 0;
    if (r.re.test(s)) matched.push(r.id);
  }
  return matched;
}

function soften(text, level = 1) {
  let s = typeof text === 'string' ? text : String(text ?? '');
  s = s.replace(/\bday\s*\d+\s*:\s*/gi, '');

  for (const r of rules()) {
    s = s.replace(r.re, r.replacement);
  }

  if (level >= 2) {
    const extra = [
      { re: /\bwarfare\b/gi, replacement: 'history' },
      { re: /\bterrorism\b/gi, replacement: 'violence' },
      { re: /\bgenocide\b/gi, replacement: 'tragedy' },
    ];
    for (const r of extra) s = s.replace(r.re, r.replacement);
  }

  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function isInvalidPromptError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return lower.includes('invalid prompt') || lower.includes('prompt length more than 2000');
}

function prepareImagePrompt(prompt) {
  const normalized = normalizeText(prompt);
  const matched = detect(normalized);
  const prepared = matched.length ? soften(normalized, 1) : normalized;
  return { normalized, prepared, matched };
}

function prepareMessages(messages, options = {}) {
  const input = Array.isArray(messages) ? messages : [];
  const mode = typeof options.mode === 'string' ? options.mode : 'auto';
  const systemText = input
    .filter((m) => m && typeof m === 'object' && m.role === 'system' && typeof m.content === 'string')
    .map((m) => m.content)
    .join('\n');

  const shouldSoftenUser =
    mode === 'soften' ||
    (mode === 'auto' &&
      (systemText.includes('图像生成模型') ||
        systemText.includes('提示词') ||
        systemText.toLowerCase().includes('prompt')));

  return input.map((m) => {
    if (!m || typeof m !== 'object') return m;
    if (typeof m.content !== 'string') return m;
    const normalized = normalizeText(m.content);
    if (m.role === 'user' && shouldSoftenUser) {
      return { ...m, content: soften(normalized, 1) };
    }
    return { ...m, content: normalized };
  });
}

module.exports = {
  normalizeText,
  detect,
  soften,
  isInvalidPromptError,
  prepareImagePrompt,
  prepareMessages,
};


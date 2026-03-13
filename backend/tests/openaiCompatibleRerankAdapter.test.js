const test = require('node:test');
const assert = require('node:assert/strict');

const OpenAICompatibleRerankAdapter = require('../src/services/langchain/rerank/OpenAICompatibleRerankAdapter');

test('parseScores keeps strict JSON parsing when payload is valid', () => {
  const scores = OpenAICompatibleRerankAdapter.__private.parseScores('{"scores":[0.91,0.27]}', 2);
  assert.deepEqual(scores, [0.91, 0.27]);
});

test('parseScores falls back to loose text when model returns prose', () => {
  const raw = 'Okay, the score is 0.87 for this document.';
  const scores = OpenAICompatibleRerankAdapter.__private.parseScores(raw, 1);
  assert.deepEqual(scores, [0.87]);
});

test('parseScores extracts per-line scores from non-JSON list output', () => {
  const raw = [
    'Here are the relevance scores:',
    '1. document one => 0.82',
    '2. document two => 0.31',
  ].join('\n');
  const scores = OpenAICompatibleRerankAdapter.__private.parseScores(raw, 2);
  assert.deepEqual(scores, [0.82, 0.31]);
});

test('buildRerankPrompts compacts long query and documents for small-context models', () => {
  const query = '杭州'.repeat(300);
  const docs = [
    '西湖'.repeat(300),
    '灵隐寺'.repeat(300),
  ];

  const prompt = OpenAICompatibleRerankAdapter.__private.buildRerankPrompts(query, docs, {
    maxQueryChars: 80,
    maxDocChars: 90,
    totalDocChars: 120,
  });

  assert.match(prompt.userPrompt, /Query:/);
  assert.match(prompt.userPrompt, /\[0\]/);
  assert.match(prompt.userPrompt, /\[1\]/);
  assert.match(prompt.userPrompt, /"scores":\[/);
  assert.equal(prompt.userPrompt.includes('西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖西湖'), false);
});

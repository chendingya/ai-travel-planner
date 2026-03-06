const test = require('node:test');
const assert = require('node:assert/strict');

const {
  unwrapToolPayload,
  resolveToolName,
  resolveToolCallId,
  summarizeToolPayload,
  buildToolEventPayload,
  buildToolEventFromLangChainEvent,
  createToolStepCallbacks,
} = require('../src/services/ai/streamToolEvents');

test('unwrapToolPayload: supports nested kwargs content JSON', () => {
  const raw = '{"kwargs":{"content":"{\\"city\\":\\"杭州\\",\\"query\\":\\"西湖\\"}"}}';
  const unwrapped = unwrapToolPayload(raw);
  assert.equal(typeof unwrapped, 'object');
  assert.equal(unwrapped.city, '杭州');
  assert.equal(unwrapped.query, '西湖');
});

test('resolveToolName: resolves standard input and falls back to tool', () => {
  assert.equal(resolveToolName({ toolName: 'maps_text_search' }), 'maps_text_search');
  assert.equal(resolveToolName({ event: { name: 'maps_weather' } }), 'maps_weather');
  assert.equal(resolveToolName({}), 'tool');
});

test('resolveToolCallId: resolves direct IDs and fallback IDs', () => {
  assert.equal(resolveToolCallId({ toolCallId: 'run-123' }), 'run-123');
  const fallback = resolveToolCallId({
    toolName: 'maps_weather',
    rawValue: { city: '杭州' },
  });
  assert.ok(fallback.startsWith('maps_weather:'));
});

test('summarizeToolPayload: summarizes weather and poi payloads', () => {
  const weather = summarizeToolPayload({
    toolName: 'maps_weather',
    phase: 'result',
    value: {
      city: '杭州',
      forecasts: [{ date: '2026-03-06', dayweather: '多云', daytemp: '12', nightweather: '多云', nighttemp: '5' }],
    },
  });
  assert.ok(weather.includes('杭州'));
  assert.ok(weather.includes('白天'));

  const poi = summarizeToolPayload({
    toolName: 'maps_text_search',
    phase: 'result',
    value: {
      city: '杭州',
      pois: [{ name: '西湖餐厅' }, { name: '楼外楼' }],
    },
  });
  assert.ok(poi.includes('找到2个地点'));
  assert.ok(poi.includes('西湖餐厅'));
});

test('summarizeToolPayload: call phase object fallback is readable', () => {
  const summary = summarizeToolPayload({
    toolName: 'get-current-date',
    phase: 'call',
    value: {},
  });
  assert.equal(summary, '已收到工具参数');
  assert.notEqual(summary, '[object Object]');
});

test('summarizeToolPayload: summarizes geo return payloads', () => {
  const summary = summarizeToolPayload({
    toolName: 'maps_geo',
    phase: 'result',
    value: {
      return: [{ country: '中国', province: '江西省', city: '南昌市' }],
    },
  });
  assert.ok(summary.includes('返回1条地理结果'));
  assert.ok(summary.includes('江西省'));
});

test('buildToolEventPayload: always returns unified fields', () => {
  const payload = buildToolEventPayload({
    source: 'chat',
    phase: 'call',
    toolName: 'maps_text_search',
    toolCallId: '',
    rawValue: { city: '杭州', keyword: '西湖' },
  });

  assert.equal(payload.source, 'chat');
  assert.equal(payload.type, 'tool_call');
  assert.ok(payload.toolName);
  assert.ok(payload.toolCallId);
  assert.equal(typeof payload.summary, 'string');
  assert.equal(typeof payload.content, 'string');
  assert.equal(typeof payload.rawContent, 'string');
});

test('buildToolEventFromLangChainEvent: maps on_tool_start correctly', () => {
  const event = {
    event: 'on_tool_start',
    run_id: 'rid-1',
    name: 'maps_weather',
    data: { input: { city: '杭州' } },
  };
  const payload = buildToolEventFromLangChainEvent(event, { source: 'chat' });
  assert.ok(payload);
  assert.equal(payload.type, 'tool_call');
  assert.equal(payload.toolName, 'maps_weather');
  assert.equal(payload.toolCallId, 'rid-1');
});

test('createToolStepCallbacks: emits ordered call/result events for plan', () => {
  const events = [];
  const callbacks = createToolStepCallbacks({
    source: 'plan',
    onStep: (payload) => events.push(payload),
  });
  assert.ok(callbacks);

  callbacks.handleToolStart({ name: 'maps_weather' }, { city: '杭州' }, 'run-1');
  callbacks.handleToolEnd(
    {
      city: '杭州',
      forecasts: [{ date: '2026-03-06', dayweather: '多云', daytemp: '12', nightweather: '多云', nighttemp: '5' }],
    },
    'run-1'
  );

  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'tool_call');
  assert.equal(events[0].phase, 'tooling');
  assert.equal(events[1].type, 'tool_result');
  assert.equal(events[1].phase, 'synthesis');
  assert.equal(events[0].toolName, 'maps_weather');
  assert.equal(events[1].toolName, 'maps_weather');
  assert.equal(events[0].toolCallId, events[1].toolCallId);
  assert.notEqual(events[0].toolName, 'unknown_tool');
});

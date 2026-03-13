const { getEnabledTextProviders, getEnabledImageProviders } = require('../src/config');
const supabase = require('../src/supabase');
const LangChainManager = require('../src/services/langchain/LangChainManager');
const LongTermMemoryService = require('../src/services/ai/longTermMemoryService');
const SemanticMemoryService = require('../src/services/ai/semanticMemoryService');

function requireUserId(value) {
  const userId = typeof value === 'string' ? value.trim() : '';
  if (!userId) {
    const err = new Error('用户身份缺失');
    err.status = 401;
    throw err;
  }
  return userId;
}

function truncateText(text, maxChars) {
  const raw = typeof text === 'string' ? text : String(text ?? '');
  const limit = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Number(maxChars) : 4000;
  if (raw.length <= limit) return raw;
  return raw.slice(0, limit);
}

function toChatTurns(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const turns = [];
  for (let i = 0; i < list.length; i += 1) {
    const current = list[i];
    const next = list[i + 1];
    if (!current || current.role !== 'user') continue;
    if (!next || next.role !== 'assistant') continue;
    const userMessage = typeof current.content === 'string' ? current.content.trim() : '';
    const assistantMessage = typeof next.content === 'string' ? next.content.trim() : '';
    if (!userMessage || !assistantMessage) continue;
    turns.push({ userMessage, assistantMessage });
  }
  return turns;
}

async function loadRecentSessions(days = 90) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('ai_chat_sessions')
    .select('conversation_id, user_id, messages, updated_at')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

async function main() {
  const langChainManager = new LangChainManager(getEnabledTextProviders(), getEnabledImageProviders());
  const longTermMemoryService = new LongTermMemoryService({
    supabase,
    langChainManager,
    requireUserId,
    truncateText,
  });
  const semanticMemoryService = new SemanticMemoryService({
    supabase,
    langChainManager,
    requireUserId,
    truncateText,
  });

  if (!semanticMemoryService.isAvailable()) {
    console.error('Semantic memory embedding provider is not available. Check ModelScope token or AI_EMBEDDING_* env vars.');
    process.exit(1);
  }

  const sessions = await loadRecentSessions(90);
  console.log(`Scanning ${sessions.length} sessions from the last 90 days...`);

  let extractedTurns = 0;
  let upsertedCount = 0;
  for (const session of sessions) {
    const userId = typeof session?.user_id === 'string' ? session.user_id : '';
    const sessionId = typeof session?.conversation_id === 'string' ? session.conversation_id : '';
    if (!userId || !sessionId) continue;

    let structuredMemories = [];
    try {
      structuredMemories = await longTermMemoryService.loadLongTermMemories(userId);
    } catch (error) {
      console.warn(`Skip session ${sessionId}: failed to load long memories - ${error?.message || error}`);
      continue;
    }

    const turns = toChatTurns(session?.messages);
    for (const turn of turns) {
      extractedTurns += 1;
      try {
        const candidates = await semanticMemoryService.extractSemanticMemoryCandidates({
          userMessage: turn.userMessage,
          assistantMessage: turn.assistantMessage,
          structuredMemories,
        });
        if (!candidates.length) continue;
        upsertedCount += await semanticMemoryService.upsertSemanticMemories({
          userId,
          sessionId,
          candidates,
        });
      } catch (error) {
        console.warn(`Semantic backfill failed for session ${sessionId}: ${error?.message || error}`);
      }
    }
  }

  console.log(`Semantic memory backfill completed. Turns scanned=${extractedTurns}, memories upserted=${upsertedCount}`);
}

main().catch((error) => {
  console.error('Semantic memory backfill failed:', error);
  process.exit(1);
});

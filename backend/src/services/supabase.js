/**
 * Supabase 服务模块
 * 封装 Supabase 客户端和会话历史操作
 */

const { createClient } = require("@supabase/supabase-js");
const { supabaseConfig, aiConfig } = require("../config");

// Supabase 客户端实例
let supabase = null;

/**
 * 初始化 Supabase 客户端
 */
function initSupabase() {
  if (supabaseConfig.url && supabaseConfig.serviceRoleKey) {
    supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey);
    console.log("✅ Supabase 客户端初始化成功");
    return true;
  }
  console.warn("⚠️ Supabase 配置不完整，跳过初始化");
  return false;
}

/**
 * 获取 Supabase 客户端实例
 */
function getSupabase() {
  return supabase;
}

/**
 * 检查 Supabase 是否可用
 */
function isSupabaseAvailable() {
  return supabase !== null;
}

// --- 会话历史管理 ---

const MAX_HISTORY_MESSAGES = aiConfig.chat?.maxHistoryMessages || 12;

/**
 * 从 Supabase 获取会话历史
 * @param {string} conversationId 会话ID
 * @returns {Promise<Array>} 会话历史消息数组
 */
async function getConversationHistory(conversationId) {
  if (!supabase) {
    console.warn("⚠️ Supabase 未配置，使用内存存储");
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .select("messages")
      .eq("conversation_id", conversationId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = 没找到记录，这是正常的
      console.error("获取会话历史失败:", error);
      return [];
    }

    return data?.messages || [];
  } catch (err) {
    console.error("获取会话历史异常:", err);
    return [];
  }
}

/**
 * 保存会话历史到 Supabase
 * @param {string} conversationId 会话ID
 * @param {string} userMessage 用户消息
 * @param {string} assistantMessage AI回复
 */
async function saveConversationHistory(conversationId, userMessage, assistantMessage) {
  if (!supabase) {
    return;
  }

  try {
    // 先获取现有历史
    const existingHistory = await getConversationHistory(conversationId);
    
    // 添加新的对话（只保存 user 和 assistant 角色的消息，不保存 tool 消息）
    const newMessages = [
      ...existingHistory,
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ];

    // 限制历史消息数量
    const trimmedMessages =
      newMessages.length > MAX_HISTORY_MESSAGES
        ? newMessages.slice(-MAX_HISTORY_MESSAGES)
        : newMessages;

    const { error } = await supabase
      .from("ai_chat_sessions")
      .upsert(
        {
          conversation_id: conversationId,
          messages: trimmedMessages,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "conversation_id",
        }
      );

    if (error) {
      console.error("保存会话历史失败:", error);
    }
  } catch (err) {
    console.error("保存会话历史异常:", err);
  }
}

/**
 * 清空会话历史
 * @param {string} conversationId 会话ID
 */
async function clearConversationHistory(conversationId) {
  if (!supabase) {
    return;
  }

  try {
    const { error } = await supabase
      .from("ai_chat_sessions")
      .delete()
      .eq("conversation_id", conversationId);

    if (error) {
      console.error("清空会话历史失败:", error);
    }
  } catch (err) {
    console.error("清空会话历史异常:", err);
  }
}

module.exports = {
  initSupabase,
  getSupabase,
  isSupabaseAvailable,
  getConversationHistory,
  saveConversationHistory,
  clearConversationHistory,
};

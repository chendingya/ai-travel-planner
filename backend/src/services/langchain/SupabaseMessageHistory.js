const { BaseChatMessageHistory } = require('@langchain/core/chat_history');
const { HumanMessage, AIMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');

class SupabaseMessageHistory extends BaseChatMessageHistory {
  constructor(sessionId, supabaseClient) {
    super();
    this.sessionId = sessionId;
    this.supabase = supabaseClient;
  }

  async getMessages() {
    try {
      const { data, error } = await this.supabase
        .from('ai_chat_sessions')
        .select('messages')
        .eq('conversation_id', this.sessionId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading messages from Supabase:', error);
        return [];
      }

      const rawMessages = data?.messages || [];
      return this._mapMessages(rawMessages);
    } catch (err) {
      console.error('Error in getMessages:', err);
      return [];
    }
  }

  async addMessage(message) {
    try {
      const messages = await this.getMessages();
      messages.push(message);
      await this._saveMessages(messages);
    } catch (err) {
      console.error('Error adding message:', err);
    }
  }

  async addMessages(messages) {
    try {
      const existing = await this.getMessages();
      const allMessages = existing.concat(messages);
      await this._saveMessages(allMessages);
    } catch (err) {
      console.error('Error adding messages:', err);
    }
  }

  async clear() {
    try {
      await this.supabase
        .from('ai_chat_sessions')
        .update({ messages: [] })
        .eq('conversation_id', this.sessionId);
    } catch (err) {
      console.error('Error clearing messages:', err);
    }
  }

  async _saveMessages(messages) {
    const serialized = messages.map(m => this._serializeMessage(m));
    
    // Check if session exists
    const { data, error } = await this.supabase
      .from('ai_chat_sessions')
      .select('conversation_id')
      .eq('conversation_id', this.sessionId)
      .maybeSingle();

    if (!data && (!error || error.code === 'PGRST116')) {
        // Insert new session
        const { error: insertError } = await this.supabase
            .from('ai_chat_sessions')
            .insert([{ conversation_id: this.sessionId, messages: serialized }]);
        if (insertError) throw insertError;
    } else {
        // Update existing
        const { error: updateError } = await this.supabase
            .from('ai_chat_sessions')
            .update({ messages: serialized })
            .eq('conversation_id', this.sessionId);
        if (updateError) throw updateError;
    }
  }

  _mapMessages(rawMessages) {
    return rawMessages.map(m => {
      const role = m.role;
      const content = m.content;
      
      if (role === 'user') return new HumanMessage(content);
      if (role === 'system') return new SystemMessage(content);
      
      if (role === 'assistant') {
        const tool_calls = m.tool_calls || [];
        return new AIMessage({ content, tool_calls });
      }
      
      if (role === 'tool') {
        return new ToolMessage({
          content,
          tool_call_id: m.tool_call_id,
          name: m.name
        });
      }
      
      // Fallback
      return new HumanMessage(typeof content === 'string' ? content : JSON.stringify(content));
    });
  }

  _serializeMessage(message) {
    const role = this._getRole(message);
    const content = message.content;
    const extra = {};
    
    if (message instanceof AIMessage) {
       if (message.tool_calls && message.tool_calls.length) {
         extra.tool_calls = message.tool_calls;
       }
    }
    
    if (message instanceof ToolMessage) {
      extra.tool_call_id = message.tool_call_id;
      extra.name = message.name;
    }
    
    return { role, content, ...extra };
  }

  _getRole(message) {
    if (message instanceof HumanMessage) return 'user';
    if (message instanceof AIMessage) return 'assistant';
    if (message instanceof SystemMessage) return 'system';
    if (message instanceof ToolMessage) return 'tool';
    return 'user';
  }
}

module.exports = SupabaseMessageHistory;

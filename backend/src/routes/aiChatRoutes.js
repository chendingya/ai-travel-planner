const express = require('express');
const router = express.Router();

/**
 * AI 聊天路由
 */

module.exports = (aiChatController) => {
  // AI 对话
  router.post('/ai-chat', (req, res) => {
    aiChatController.chat(req, res);
  });

  router.get('/mcp/status', (req, res) => {
    aiChatController.mcpStatus(req, res);
  });

  router.post('/tts', (req, res) => {
    aiChatController.tts(req, res);
  });

  router.get('/tts/audio/:task_id', (req, res) => {
    aiChatController.getTtsAudio(req, res);
  });

  // 创建会话
  router.post('/ai-chat/sessions', (req, res) => {
    aiChatController.createSession(req, res);
  });

  // 获取会话列表
  router.get('/ai-chat/sessions', (req, res) => {
    aiChatController.getSessions(req, res);
  });

  // 获取会话历史
  router.get('/ai-chat/history/:id', (req, res) => {
    aiChatController.getSessionHistory(req, res);
  });

  // 删除会话
  router.delete('/ai-chat/history/:id', (req, res) => {
    aiChatController.deleteSession(req, res);
  });

  // 更新会话标题
  router.patch('/ai-chat/sessions/:id', (req, res) => {
    aiChatController.updateSessionTitle(req, res);
  });

  return router;
};

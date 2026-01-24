const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * AI 聊天路由
 */

module.exports = (aiChatController) => {
  // AI 对话
  /**
   * @openapi
   * /api/ai-chat:
   *   post:
   *     tags: [AI Chat]
   *     summary: AI 对话
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               message:
   *                 type: string
   *               sessionId:
   *                 type: string
   *               enable_tools:
   *                 type: boolean
   *               include_audio:
   *                 type: boolean
   *               voice:
   *                 type: string
   *               language_type:
   *                 type: string
   *             required:
   *               - message
   *     responses:
   *       200:
   *         description: 对话成功
   *       400:
   *         description: 参数错误
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.post('/ai-chat', requireAuth, (req, res) => {
    aiChatController.chat(req, res);
  });

  /**
   * @openapi
   * /api/mcp/status:
   *   get:
   *     tags: [MCP]
   *     summary: 获取 MCP 工具状态
   *     security: []
   *     parameters:
   *       - in: query
   *         name: scope
   *         schema:
   *           type: string
   *         required: false
   *     responses:
   *       200:
   *         description: 获取成功
   *       500:
   *         description: 服务错误
   */
  router.get('/mcp/status', (req, res) => {
    aiChatController.mcpStatus(req, res);
  });

  /**
   * @openapi
   * /api/tts:
   *   post:
   *     tags: [TTS]
   *     summary: 语音合成
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text:
   *                 type: string
   *               voice:
   *                 type: string
   *             required:
   *               - text
   *     responses:
   *       200:
   *         description: 合成成功
   *       400:
   *         description: 参数错误
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.post('/tts', requireAuth, (req, res) => {
    aiChatController.tts(req, res);
  });

  /**
   * @openapi
   * /api/tts/audio/{task_id}:
   *   get:
   *     tags: [TTS]
   *     summary: 查询语音任务结果
   *     parameters:
   *       - in: path
   *         name: task_id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: 查询成功
   *       401:
   *         description: 未授权
   *       404:
   *         description: 任务不存在
   *       500:
   *         description: 服务错误
   */
  router.get('/tts/audio/:task_id', requireAuth, (req, res) => {
    aiChatController.getTtsAudio(req, res);
  });

  // 创建会话
  /**
   * @openapi
   * /api/ai-chat/sessions:
   *   post:
   *     tags: [AI Chat]
   *     summary: 创建会话
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *     responses:
   *       200:
   *         description: 创建成功
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.post('/ai-chat/sessions', requireAuth, (req, res) => {
    aiChatController.createSession(req, res);
  });

  // 获取会话列表
  /**
   * @openapi
   * /api/ai-chat/sessions:
   *   get:
   *     tags: [AI Chat]
   *     summary: 获取会话列表
   *     responses:
   *       200:
   *         description: 获取成功
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.get('/ai-chat/sessions', requireAuth, (req, res) => {
    aiChatController.getSessions(req, res);
  });

  // 获取会话历史
  /**
   * @openapi
   * /api/ai-chat/history/{id}:
   *   get:
   *     tags: [AI Chat]
   *     summary: 获取会话历史
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: 获取成功
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.get('/ai-chat/history/:id', requireAuth, (req, res) => {
    aiChatController.getSessionHistory(req, res);
  });

  // 删除会话
  /**
   * @openapi
   * /api/ai-chat/history/{id}:
   *   delete:
   *     tags: [AI Chat]
   *     summary: 删除会话
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: 删除成功
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.delete('/ai-chat/history/:id', requireAuth, (req, res) => {
    aiChatController.deleteSession(req, res);
  });

  // 更新会话标题
  /**
   * @openapi
   * /api/ai-chat/sessions/{id}:
   *   patch:
   *     tags: [AI Chat]
   *     summary: 更新会话标题
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *             required:
   *               - title
   *     responses:
   *       200:
   *         description: 更新成功
   *       400:
   *         description: 参数错误
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.patch('/ai-chat/sessions/:id', requireAuth, (req, res) => {
    aiChatController.updateSessionTitle(req, res);
  });

  return router;
};

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * 提示词生成路由
 */

module.exports = (promptController) => {
  // 生成提示词（速记卡片）
  /**
   * @openapi
   * /api/generate-prompt:
   *   post:
   *     tags: [Prompt]
   *     summary: 生成速记卡片提示词
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text:
   *                 type: string
   *               scene:
   *                 type: string
   *     responses:
   *       200:
   *         description: 生成成功
   *       400:
   *         description: 参数错误
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.post('/generate-prompt', requireAuth, (req, res) => {
    promptController.generatePrompt(req, res);
  });

  // 生成明信片文案
  /**
   * @openapi
   * /api/generate-postcard-prompt:
   *   post:
   *     tags: [Prompt]
   *     summary: 生成明信片提示词
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               text:
   *                 type: string
   *               scene:
   *                 type: string
   *     responses:
   *       200:
   *         description: 生成成功
   *       400:
   *         description: 参数错误
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.post('/generate-postcard-prompt', requireAuth, (req, res) => {
    promptController.generatePostcardPrompt(req, res);
  });

  return router;
};

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * 图片生成路由
 */

module.exports = (imageController) => {
  // 生成图片
  /**
   * @openapi
   * /api/generate-image:
   *   post:
   *     tags: [Image]
   *     summary: 生成图片
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               prompt:
   *                 type: string
   *               style:
   *                 type: string
   *               size:
   *                 type: string
   *               provider:
   *                 type: string
   *             required:
   *               - prompt
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
  router.post('/generate-image', requireAuth, (req, res) => {
    imageController.generateImage(req, res);
  });

  // 获取可用提供商列表
  /**
   * @openapi
   * /api/image-providers:
   *   get:
   *     tags: [Image]
   *     summary: 获取图片提供商
   *     security: []
   *     responses:
   *       200:
   *         description: 获取成功
   *       500:
   *         description: 服务错误
   */
  router.get('/image-providers', (req, res) => {
    imageController.getProviders(req, res);
  });

  // 获取生成历史
  /**
   * @openapi
   * /api/image-history:
   *   get:
   *     tags: [Image]
   *     summary: 获取图片生成历史
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         required: false
   *     responses:
   *       200:
   *         description: 获取成功
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.get('/image-history', requireAuth, (req, res) => {
    imageController.getHistory(req, res);
  });

  return router;
};

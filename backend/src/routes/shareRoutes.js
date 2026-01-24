const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * 分享文案路由
 */

module.exports = (shareController) => {
  // 生成分享文案
  /**
   * @openapi
   * /api/generate-share-content:
   *   post:
   *     tags: [Share]
   *     summary: 生成分享文案
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               destination:
   *                 type: string
   *               platform:
   *                 type: string
   *               style:
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
  router.post('/generate-share-content', requireAuth, (req, res) => {
    shareController.generateShareContent(req, res);
  });

  return router;
};

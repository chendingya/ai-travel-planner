const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * 明信片路由
 */

module.exports = (postcardController) => {
  // 生成明信片
  /**
   * @openapi
   * /api/generate-postcard:
   *   post:
   *     tags: [Postcard]
   *     summary: 生成明信片
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
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
  router.post('/generate-postcard', requireAuth, (req, res) => {
    postcardController.generatePostcard(req, res);
  });

  return router;
};

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = (providerConfigController) => {
  /**
   * @openapi
   * /api/provider-config:
   *   get:
   *     tags: [Provider Config]
   *     summary: 获取提供商配置（脱敏）
   *     responses:
   *       200:
   *         description: 获取成功
   *       401:
   *         description: 未授权
   */
  router.get('/provider-config', requireAuth, (req, res) => {
    providerConfigController.getConfig(req, res);
  });

  /**
   * @openapi
   * /api/provider-config/test:
   *   post:
   *     tags: [Provider Config]
   *     summary: 测试单个提供商连通性
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               kind:
   *                 type: string
   *                 enum: [text, image]
   *               provider:
   *                 type: object
   *     responses:
   *       200:
   *         description: 测试完成
   *       400:
   *         description: 参数或配置校验失败
   *       401:
   *         description: 未授权
   */
  router.post('/provider-config/test', requireAuth, (req, res) => {
    providerConfigController.testProvider(req, res);
  });

  /**
   * @openapi
   * /api/provider-config:
   *   put:
   *     tags: [Provider Config]
   *     summary: 全量更新提供商配置并热更新
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               textProviders:
   *                 type: array
   *               imageProviders:
   *                 type: array
   *     responses:
   *       200:
   *         description: 保存成功
   *       400:
   *         description: 校验失败
   *       401:
   *         description: 未授权
   */
  router.put('/provider-config', requireAuth, (req, res) => {
    providerConfigController.updateConfig(req, res);
  });

  return router;
};

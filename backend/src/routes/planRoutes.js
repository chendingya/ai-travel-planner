const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * 旅行规划路由
 */

module.exports = (planController) => {
  // 解析旅行信息
  /**
   * @openapi
   * /api/parse-travel-info:
   *   post:
   *     tags: [Plan]
   *     summary: 解析旅行信息
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               quickInput:
   *                 type: string
   *               text:
   *                 type: string
   *     responses:
   *       200:
   *         description: 解析成功
   *       400:
   *         description: 参数错误
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.post('/parse-travel-info', requireAuth, (req, res) => {
    planController.parseTravelInfo(req, res);
  });

  // 生成旅行计划
  /**
   * @openapi
   * /api/plan:
   *   post:
   *     tags: [Plan]
   *     summary: 生成旅行计划
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
  router.post('/plan', requireAuth, (req, res) => {
    planController.generatePlan(req, res);
  });

  // 生成完整旅行计划（快捷方式）
  /**
   * @openapi
   * /api/complete-plan:
   *   post:
   *     tags: [Plan]
   *     summary: 生成完整旅行计划（快捷）
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               quickInput:
   *                 type: string
   *               text:
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
  router.post('/complete-plan', requireAuth, (req, res) => {
    planController.generateCompletePlan(req, res);
  });

  return router;
};

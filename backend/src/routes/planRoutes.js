const express = require('express');
const router = express.Router();

/**
 * 旅行规划路由
 */

module.exports = (planController) => {
  // 解析旅行信息
  router.post('/parse-travel-info', (req, res) => {
    planController.parseTravelInfo(req, res);
  });

  // 生成旅行计划
  router.post('/plan', (req, res) => {
    planController.generatePlan(req, res);
  });

  // 生成完整旅行计划（快捷方式）
  router.post('/complete-plan', (req, res) => {
    planController.generateCompletePlan(req, res);
  });

  return router;
};

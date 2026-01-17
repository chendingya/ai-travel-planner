const express = require('express');
const router = express.Router();

/**
 * 提示词生成路由
 */

module.exports = (promptController) => {
  // 生成提示词（速记卡片）
  router.post('/generate-prompt', (req, res) => {
    promptController.generatePrompt(req, res);
  });

  // 生成明信片文案
  router.post('/generate-postcard-prompt', (req, res) => {
    promptController.generatePostcardPrompt(req, res);
  });

  return router;
};

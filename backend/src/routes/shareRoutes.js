const express = require('express');
const router = express.Router();

/**
 * 分享文案路由
 */

module.exports = (shareController) => {
  // 生成分享文案
  router.post('/generate-share-content', (req, res) => {
    shareController.generateShareContent(req, res);
  });

  return router;
};

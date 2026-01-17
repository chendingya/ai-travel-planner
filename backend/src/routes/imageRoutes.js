const express = require('express');
const router = express.Router();

/**
 * 图片生成路由
 */

module.exports = (imageController) => {
  // 生成图片
  router.post('/generate-image', (req, res) => {
    imageController.generateImage(req, res);
  });

  // 获取可用提供商列表
  router.get('/image-providers', (req, res) => {
    imageController.getProviders(req, res);
  });

  // 获取生成历史
  router.get('/image-history', (req, res) => {
    imageController.getHistory(req, res);
  });

  return router;
};

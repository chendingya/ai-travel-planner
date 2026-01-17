const express = require('express');
const router = express.Router();

/**
 * 明信片路由
 */

module.exports = (postcardController) => {
  // 生成明信片
  router.post('/generate-postcard', (req, res) => {
    postcardController.generatePostcard(req, res);
  });

  return router;
};

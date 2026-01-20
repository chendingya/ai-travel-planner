const express = require('express');
const router = express.Router();

/**
 * BGM歌单路由
 */

module.exports = (playlistController) => {
  // 生成歌单
  router.post('/generate-playlist', (req, res) => {
    playlistController.generatePlaylist(req, res);
  });

  // 获取生成历史
  router.get('/playlist-history', (req, res) => {
    playlistController.getHistory(req, res);
  });

  return router;
};

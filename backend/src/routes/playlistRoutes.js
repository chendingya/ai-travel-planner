const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

/**
 * BGM歌单路由
 */

module.exports = (playlistController) => {
  // 生成歌单
  /**
   * @openapi
   * /api/generate-playlist:
   *   post:
   *     tags: [Playlist]
   *     summary: 生成歌单
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               destination:
   *                 type: string
   *               theme:
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
  router.post('/generate-playlist', requireAuth, (req, res) => {
    playlistController.generatePlaylist(req, res);
  });

  // 获取生成历史
  /**
   * @openapi
   * /api/playlist-history:
   *   get:
   *     tags: [Playlist]
   *     summary: 获取歌单生成历史
   *     responses:
   *       200:
   *         description: 获取成功
   *       401:
   *         description: 未授权
   *       500:
   *         description: 服务错误
   */
  router.get('/playlist-history', requireAuth, (req, res) => {
    playlistController.getHistory(req, res);
  });

  return router;
};

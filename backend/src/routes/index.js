const express = require('express');
const router = express.Router();

/**
 * 主路由文件
 * 统一注册所有路由
 */

module.exports = (controllers) => {
  const {
    planController,
    aiChatController,
    imageController,
    playlistController,
    postcardController,
    shareController,
    promptController,
  } = controllers;

  // 引入子路由
  const planRoutes = require('./planRoutes')(planController);
  const aiChatRoutes = require('./aiChatRoutes')(aiChatController);
  const imageRoutes = require('./imageRoutes')(imageController);
  const playlistRoutes = require('./playlistRoutes')(playlistController);
  const postcardRoutes = require('./postcardRoutes')(postcardController);
  const shareRoutes = require('./shareRoutes')(shareController);
  const promptRoutes = require('./promptRoutes')(promptController);

  // 注册路由
  router.use('/', planRoutes);
  router.use('/', aiChatRoutes);
  router.use('/', imageRoutes);
  router.use('/', playlistRoutes);
  router.use('/', postcardRoutes);
  router.use('/', shareRoutes);
  router.use('/', promptRoutes);

  return router;
};

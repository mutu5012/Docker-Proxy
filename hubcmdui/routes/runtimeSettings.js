'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const { requireLogin, requireFreshPassword } = require('../middleware/auth');
const runtimeSettingsService = require('../services/runtimeSettingsService');
const dockerService = require('../services/dockerService');

router.get('/', requireLogin, requireFreshPassword, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(runtimeSettingsService.getPublicSettings());
});

router.put('/', requireLogin, requireFreshPassword, async (req, res) => {
  try {
    const payload = req.body && req.body.settings ? req.body.settings : req.body;
    const result = await runtimeSettingsService.save(payload);
    res.json({ success: true, message: '运行参数已保存并热加载', ...result });
  } catch (error) {
    logger.warn('保存运行参数失败:', error.message);
    res.status(400).json({ error: '保存运行参数失败', details: error.message });
  }
});

router.post('/defaults', requireLogin, requireFreshPassword, async (req, res) => {
  try {
    const result = await runtimeSettingsService.resetToDefaults();
    res.json({ success: true, message: '已恢复内置默认值并热加载', ...result });
  } catch (error) {
    logger.error('恢复运行参数默认值失败:', error);
    res.status(500).json({ error: '恢复默认值失败', details: error.message });
  }
});

// 只允许重启管理面板自身。接口不接受容器 ID，更不执行 shell/Compose 命令。
router.post('/restart-ui', requireLogin, requireFreshPassword, async (req, res) => {
  let connection;
  try {
    connection = await dockerService.getDockerConnection();
    if (!connection) throw new Error('无法连接到 Docker 守护进程');
    await connection.getContainer('hubcmd-ui').inspect();
  } catch (error) {
    return res.status(503).json({ error: '管理面板容器不可重启', details: error.message });
  }

  res.status(202).json({
    success: true,
    message: '管理面板即将重启，请等待健康检查恢复',
    healthUrl: '/api/health'
  });

  res.once('finish', () => {
    setTimeout(() => {
      dockerService.restartContainer('hubcmd-ui').catch(error => {
        logger.error('异步重启 hubcmd-ui 失败:', error);
      });
    }, 300);
  });
});

module.exports = router;

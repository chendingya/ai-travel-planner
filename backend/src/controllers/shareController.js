/**
 * 分享文案控制器
 */
class ShareController {
  constructor(shareService) {
    this.shareService = shareService;
  }

  platformName(platform) {
    const p = platform ? String(platform).trim() : '';
    if (p === 'xiaohongshu') return '小红书';
    if (p === 'moments') return '朋友圈';
    if (p === 'douyin') return '抖音';
    return p || '平台';
  }

  /**
   * 生成分享文案
   */
  async generateShareContent(req, res) {
    try {
      const shareInfo = req.body;

      if (!shareInfo || !shareInfo.destination) {
        return res.status(400).json({ message: 'destination is required', error: 'destination is required' });
      }

      const content = await this.shareService.generateShareContent(shareInfo);
      res.json({
        content,
        destination: shareInfo.destination,
        duration: shareInfo.duration,
        platform: shareInfo.platform,
        platformName: this.platformName(shareInfo.platform),
        emotion: shareInfo.emotion,
        highlights: shareInfo.highlights,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Generate share content error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }
}

module.exports = ShareController;

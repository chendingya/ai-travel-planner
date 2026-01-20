/**
 * BGM歌单控制器
 */
class PlaylistController {
  constructor(playlistService) {
    this.playlistService = playlistService;
  }

  /**
   * 生成歌单
   */
  async generatePlaylist(req, res) {
    try {
      const travelInfo = req.body;

      if (!travelInfo || !travelInfo.destination) {
        return res.status(400).json({ message: 'destination is required', error: 'destination is required' });
      }

      const aiMeta = { providers: [] };
      res.locals.aiMeta = aiMeta;
      const playlist = await this.playlistService.generatePlaylist(travelInfo, { aiMeta });
      res.json(playlist);
    } catch (error) {
      console.error('Generate playlist error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 获取生成历史
   */
  async getHistory(req, res) {
    try {
      const { limit } = req.query;
      res.locals.aiMeta = { mcp: false, providers: [] };
      const history = await this.playlistService.getGenerationHistory(
        limit ? parseInt(limit) : 20
      );
      res.json(history);
    } catch (error) {
      console.error('Get history error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }
}

module.exports = PlaylistController;

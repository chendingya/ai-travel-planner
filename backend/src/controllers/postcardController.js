/**
 * 明信片控制器
 */
class PostcardController {
  constructor(postcardService) {
    this.postcardService = postcardService;
  }

  /**
   * 生成明信片
   */
  async generatePostcard(req, res) {
    try {
      const imageData = req.body;

      if (!imageData || !imageData.destination) {
        return res.status(400).json({ message: 'destination is required', error: 'destination is required' });
      }

      const imageOptions = {};
      if (req.body.style) imageOptions.style = req.body.style;
      if (req.body.size) imageOptions.size = req.body.size;

      const aiMeta = { providers: [] };
      res.locals.aiMeta = aiMeta;
      const result = await this.postcardService.generatePostcard(
        imageData,
        { ...imageOptions, aiMeta }
      );
      res.json(result);
    } catch (error) {
      console.error('Generate postcard error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }
}

module.exports = PostcardController;

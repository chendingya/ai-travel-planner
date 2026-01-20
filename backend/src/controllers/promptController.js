/**
 * 提示词生成控制器
 */
class PromptController {
  constructor(promptService) {
    this.promptService = promptService;
  }

  buildNotesFromBody(body) {
    if (!body || typeof body !== 'object') {
      return '';
    }

    const destination = body.destination ? String(body.destination).trim() : '';
    const duration = body.duration != null ? String(body.duration).trim() : '';
    const dailyItinerary = body.dailyItinerary || body.daily_itinerary;

    const lines = [];
    if (destination) lines.push(`目的地：${destination}`);
    if (duration) lines.push(`天数：${duration}`);

    if (Array.isArray(dailyItinerary) && dailyItinerary.length > 0) {
      lines.push('行程：');
      dailyItinerary.forEach((day, index) => {
        const dayTitle = day?.title ? String(day.title).trim() : `第${index + 1}天`;
        lines.push(`- ${dayTitle}`);
        const activities = Array.isArray(day?.activities) ? day.activities : [];
        activities.slice(0, 12).forEach((act) => {
          const time = act?.time ? String(act.time).trim() : '';
          const name = act?.activity ? String(act.activity).trim() : '';
          const location = act?.location ? String(act.location).trim() : '';
          const parts = [time, name, location].filter(Boolean);
          if (parts.length > 0) {
            lines.push(`  - ${parts.join(' ')}`);
          }
        });
      });
    }

    if (lines.length === 0) {
      return '';
    }
    return lines.join('\n');
  }

  /**
   * 生成提示词（速记卡片）
   */
  async generatePrompt(req, res) {
    try {
      const { notes } = req.body || {};
      const inputNotes = notes || this.buildNotesFromBody(req.body);

      if (!inputNotes) {
        return res.status(400).json({ message: 'notes is required', error: 'notes is required' });
      }

      const prompt = await this.promptService.generatePrompt(inputNotes);
      res.json({ prompt });
    } catch (error) {
      console.error('Generate prompt error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 生成明信片文案
   */
  async generatePostcardPrompt(req, res) {
    try {
      const imageData = req.body;

      if (!imageData || !imageData.destination) {
        return res.status(400).json({ message: 'destination is required', error: 'destination is required' });
      }

      const prompt = await this.promptService.generatePostcardPrompt(imageData);
      res.json({ prompt });
    } catch (error) {
      console.error('Generate postcard prompt error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }
}

module.exports = PromptController;

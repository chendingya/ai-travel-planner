/**
 * 旅行规划控制器
 */
class PlanController {
  constructor(planService) {
    this.planService = planService;
  }

  /**
   * 解析旅行信息
   */
  async parseTravelInfo(req, res) {
    try {
      const { quickInput, text } = req.body;
      const input = quickInput || text;

      if (!input) {
        return res.status(400).json({ message: 'quickInput is required', error: 'quickInput is required' });
      }

      const result = await this.planService.parseTravelInfo(input);
      res.json(result);
    } catch (error) {
      console.error('Parse travel info error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 生成旅行计划
   */
  async generatePlan(req, res) {
    try {
      const formData = req.body;

      if (!formData || Object.keys(formData).length === 0) {
        return res.status(400).json({ message: 'Form data is required', error: 'Form data is required' });
      }

      const plan = await this.planService.generatePlan(formData);
      res.json(plan);
    } catch (error) {
      console.error('Generate plan error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }

  /**
   * 生成完整旅行计划（快捷方式）
   */
  async generateCompletePlan(req, res) {
    try {
      const { quickInput, text } = req.body;
      const input = quickInput || text;

      if (!input) {
        return res.status(400).json({ message: 'quickInput is required', error: 'quickInput is required' });
      }

      const result = await this.planService.generateCompletePlan(input);
      res.json(result);
    } catch (error) {
      console.error('Generate complete plan error:', error);
      res.status(500).json({ message: error.message, error: error.message });
    }
  }
}

module.exports = PlanController;

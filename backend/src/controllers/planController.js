/**
 * 旅行规划控制器
 */
class PlanController {
  constructor(planService) {
    this.planService = planService;
  }

  errorMessage(error) {
    const manager = this.planService?.langChainManager;
    const code = typeof error?.code === 'string' ? error.code : '';
    const msg = typeof error?.message === 'string' ? error.message.trim() : '';
    if (manager && typeof manager._zhErrorMessage === 'function') {
      const zh = manager._zhErrorMessage(code, msg);
      if (zh && zh.trim()) return zh;
    }
    if (msg) return msg;
    return '内部服务错误';
  }

  /**
   * 解析旅行信息
   */
  async parseTravelInfo(req, res) {
    try {
      const { quickInput, text } = req.body;
      const input = quickInput || text;

      if (!input) {
        return res.status(400).json({ message: '快捷输入或文本为必填项', error: '快捷输入或文本为必填项' });
      }

      const aiMeta = { providers: [] };
      res.locals.aiMeta = aiMeta;
      const requestId = req.requestId || '';
      const debug = req.aiDebug === true;
      const result = await this.planService.langChainManager.runWithTrace(
        { requestId, route: 'plan/parse-travel-info', debug },
        () => this.planService.parseTravelInfo(input, { aiMeta })
      );
      res.json(result);
    } catch (error) {
      console.error('Parse travel info error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  /**
   * 生成旅行计划
   */
  async generatePlan(req, res) {
    try {
      const formData = req.body;

      if (!formData || Object.keys(formData).length === 0) {
        return res.status(400).json({ message: '表单数据为必填项', error: '表单数据为必填项' });
      }

      const aiMeta = { providers: [] };
      res.locals.aiMeta = aiMeta;
      const requestId = req.requestId || '';
      const debug = req.aiDebug === true;
      const plan = await this.planService.langChainManager.runWithTrace(
        { requestId, route: 'plan/generate', debug },
        () => this.planService.generatePlan(formData, { aiMeta })
      );
      res.json(plan);
    } catch (error) {
      console.error('Generate plan error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
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
        return res.status(400).json({ message: '快捷输入或文本为必填项', error: '快捷输入或文本为必填项' });
      }

      const aiMeta = { providers: [] };
      res.locals.aiMeta = aiMeta;
      const requestId = req.requestId || '';
      const debug = req.aiDebug === true;
      const result = await this.planService.langChainManager.runWithTrace(
        { requestId, route: 'plan/complete-plan', debug },
        () => this.planService.generateCompletePlan(input, { aiMeta })
      );
      res.json(result);
    } catch (error) {
      console.error('Generate complete plan error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }
}

module.exports = PlanController;

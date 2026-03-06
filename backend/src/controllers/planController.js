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
      const traceFlag = req.query?.trace ?? req.headers?.['x-ai-trace'];
      const includeSteps = ['1', 'true', 'yes', 'on'].includes(String(traceFlag ?? '').trim().toLowerCase());
      const requestId = req.requestId || '';
      const debug = req.aiDebug === true;
      const plan = await this.planService.langChainManager.runWithTrace(
        { requestId, route: 'plan/generate', debug },
        () => this.planService.generatePlan(formData, { aiMeta, includeSteps })
      );
      res.json(plan);
    } catch (error) {
      console.error('Generate plan error:', error);
      const msg = this.errorMessage(error);
      res.status(500).json({ message: msg, error: msg });
    }
  }

  async generatePlanStream(req, res) {
    const sendEvent = (event, payload) => {
      if (res.writableEnded) return;
      const data = payload == null ? {} : payload;
      const normalized = data && typeof data === 'object'
        ? {
            source: data.source || 'plan',
            type:
              data.type ||
              (event === 'meta'
                ? 'meta'
                : event === 'done'
                  ? 'final'
                  : event === 'error'
                    ? 'error'
                    : event === 'ping'
                      ? 'ping'
                      : 'step'),
            ...data,
          }
        : { source: 'plan', type: 'text', content: String(data ?? '') };
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(normalized)}\n\n`);
    };

    try {
      const formData = req.body;
      if (!formData || Object.keys(formData).length === 0) {
        return res.status(400).json({ message: '表单数据为必填项', error: '表单数据为必填项' });
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const aiMeta = { providers: [] };
      res.locals.aiMeta = aiMeta;

      let closed = false;
      const heartbeat = setInterval(() => {
        sendEvent('ping', { type: 'ping', ts: Date.now() });
      }, 15000);

      req.on('close', () => {
        closed = true;
        clearInterval(heartbeat);
      });

      const onStep = (step) => {
        if (closed) return;
        sendEvent('step', step);
      };
      const onTools = (tools) => {
        if (closed) return;
        sendEvent('meta', { type: 'meta', phase: 'tooling', tools });
      };

      const requestId = req.requestId || '';
      const debug = req.aiDebug === true;
      const result = await this.planService.langChainManager.runWithTrace(
        { requestId, route: 'plan/generate-stream', debug },
        () => this.planService.generatePlan(formData, { aiMeta, onStep, onTools })
      );

      if (!closed) {
        sendEvent('done', { type: 'final', result });
      }
      clearInterval(heartbeat);
      res.end();
    } catch (error) {
      const msg = this.errorMessage(error);
      if (!res.headersSent) {
        res.status(500).json({ message: msg, error: msg });
        return;
      }
      sendEvent('error', { type: 'error', message: msg });
      res.end();
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

  async listSavedPlans(req, res) {
    try {
      const userId = typeof req.user?.id === 'string' ? req.user.id : '';
      const plans = await this.planService.listSavedPlans(userId);
      res.json({ plans });
    } catch (error) {
      console.error('List saved plans error:', error);
      const msg = this.errorMessage(error);
      const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 500;
      res.status(status).json({ message: msg, error: msg });
    }
  }

  async getSavedPlan(req, res) {
    try {
      const userId = typeof req.user?.id === 'string' ? req.user.id : '';
      const id = typeof req.params?.id === 'string' ? req.params.id : '';
      if (!id) return res.status(400).json({ message: '计划 ID 缺失', error: '计划 ID 缺失' });
      const plan = await this.planService.getSavedPlan(id, userId);
      if (!plan) return res.status(404).json({ message: '计划不存在', error: '计划不存在' });
      res.json({ plan });
    } catch (error) {
      console.error('Get saved plan error:', error);
      const msg = this.errorMessage(error);
      const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 500;
      res.status(status).json({ message: msg, error: msg });
    }
  }

  async savePlan(req, res) {
    try {
      const userId = typeof req.user?.id === 'string' ? req.user.id : '';
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const saved = await this.planService.savePlan(payload, userId);
      res.status(201).json({ plan: saved });
    } catch (error) {
      console.error('Save plan error:', error);
      const msg = this.errorMessage(error);
      const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 500;
      res.status(status).json({ message: msg, error: msg });
    }
  }

  async updateSavedPlan(req, res) {
    try {
      const userId = typeof req.user?.id === 'string' ? req.user.id : '';
      const id = typeof req.params?.id === 'string' ? req.params.id : '';
      if (!id) return res.status(400).json({ message: '计划 ID 缺失', error: '计划 ID 缺失' });
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const updated = await this.planService.updateSavedPlan(id, payload, userId);
      if (!updated) return res.status(404).json({ message: '计划不存在', error: '计划不存在' });
      res.json({ plan: updated });
    } catch (error) {
      console.error('Update saved plan error:', error);
      const msg = this.errorMessage(error);
      const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 500;
      res.status(status).json({ message: msg, error: msg });
    }
  }

  async deleteSavedPlan(req, res) {
    try {
      const userId = typeof req.user?.id === 'string' ? req.user.id : '';
      const id = typeof req.params?.id === 'string' ? req.params.id : '';
      if (!id) return res.status(400).json({ message: '计划 ID 缺失', error: '计划 ID 缺失' });
      await this.planService.deleteSavedPlan(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete saved plan error:', error);
      const msg = this.errorMessage(error);
      const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 500;
      res.status(status).json({ message: msg, error: msg });
    }
  }
}

module.exports = PlanController;

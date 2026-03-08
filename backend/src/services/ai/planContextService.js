class PlanContextService {
  constructor({ supabase, requireUserId, truncateText }) {
    this.supabase = supabase;
    this.requireUserId = requireUserId;
    this.truncateText = truncateText;
  }

  toCompactText(value, maxLen = 120) {
    if (value == null) return '';
    const raw = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
    const compact = raw.replace(/\s+/g, ' ').trim();
    if (!compact) return '';
    return compact.length > maxLen ? `${compact.slice(0, maxLen)}...` : compact;
  }

  buildPlanContextSummaryFromRow(planRow) {
    const row = planRow && typeof planRow === 'object' ? planRow : {};
    const detailsRaw = row.plan_details;
    const details = (() => {
      if (!detailsRaw) return {};
      if (typeof detailsRaw === 'object') return detailsRaw;
      if (typeof detailsRaw !== 'string') return {};
      try {
        return JSON.parse(detailsRaw);
      } catch {
        return {};
      }
    })();

    const lines = [];
    lines.push('以下是用户选择并持续挂载的旅行计划上下文，请在后续回答中持续参考：');
    lines.push(`计划ID: ${this.toCompactText(row.id || '')}`);
    lines.push(`目的地: ${this.toCompactText(row.destination || details.destination || '未提供')}`);
    lines.push(`天数: ${this.toCompactText(row.duration ?? details.duration ?? '未提供')}`);
    lines.push(`预算: ${this.toCompactText(row.budget ?? details.total_budget ?? '未提供')}`);
    lines.push(`人数: ${this.toCompactText(row.travelers ?? details.travelers ?? '未提供')}`);
    lines.push(`偏好: ${this.toCompactText(row.preferences || details.preferences || '未提供', 240)}`);

    const daily = Array.isArray(details.daily_itinerary) ? details.daily_itinerary : [];
    if (daily.length) {
      lines.push('每日行程（完整覆盖）：');
      daily.forEach((day, idx) => {
        const dayNo = Number.isFinite(Number(day?.day)) ? Number(day.day) : idx + 1;
        const theme = this.toCompactText(day?.theme || day?.title || `第${dayNo}天`, 180);
        lines.push(`- Day ${dayNo}: ${theme}`);
        const hotelName = this.toCompactText(day?.hotel?.name || day?.hotel || '', 120);
        if (hotelName) lines.push(`  酒店: ${hotelName}`);
        const acts = Array.isArray(day?.activities) ? day.activities : [];
        acts.forEach((act, aIdx) => {
          const time = this.toCompactText(act?.time || '', 50);
          const location = this.toCompactText(act?.location || act?.address || '', 80);
          const desc = this.toCompactText(
            act?.description || act?.activity || act?.name || act?.notes || act?.originalDescription || '',
            180
          );
          const parts = [time, location, desc].filter(Boolean);
          lines.push(`  活动${aIdx + 1}: ${parts.join(' | ') || '未提供细节'}`);
        });
      });
    }

    const accommodation = Array.isArray(details.accommodation) ? details.accommodation : [];
    if (accommodation.length) {
      lines.push('住宿建议:');
      accommodation.forEach((item, idx) => {
        lines.push(`- ${idx + 1}. ${this.toCompactText(item, 220)}`);
      });
    }

    if (details.transport && typeof details.transport === 'object') {
      lines.push(`交通建议: ${this.toCompactText(details.transport, 600)}`);
    }
    if (details.budget_breakdown && typeof details.budget_breakdown === 'object') {
      lines.push(`预算分解: ${this.toCompactText(details.budget_breakdown, 600)}`);
    }
    if (Array.isArray(details.tips) && details.tips.length) {
      lines.push('贴士:');
      details.tips.forEach((tip, idx) => lines.push(`- ${idx + 1}. ${this.toCompactText(tip, 200)}`));
    }

    return this.truncateText(lines.join('\n'), 18000);
  }

  async loadPlanContextSummary(planId, userId) {
    const pid = typeof planId === 'string' ? planId.trim() : '';
    if (!pid) return '';
    const effectiveUserId = this.requireUserId(userId);
    const { data, error } = await this.supabase
      .from('plans')
      .select('id, destination, duration, budget, travelers, preferences, plan_details')
      .eq('id', pid)
      .eq('user_id', effectiveUserId)
      .maybeSingle();
    if (!error && data) return this.buildPlanContextSummaryFromRow(data);
    if (error && error.code !== 'PGRST116') {
      console.warn('Load plan context failed:', error?.message || error);
      return '';
    }
    console.warn('Plan context ignored: plan not found or not owned by user', { planId: pid, userId: effectiveUserId });
    return '';
  }
}

module.exports = PlanContextService;

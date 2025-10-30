-- =============================================
-- AI 旅行规划师 - Supabase 数据库初始化脚本
-- =============================================
-- 使用说明：
-- 1. 登录你的 Supabase 项目控制台
-- 2. 进入 SQL Editor
-- 3. 将本文件内容粘贴并执行
-- =============================================

-- 创建 plans 表（旅行计划）
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  duration INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  travelers INTEGER NOT NULL,
  preferences TEXT,
  plan_details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON public.plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_created_at ON public.plans(created_at DESC);

-- 创建更新时间戳触发器
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 启用行级安全策略（RLS）
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的计划
CREATE POLICY "Users can view own plans"
  ON public.plans
  FOR SELECT
  USING (auth.uid() = user_id);

-- 用户只能创建自己的计划
CREATE POLICY "Users can create own plans"
  ON public.plans
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的计划
CREATE POLICY "Users can update own plans"
  ON public.plans
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 用户只能删除自己的计划
CREATE POLICY "Users can delete own plans"
  ON public.plans
  FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- 验证表是否创建成功
-- =============================================
-- 执行后可以运行以下查询来验证：
-- SELECT * FROM public.plans LIMIT 1;

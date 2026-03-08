-- =============================================
-- RAG 知识库向量数据库初始化脚本
-- 在 Supabase SQL Editor 中执行本文件
-- =============================================

-- 1. 启用 pgvector 扩展（Supabase 已内置，直接启用即可）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 创建旅游知识库表
CREATE TABLE IF NOT EXISTS public.travel_knowledge (
  id           BIGSERIAL PRIMARY KEY,
  city         TEXT NOT NULL,
  type         TEXT NOT NULL,          -- guide / attraction / transport / food / notice / ...
  title        TEXT NOT NULL,
  section_title TEXT,
  content      TEXT NOT NULL,
  tags         TEXT[] DEFAULT '{}',
  source       TEXT,                   -- 'wikivoyage' | 'wikivoyage-en'
  source_url   TEXT,
  lang         TEXT DEFAULT 'zh',      -- 'zh' | 'en'
  content_hash TEXT NOT NULL,          -- MD5(content)，用于幂等 upsert
  embedding    VECTOR(1024),           -- text-embedding-v3 默认维度
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. 业务索引
CREATE INDEX IF NOT EXISTS idx_travel_knowledge_city
  ON public.travel_knowledge(city);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_type
  ON public.travel_knowledge(type);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_lang
  ON public.travel_knowledge(lang);

-- 唯一约束：防止重复写入同一 chunk
CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_knowledge_content_hash
  ON public.travel_knowledge(content_hash);

-- 4. IVFFlat 向量索引（近似最近邻，余弦距离）
--    注意：需要至少 100 行数据才能建索引；如果表为空，可在 ingest 后再执行此语句
CREATE INDEX IF NOT EXISTS idx_travel_knowledge_embedding
  ON public.travel_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 5. 相似度检索 RPC 函数
--    后端通过 supabase.rpc('match_travel_knowledge', {...}) 调用
CREATE OR REPLACE FUNCTION match_travel_knowledge(
  query_embedding  VECTOR(1024),
  match_count      INT     DEFAULT 5,
  filter_city      TEXT    DEFAULT NULL,   -- 可选：限定城市
  filter_type      TEXT    DEFAULT NULL,   -- 可选：限定类型
  similarity_threshold FLOAT DEFAULT 0.3  -- 最低相似度阈值，过滤噪声结果
)
RETURNS TABLE (
  id            BIGINT,
  city          TEXT,
  type          TEXT,
  title         TEXT,
  section_title TEXT,
  content       TEXT,
  tags          TEXT[],
  source        TEXT,
  lang          TEXT,
  similarity    FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    tk.id,
    tk.city,
    tk.type,
    tk.title,
    tk.section_title,
    tk.content,
    tk.tags,
    tk.source,
    tk.lang,
    (1 - (tk.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.travel_knowledge tk
  WHERE
    (filter_city IS NULL OR tk.city = filter_city)
    AND (filter_type IS NULL OR tk.type = filter_type)
    AND (1 - (tk.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY tk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. RLS（行级安全策略）—— 知识库为只读公共数据，允许匿名读取
ALTER TABLE public.travel_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on travel_knowledge"
  ON public.travel_knowledge FOR SELECT
  USING (true);

-- Service role 可写入（ingest 脚本使用 service_role key）
CREATE POLICY "Allow service role write on travel_knowledge"
  ON public.travel_knowledge FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- 验证
-- =============================================
-- SELECT COUNT(*) FROM public.travel_knowledge;
-- SELECT * FROM match_travel_knowledge('[0.1, 0.2, ...]'::vector, 3);

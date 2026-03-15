-- =============================================
-- RAG 知识库向量数据库初始化脚本
-- 在 Supabase SQL Editor 中执行本文件
-- =============================================

-- 1. 启用 pgvector 扩展（Supabase 已内置，直接启用即可）
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 共享知识库也使用统一的 updated_at 触发器，方便开发者之间同步和迁移版本
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 创建旅游知识库表
CREATE TABLE IF NOT EXISTS public.travel_knowledge (
  id           BIGSERIAL PRIMARY KEY,
  kb_slug      TEXT NOT NULL DEFAULT 'travel-cn-public', -- 知识库唯一标识，便于不同开发者共享/迁移
  dataset_version TEXT NOT NULL DEFAULT '20260306_004228', -- 本次导入的数据集版本
  external_id  TEXT,                   -- 原始 JSONL 中的 chunk id
  city         TEXT NOT NULL,
  type         TEXT NOT NULL,          -- guide / attraction / transport / food / notice / ...
  title        TEXT NOT NULL,
  section_title TEXT,
  sub_section_title TEXT,
  poi_name     TEXT,
  content      TEXT NOT NULL,
  tags         TEXT[] DEFAULT '{}',
  source       TEXT,                   -- 'wikivoyage' | 'wikivoyage-en'
  source_url   TEXT,
  license      TEXT,
  lang         TEXT DEFAULT 'zh',      -- 'zh' | 'en'
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT NOT NULL,          -- MD5(content)，用于幂等 upsert
  searchable_text TEXT,
  embedding    VECTOR(1024),           -- text-embedding-v3 默认维度
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS kb_slug TEXT NOT NULL DEFAULT 'travel-cn-public';
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS dataset_version TEXT NOT NULL DEFAULT '20260306_004228';
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS sub_section_title TEXT;
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS poi_name TEXT;
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS license TEXT;
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS searchable_text TEXT;
ALTER TABLE public.travel_knowledge ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.build_travel_knowledge_searchable_text(
  p_city TEXT,
  p_type TEXT,
  p_title TEXT,
  p_section_title TEXT,
  p_sub_section_title TEXT,
  p_poi_name TEXT,
  p_tags TEXT[],
  p_content TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      concat_ws(
        ' ',
        coalesce(p_city, ''),
        coalesce(p_type, ''),
        coalesce(p_title, ''),
        coalesce(p_section_title, ''),
        coalesce(p_sub_section_title, ''),
        coalesce(p_poi_name, ''),
        coalesce(array_to_string(p_tags, ' '), ''),
        coalesce(p_content, '')
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_travel_knowledge_searchable_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.searchable_text := public.build_travel_knowledge_searchable_text(
    NEW.city,
    NEW.type,
    NEW.title,
    NEW.section_title,
    NEW.sub_section_title,
    NEW.poi_name,
    NEW.tags,
    NEW.content
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE public.travel_knowledge
SET searchable_text = public.build_travel_knowledge_searchable_text(
  city,
  type,
  title,
  section_title,
  sub_section_title,
  poi_name,
  tags,
  content
)
WHERE searchable_text IS NULL OR searchable_text = '';

-- 3. 业务索引
CREATE INDEX IF NOT EXISTS idx_travel_knowledge_kb_slug
  ON public.travel_knowledge(kb_slug);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_dataset_version
  ON public.travel_knowledge(dataset_version);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_city
  ON public.travel_knowledge(kb_slug, city);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_type
  ON public.travel_knowledge(kb_slug, type);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_lang
  ON public.travel_knowledge(lang);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_tags
  ON public.travel_knowledge USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_metadata
  ON public.travel_knowledge USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_travel_knowledge_searchable_text_trgm
  ON public.travel_knowledge USING gin(searchable_text gin_trgm_ops);

-- 唯一约束：防止重复写入同一 chunk
DROP INDEX IF EXISTS idx_travel_knowledge_content_hash;

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_knowledge_kb_content_hash
  ON public.travel_knowledge(kb_slug, content_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_knowledge_kb_external_id
  ON public.travel_knowledge(kb_slug, dataset_version, external_id)
  WHERE external_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_travel_knowledge_updated_at ON public.travel_knowledge;
DROP TRIGGER IF EXISTS set_travel_knowledge_searchable_text ON public.travel_knowledge;

CREATE TRIGGER set_travel_knowledge_searchable_text
  BEFORE INSERT OR UPDATE OF city, type, title, section_title, sub_section_title, poi_name, tags, content
  ON public.travel_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_travel_knowledge_searchable_text();

CREATE TRIGGER set_travel_knowledge_updated_at
  BEFORE UPDATE ON public.travel_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

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
  filter_kb_slug   TEXT    DEFAULT 'travel-cn-public',
  filter_city      TEXT    DEFAULT NULL,   -- 可选：限定城市
  filter_type      TEXT    DEFAULT NULL,   -- 可选：限定类型
  filter_dataset_version TEXT DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.3  -- 最低相似度阈值，过滤噪声结果
)
RETURNS TABLE (
  id            BIGINT,
  kb_slug       TEXT,
  dataset_version TEXT,
  external_id   TEXT,
  city          TEXT,
  type          TEXT,
  title         TEXT,
  section_title TEXT,
  sub_section_title TEXT,
  poi_name      TEXT,
  content       TEXT,
  tags          TEXT[],
  source        TEXT,
  source_url    TEXT,
  license       TEXT,
  lang          TEXT,
  metadata      JSONB,
  similarity    FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    tk.id,
    tk.kb_slug,
    tk.dataset_version,
    tk.external_id,
    tk.city,
    tk.type,
    tk.title,
    tk.section_title,
    tk.sub_section_title,
    tk.poi_name,
    tk.content,
    tk.tags,
    tk.source,
    tk.source_url,
    tk.license,
    tk.lang,
    tk.metadata,
    (1 - (tk.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.travel_knowledge tk
  WHERE
    tk.kb_slug = filter_kb_slug
    AND
    (filter_city IS NULL OR tk.city = filter_city)
    AND (filter_type IS NULL OR tk.type = filter_type)
    AND (filter_dataset_version IS NULL OR tk.dataset_version = filter_dataset_version)
    AND (1 - (tk.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY tk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_travel_knowledge(
  VECTOR(1024),
  INT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  FLOAT
) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION match_travel_knowledge_sparse(
  query_text TEXT,
  query_terms TEXT[] DEFAULT ARRAY[]::TEXT[],
  match_count INT DEFAULT 20,
  filter_kb_slug TEXT DEFAULT 'travel-cn-public',
  filter_city TEXT DEFAULT NULL,
  filter_type TEXT DEFAULT NULL,
  filter_dataset_version TEXT DEFAULT NULL,
  sparse_threshold FLOAT DEFAULT 0.05
)
RETURNS TABLE (
  id BIGINT,
  kb_slug TEXT,
  dataset_version TEXT,
  external_id TEXT,
  city TEXT,
  type TEXT,
  title TEXT,
  section_title TEXT,
  sub_section_title TEXT,
  poi_name TEXT,
  content TEXT,
  tags TEXT[],
  source TEXT,
  source_url TEXT,
  license TEXT,
  lang TEXT,
  metadata JSONB,
  sparse_score FLOAT
)
LANGUAGE sql
AS $$
  WITH normalized_terms AS (
    SELECT ARRAY(
      SELECT DISTINCT term
      FROM unnest(coalesce(query_terms, ARRAY[]::TEXT[])) AS term
      WHERE length(trim(term)) >= 2
    ) AS terms
  ),
  ranked AS (
    SELECT
      tk.id,
      tk.kb_slug,
      tk.dataset_version,
      tk.external_id,
      tk.city,
      tk.type,
      tk.title,
      tk.section_title,
      tk.sub_section_title,
      tk.poi_name,
      tk.content,
      tk.tags,
      tk.source,
      tk.source_url,
      tk.license,
      tk.lang,
      tk.metadata,
      (
        0.55 * greatest(
          similarity(coalesce(tk.title, ''), query_text),
          similarity(coalesce(tk.poi_name, ''), query_text),
          similarity(coalesce(tk.searchable_text, ''), query_text)
        )
        +
        0.30 * (
          SELECT coalesce(sum(
            CASE
              WHEN coalesce(tk.title, '') ILIKE ('%' || term || '%') THEN 1.5
              WHEN coalesce(tk.poi_name, '') ILIKE ('%' || term || '%') THEN 1.5
              WHEN coalesce(tk.searchable_text, '') ILIKE ('%' || term || '%') THEN 1.0
              ELSE 0.0
            END
          ), 0.0)
          FROM normalized_terms nt, unnest(nt.terms) AS term
        )
        +
        0.15 * CASE
          WHEN coalesce(tk.searchable_text, '') ILIKE ('%' || query_text || '%') THEN 1.0
          ELSE 0.0
        END
      )::FLOAT AS sparse_score
    FROM public.travel_knowledge tk
    WHERE
      tk.kb_slug = filter_kb_slug
      AND (filter_city IS NULL OR tk.city = filter_city)
      AND (filter_type IS NULL OR tk.type = filter_type)
      AND (filter_dataset_version IS NULL OR tk.dataset_version = filter_dataset_version)
  )
  SELECT *
  FROM ranked
  WHERE sparse_score >= sparse_threshold
  ORDER BY sparse_score DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_travel_knowledge_sparse(
  TEXT,
  TEXT[],
  INT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  FLOAT
) TO anon, authenticated, service_role;

-- 6. RLS（行级安全策略）—— 知识库为只读公共数据，允许匿名读取
ALTER TABLE public.travel_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on travel_knowledge" ON public.travel_knowledge;
CREATE POLICY "Allow public read on travel_knowledge"
  ON public.travel_knowledge FOR SELECT
  USING (true);

-- Service role 可写入（ingest 脚本使用 service_role key）
DROP POLICY IF EXISTS "Allow service role write on travel_knowledge" ON public.travel_knowledge;
CREATE POLICY "Allow service role write on travel_knowledge"
  ON public.travel_knowledge FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- 验证
-- =============================================
-- SELECT COUNT(*) FROM public.travel_knowledge;
-- SELECT * FROM match_travel_knowledge('[0.1, 0.2, ...]'::vector, 3);

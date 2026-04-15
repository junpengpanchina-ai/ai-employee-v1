-- intel_items：WorldMonitor 等供料清洗后的标准行，供 /intel 读库总结。
-- 在 Supabase SQL Editor 执行本文件，或经 supabase db push / migrate 应用。

create table if not exists public.intel_items (
  id text primary key,
  source text not null default 'worldmonitor',
  channel text,
  topic text,
  title text not null,
  summary text,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  region text,
  country_codes jsonb not null default '[]'::jsonb,
  signals jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  importance_score integer,
  novelty_score integer,
  confidence_score integer,
  url text,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intel_items_content_hash_unique unique (content_hash)
);

create index if not exists intel_items_captured_at_idx
  on public.intel_items (captured_at desc);

create index if not exists intel_items_published_at_idx
  on public.intel_items (published_at desc nulls last);

comment on table public.intel_items is '供料标准化行；orchestrator /intel 优先读库再喂 GRSAI。';

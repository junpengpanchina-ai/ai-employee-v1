-- wm_raw_items：原始 WM 导出行；intel_briefs：老板可见简报落账。
-- 依赖 20260415000000_intel_items.sql；若 intel_items 已存在，本迁移会扩展列。

-- 原始采集
create table if not exists public.wm_raw_items (
  id bigserial primary key,
  raw_id text not null,
  source text not null default 'worldmonitor',
  source_type text not null default 'json_feed',
  channel text not null default 'all',
  source_url text,
  title text,
  fetched_at timestamptz not null default now(),
  published_at timestamptz,
  content_hash text not null,
  payload_raw jsonb not null default '{}'::jsonb,
  fetch_status text not null default 'ok',
  created_at timestamptz not null default now(),
  constraint wm_raw_items_raw_id_unique unique (raw_id)
);

create index if not exists idx_wm_raw_items_fetched_at
  on public.wm_raw_items (fetched_at desc);
create index if not exists idx_wm_raw_items_content_hash
  on public.wm_raw_items (content_hash);

comment on table public.wm_raw_items is 'WorldMonitor 等原始 JSON 行，便于排障与重跑清洗。';

-- 简报落账
create table if not exists public.intel_briefs (
  id bigserial primary key,
  brief_id text not null,
  mode text not null default 'manual',
  channel text not null default 'all',
  since_hours int not null default 24,
  source_item_ids jsonb not null default '[]'::jsonb,
  top_change text not null default '',
  primary_contradiction text not null default '',
  structural_flow text not null default '',
  competitive_position text not null default '',
  relation_to_user text not null default '',
  actions jsonb not null default '[]'::jsonb,
  reply_text text not null,
  model_name text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint intel_briefs_brief_id_unique unique (brief_id)
);

create index if not exists idx_intel_briefs_generated_at
  on public.intel_briefs (generated_at desc);

comment on table public.intel_briefs is '/intel 产出：可复盘、可供 admin 展示。';

-- 扩展 intel_items：追溯 raw、按标题+链接去重键
alter table public.intel_items add column if not exists raw_ref_id text;
alter table public.intel_items add column if not exists dedupe_key text;

update public.intel_items set dedupe_key = content_hash where dedupe_key is null;

alter table public.intel_items alter column dedupe_key set not null;

create unique index if not exists idx_intel_items_dedupe_key
  on public.intel_items (dedupe_key);

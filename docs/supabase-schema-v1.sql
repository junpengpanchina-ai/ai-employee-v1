-- =========================================================
-- AI Employee Company V1 - Supabase Schema
-- 核心目标：
-- 1) 先打通 Telegram → Railway → GRSAI → Supabase → Telegram
-- 2) 先只保留最小账本：employees / jobs / messages / reports
-- =========================================================

-- 建议先启用 pgcrypto，便于 gen_random_uuid()
create extension if not exists pgcrypto;

-- =========================================================
-- 1. employees
-- AI员工注册表
-- =========================================================
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  status text not null default 'active',
  default_model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint employees_status_check
    check (status in ('active', 'paused', 'archived'))
);

create index if not exists idx_employees_role on public.employees(role);
create index if not exists idx_employees_status on public.employees(status);

-- =========================================================
-- 2. jobs
-- 任务账本：谁发起、给谁做、当前状态、结果摘要
-- =========================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jobs_status_check
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled'))
);

create index if not exists idx_jobs_employee_id on public.jobs(employee_id);
create index if not exists idx_jobs_job_type on public.jobs(job_type);

-- =========================================================
-- 3. messages
-- 消息账本：与 Telegram 等渠道的对话留痕
-- =========================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  telegram_user_id text,
  user_text text,
  reply_text text,
  message_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_chat_id on public.messages(chat_id);
create index if not exists idx_messages_created_at on public.messages(created_at desc);

-- =========================================================
-- 4. reports
-- 报告账本：员工产出摘要
-- =========================================================
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  title text not null,
  content text not null,
  priority text not null,
  report_type text,
  report_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_employee_id on public.reports(employee_id);
create index if not exists idx_reports_created_at on public.reports(created_at desc);

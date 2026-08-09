create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quota_limit int not null default 1000,
  quota_used int not null default 0,
  quota_period_start date not null default date_trunc('month', now()),
  created_at timestamptz not null default now()
);

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  step_order int not null,
  type text not null check (type in
    ('llm_call','http_request','db_write','notify','conditional_branch','approval_gate')),
  config jsonb not null default '{}',
  unique (workflow_id, step_order)
);

create table workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  type text not null check (type in ('manual','webhook','scheduled','db_event')),
  config jsonb not null default '{}'
);

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  org_id uuid not null references organizations(id),
  status text not null check (status in
    ('pending','running','paused','completed','failed')) default 'pending',
  started_by uuid,
  trigger_type text not null,
  started_at timestamptz default now(),
  finished_at timestamptz
);

create table step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  workflow_step_id uuid not null references workflow_steps(id),
  status text not null check (status in
    ('pending','running','succeeded','failed','paused_awaiting_approval','skipped')) default 'pending',
  attempt int not null default 1,
  input jsonb,
  output jsonb,
  error text,
  approved_by uuid,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
);
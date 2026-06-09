create table if not exists public.sales_team_members (
  id text primary key,
  ghl_user_id text,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'setter', 'closer')),
  preferred_language text not null default 'nl' check (preferred_language in ('nl', 'en')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_login_sessions (
  id uuid primary key default gen_random_uuid(),
  team_member_id text not null references public.sales_team_members(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer
);

create table if not exists public.ghl_opportunity_events (
  id text primary key,
  contact_id text,
  assigned_user_id text,
  pipeline_id text,
  stage_id text,
  status text,
  monetary_value numeric,
  created_at timestamptz,
  updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists public.sales_calls (
  id text primary key,
  contact_id text,
  contact_name text,
  setter_user_id text,
  closer_user_id text,
  call_started_at timestamptz,
  duration_seconds integer,
  answered boolean not null default false,
  result text,
  recording_url text,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists public.sales_call_transcripts (
  call_id text primary key references public.sales_calls(id) on delete cascade,
  transcript text not null,
  language text not null default 'nl',
  created_at timestamptz not null default now()
);

create table if not exists public.sales_ai_scores (
  call_id text primary key references public.sales_calls(id) on delete cascade,
  total_score integer not null,
  went_well jsonb not null default '[]'::jsonb,
  could_improve jsonb not null default '[]'::jsonb,
  missed_moment text,
  created_at timestamptz not null default now()
);

create index if not exists sales_calls_setter_idx on public.sales_calls(setter_user_id);
create index if not exists sales_calls_closer_idx on public.sales_calls(closer_user_id);
create index if not exists ghl_opportunity_stage_idx on public.ghl_opportunity_events(stage_id);

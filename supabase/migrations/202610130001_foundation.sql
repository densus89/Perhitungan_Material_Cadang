create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

create type public.app_role as enum ('RST_ADMIN', 'RST_REVIEWER', 'UNIT_OPERATOR', 'VIEWER');
create type public.account_status as enum ('INVITED', 'ACTIVE', 'DISABLED');
create type public.dataset_type as enum ('ASSET', 'HISTORY', 'PRICE', 'LEAD_TIME', 'LOCATION', 'RFQ_REFERENCE');
create type public.dataset_status as enum ('DRAFT', 'NEEDS_FIX', 'READY_TO_SUBMIT', 'PENDING_RST', 'REJECTED', 'ACTIVE', 'HISTORICAL', 'TRASH');
create type public.approval_action as enum ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'ACTIVATED', 'RESTORED', 'TRASHED', 'PURGED');

create table public.unit_induk (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint unit_induk_code_nonempty check (code = btrim(code) and code <> ''),
  constraint unit_induk_name_nonempty check (btrim(name) <> '')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  status public.account_status not null default 'INVITED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_pln_domain check (
    email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@pln\.co\.id$'
  )
);

create table public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.user_unit_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_induk_id uuid not null references public.unit_induk(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, unit_induk_id)
);

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  unit_induk_id uuid not null references public.unit_induk(id) on delete restrict,
  type public.dataset_type not null,
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_induk_id, type)
);

create table public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status public.dataset_status not null default 'DRAFT',
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_id, version_number),
  unique (dataset_id, id)
);

-- Both sides exist before adding the circular relationship. The second FK
-- prevents a dataset from pointing at another dataset's version.
alter table public.datasets
  add constraint datasets_active_version_id_fkey foreign key (active_version_id)
    references public.dataset_versions(id) on delete restrict,
  add constraint datasets_active_version_dataset_fkey foreign key (id, active_version_id)
    references public.dataset_versions(dataset_id, id) on delete restrict;

create table public.approval_events (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references public.dataset_versions(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action public.approval_action not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null check (btrim(action) <> ''),
  target_type text not null check (btrim(target_type) <> ''),
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index user_role_assignments_role_idx on public.user_role_assignments(role, user_id);
create index user_unit_assignments_unit_idx on public.user_unit_assignments(unit_induk_id, user_id);
-- The dataset (unit_induk_id, type) unique index and assignment unique indexes
-- also serve the unit/type and user assignment lookup paths.
create index dataset_versions_status_idx on public.dataset_versions(status, dataset_id);
create index dataset_versions_created_by_idx on public.dataset_versions(created_by);
create index datasets_active_version_idx on public.datasets(active_version_id);
create index approval_events_version_time_idx on public.approval_events(dataset_version_id, created_at desc);
create index approval_events_actor_idx on public.approval_events(actor_id);
create index audit_events_actor_idx on public.audit_events(actor_id);
create index audit_events_target_time_idx on public.audit_events(target_type, target_id, created_at desc);

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, status)
  values (
    new.id,
    lower(btrim(new.email)),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
             nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    'INVITED'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create function public.activate_my_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update public.profiles
  set status = 'ACTIVE', updated_at = now()
  where id = current_user_id and status = 'INVITED';
end;
$$;

revoke all on function public.activate_my_profile() from public, anon, authenticated;
grant execute on function public.activate_my_profile() to authenticated;

-- Fail closed during the foundation phase. Task 3 adds the application
-- authorization helpers, grants, and policies; no roles are assigned by Auth.
alter table public.unit_induk enable row level security;
alter table public.profiles enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.user_unit_assignments enable row level security;
alter table public.datasets enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.approval_events enable row level security;
alter table public.audit_events enable row level security;

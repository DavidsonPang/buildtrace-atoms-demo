create table public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 0 and 2000),
  mode text not null check (mode in ('quick', 'guided')),
  run_state text not null check (
    run_state in (
      'idle',
      'running',
      'awaiting_user',
      'previewing',
      'ready',
      'failed',
      'cancelled',
      'rebuilding',
      'retrying'
    )
  ),
  stages jsonb not null,
  provider_label text not null check (char_length(provider_label) <= 120),
  product jsonb,
  technical_plan jsonb,
  generated_app jsonb,
  active_version_id uuid,
  last_error text not null default '' check (char_length(last_error) <= 600),
  brief_revision integer not null default 0 check (brief_revision >= 0),
  saved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_versions (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  revision integer not null check (revision > 0),
  prompt text not null check (char_length(prompt) between 10 and 2000),
  provider_label text not null check (char_length(provider_label) <= 120),
  product jsonb not null,
  technical_plan jsonb not null,
  generated_app jsonb not null,
  accepted_html text not null check (octet_length(accepted_html) <= 150000),
  checks jsonb not null,
  created_at timestamptz not null,
  unique (project_id, revision)
);

create index projects_user_saved_at_idx
  on public.projects (user_id, saved_at desc);

create index project_versions_project_revision_idx
  on public.project_versions (project_id, revision desc);

alter table public.projects enable row level security;
alter table public.project_versions enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.project_versions from anon, authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.project_versions to authenticated;

create policy "Users can read their own projects"
  on public.projects for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can create their own projects"
  on public.projects for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can update their own projects"
  on public.projects for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can delete their own projects"
  on public.projects for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can read their own project versions"
  on public.project_versions for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "Users can create their own project versions"
  on public.project_versions for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1
      from public.projects
      where projects.id = project_versions.project_id
        and projects.user_id = (select auth.uid())
    )
  );

create policy "Users can update their own project versions"
  on public.project_versions for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1
      from public.projects
      where projects.id = project_versions.project_id
        and projects.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own project versions"
  on public.project_versions for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

comment on table public.projects is
  'Current BuildTrace project snapshots owned by authenticated users.';
comment on table public.project_versions is
  'Last successful BuildTrace artifacts and self-contained HTML versions.';

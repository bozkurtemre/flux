-- A user's preferences, as Flux syncs them: one row per person, readable and writable by that
-- person alone. Connections, their tokens, projects and saved queries are never written here;
-- they stay on the machine they were set up on. See docs/adr/0009.
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "a person reads their own settings"
  on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "a person creates their own settings"
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "a person changes their own settings"
  on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "a person deletes their own settings"
  on public.user_settings for delete to authenticated
  using ((select auth.uid()) = user_id);

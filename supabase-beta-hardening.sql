-- cslid. beta hardening (additive and safe to re-run).
-- Run after the non-destructive migration 001. Never run supabase-schema.sql
-- against a live project; that file is a destructive full reset.

-- Startup ownership is founder-only for every write operation, not just insert.
drop policy if exists "Users manage own startups" on public.cslid_startups;
drop policy if exists "Users update own startups" on public.cslid_startups;
drop policy if exists "Users delete own startups" on public.cslid_startups;
drop policy if exists "Founders create own startups" on public.cslid_startups;
drop policy if exists "Founders update own startups" on public.cslid_startups;
drop policy if exists "Founders delete own startups" on public.cslid_startups;
create policy "Founders create own startups" on public.cslid_startups
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.cslid_users u
      where u.id = auth.uid() and u.role = 'founder'
    )
  );
create policy "Founders update own startups" on public.cslid_startups
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.cslid_users u
      where u.id = auth.uid() and u.role = 'founder'
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.cslid_users u
      where u.id = auth.uid() and u.role = 'founder'
    )
  );
create policy "Founders delete own startups" on public.cslid_startups
  for delete to authenticated using (
    user_id = auth.uid()
    and exists (
      select 1 from public.cslid_users u
      where u.id = auth.uid() and u.role = 'founder'
    )
  );

-- A user's public profile role must agree with their authoritative account role.
drop policy if exists "Users manage own profile" on public.cslid_profiles;
drop policy if exists "Users read own profile" on public.cslid_profiles;
drop policy if exists "Users create own profile" on public.cslid_profiles;
drop policy if exists "Users update own profile" on public.cslid_profiles;
drop policy if exists "Users delete own profile" on public.cslid_profiles;
create policy "Users read own profile" on public.cslid_profiles
  for select to authenticated using (user_id = auth.uid());
create policy "Users create own profile" on public.cslid_profiles
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.cslid_users u
      where u.id = auth.uid() and u.role = cslid_profiles.role
    )
  );
create policy "Users update own profile" on public.cslid_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.cslid_users u
      where u.id = auth.uid() and u.role = cslid_profiles.role
    )
  );
create policy "Users delete own profile" on public.cslid_profiles
  for delete to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';

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

-- Moderation access is granted manually to trusted accounts from the SQL editor.
create table if not exists public.cslid_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.cslid_moderators enable row level security;
revoke all on public.cslid_moderators from public, anon, authenticated;
grant select on public.cslid_moderators to authenticated;
drop policy if exists "Moderators can see own assignment" on public.cslid_moderators;
create policy "Moderators can see own assignment" on public.cslid_moderators
  for select to authenticated using (user_id = auth.uid());

alter table public.cslid_reports
  add column if not exists reported_post_id uuid references public.cslid_posts(id) on delete set null;
alter table public.cslid_reports
  add column if not exists status text not null default 'open';
alter table public.cslid_reports
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.cslid_reports
  add column if not exists reviewed_at timestamptz;
alter table public.cslid_reports
  add column if not exists resolution_note text;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cslid_reports_status_check'
      and conrelid = 'public.cslid_reports'::regclass
  ) then
    alter table public.cslid_reports
      add constraint cslid_reports_status_check check (status in ('open', 'reviewed', 'dismissed'));
  end if;
end $$;
create index if not exists cslid_reports_status_created_idx
  on public.cslid_reports (status, created_at desc);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'cslid_reports'
     ) then
    alter publication supabase_realtime add table public.cslid_reports;
  end if;
end $$;

alter table public.cslid_reports enable row level security;
revoke all on public.cslid_reports from public, anon, authenticated;
grant select on public.cslid_reports to authenticated;

create or replace function public.is_cslid_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cslid_moderators m where m.user_id = auth.uid()
  );
$$;
revoke all on function public.is_cslid_moderator() from public;
grant execute on function public.is_cslid_moderator() to authenticated;
drop policy if exists "Moderators can view all reports" on public.cslid_reports;
create policy "Moderators can view all reports" on public.cslid_reports
  for select to authenticated using (public.is_cslid_moderator());

create or replace function public.report_post(p_post_id uuid, p_reason text)
returns public.cslid_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  reporter uuid := auth.uid();
  post_owner uuid;
  report_row public.cslid_reports;
begin
  if reporter is null then
    raise exception 'Authentication required';
  end if;
  if p_post_id is null or char_length(trim(coalesce(p_reason, ''))) = 0
     or char_length(p_reason) > 1000 then
    raise exception 'Provide a post and a reason of at most 1000 characters';
  end if;
  select user_id into post_owner from public.cslid_posts where id = p_post_id;
  if post_owner is null then
    raise exception 'Post not found';
  end if;
  if post_owner = reporter then
    raise exception 'You cannot report your own post';
  end if;

  insert into public.cslid_reports (reporter_id, reported_id, reported_post_id, reason)
  values (reporter, post_owner, p_post_id, left(trim(p_reason), 1000))
  returning * into report_row;
  return report_row;
end;
$$;
revoke all on function public.report_post(uuid, text) from public;
grant execute on function public.report_post(uuid, text) to authenticated;

create or replace function public.moderation_queue(p_include_closed boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_cslid_moderator() then
    raise exception 'Moderator access required';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'reporter_id', r.reporter_id,
      'reporter_name', reporter_profile.name,
      'reported_id', r.reported_id,
      'reported_name', reported_profile.name,
      'reported_post_id', r.reported_post_id,
      'post_content', reported_post.content,
      'reason', r.reason,
      'status', r.status,
      'created_at', r.created_at,
      'reviewed_at', r.reviewed_at,
      'reviewed_by', r.reviewed_by,
      'resolution_note', r.resolution_note
    ) order by r.created_at desc), '[]'::jsonb)
    from public.cslid_reports r
    left join public.cslid_profiles reporter_profile on reporter_profile.user_id = r.reporter_id
    left join public.cslid_profiles reported_profile on reported_profile.user_id = r.reported_id
    left join public.cslid_posts reported_post on reported_post.id = r.reported_post_id
    where p_include_closed or r.status = 'open'
  );
end;
$$;
revoke all on function public.moderation_queue(boolean) from public;
grant execute on function public.moderation_queue(boolean) to authenticated;

create or replace function public.review_report(p_report_id uuid, p_status text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_cslid_moderator() then
    raise exception 'Moderator access required';
  end if;
  if p_status not in ('reviewed', 'dismissed')
     or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'Invalid report review status or note';
  end if;

  update public.cslid_reports
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      resolution_note = nullif(trim(p_note), '')
  where id = p_report_id and status = 'open';

  if not found then
    raise exception 'Open report not found';
  end if;
  return true;
end;
$$;
revoke all on function public.review_report(uuid, text, text) from public;
grant execute on function public.review_report(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

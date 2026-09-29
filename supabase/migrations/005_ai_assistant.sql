-- 005: support tables/RPCs for the AI assistant (public chat widget + admin helper).
-- No new secrets live in the database; the Gemini key stays a Vercel env var,
-- read only by /api/*.js. This migration only adds:
--   1. a single safe, read-only RPC the public chat endpoint uses to fetch
--      published portfolio data (same shape/security as get_portfolio(), just
--      exposed as distinct callable "tools" for the model)
--   2. an admin_settings row controlling whether the admin AI helper may act
--      immediately or must always ask for confirmation first
--   3. an audit log of actions the admin AI helper actually performs

-- ---------------------------------------------------------------- admin settings (assistant behavior)
create table if not exists public.admin_settings (
  id smallint primary key default 1 check (id = 1),
  ai_auto_execute boolean not null default false, -- false = always confirm before writing
  updated_at timestamptz not null default now()
);
insert into public.admin_settings (id) values (1) on conflict do nothing;

alter table public.admin_settings enable row level security;
create policy "Admin reads settings" on public.admin_settings for select to authenticated using ((select public.is_admin()));
create policy "Admin updates settings" on public.admin_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, update on public.admin_settings to authenticated;

create trigger admin_settings_updated_at before update on public.admin_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- admin AI action log
create table if not exists public.ai_action_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,             -- e.g. 'projects.update'
  target_table text,
  target_id uuid,
  payload jsonb,
  result text not null default 'applied' check (result in ('applied', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);
alter table public.ai_action_log enable row level security;
create policy "Admin reads action log" on public.ai_action_log for select to authenticated using ((select public.is_admin()));
create policy "Admin inserts action log" on public.ai_action_log for insert to authenticated with check ((select public.is_admin()));
grant select, insert on public.ai_action_log to authenticated;

-- ---------------------------------------------------------------- public chat: read-only info tools
-- One RPC per "tool" the assistant can call, each SECURITY INVOKER so normal
-- anon RLS (status = 'published') applies — the assistant can never see drafts.

create or replace function public.ai_get_profile()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'resume_url' from public.site_profile p where p.id = 1),
    'social',  coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.social_links x where x.status = 'published'), '[]'),
    'facts',   coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.about_facts x where x.status = 'published'), '[]')
  );
$$;
grant execute on function public.ai_get_profile() to anon, authenticated;

create or replace function public.ai_list_projects(p_search text default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]')
  from (
    select id, title, slug, short_description, main_image_url, gallery, technologies, category,
           github_url, live_url, project_status, featured, sort_order
    from public.projects
    where status = 'published'
      and (p_search is null or title ilike '%' || p_search || '%' or category ilike '%' || p_search || '%'
           or short_description ilike '%' || p_search || '%')
  ) x;
$$;
grant execute on function public.ai_list_projects(text) to anon, authenticated;

create or replace function public.ai_list_skills()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', x.name, 'category', c.name, 'level', x.level, 'years_experience', x.years_experience
    ) order by x.sort_order), '[]')
  from public.skills x left join public.skill_categories c on c.id = x.category_id
  where x.status = 'published';
$$;
grant execute on function public.ai_list_skills() to anon, authenticated;

create or replace function public.ai_list_experience()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order desc), '[]')
  from (select position, company, start_date, end_date, is_current, description, technologies
        from public.experiences where status = 'published') x;
$$;
grant execute on function public.ai_list_experience() to anon, authenticated;

create or replace function public.ai_list_certificates()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]')
  from (select name, issuer, issue_date, image_url, verification_url
        from public.certificates where status = 'published') x;
$$;
grant execute on function public.ai_list_certificates() to anon, authenticated;

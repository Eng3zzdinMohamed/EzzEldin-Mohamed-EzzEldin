-- 004: one public read endpoint for the whole site. SECURITY INVOKER, so RLS still applies:
-- anon only ever receives rows with status = 'published'.
create or replace function public.get_portfolio()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'profile',  (select to_jsonb(p) from public.site_profile p where p.id = 1),
    'settings', (select to_jsonb(s) from public.site_settings s where s.id = 1),
    'social',   coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.social_links x), '[]'),
    'facts',    coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.about_facts x), '[]'),
    'focus',    coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.focus_tags x), '[]'),
    'toolbox',  coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.toolbox_items x), '[]'),
    'education',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.education x), '[]'),
    'experiences', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.experiences x), '[]'),
    'projects', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at desc) from public.projects x), '[]'),
    'certificates', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.certificates x), '[]'),
    'skill_categories', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.skill_categories x), '[]'),
    'skills',   coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.skills x
                  where x.category_id is null or exists (select 1 from public.skill_categories c where c.id = x.category_id)), '[]')
  );
$$;
grant execute on function public.get_portfolio() to anon, authenticated;

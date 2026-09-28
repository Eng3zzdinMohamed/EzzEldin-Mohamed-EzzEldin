-- 002: CMS schema for the Admin Control Panel
-- Security model: the public (anon) can only READ rows with status = 'published'.
-- Only a confirmed Supabase Auth user whose email is in public.admins can write.

create type public.content_status as enum ('draft', 'published', 'hidden');

-- ---------------------------------------------------------------- admins
create table public.admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;  -- no policies: not reachable via the API

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- singletons
create table public.site_profile (
  id smallint primary key default 1 check (id = 1),
  full_name text not null check (char_length(full_name) between 1 and 120),
  professional_title text check (char_length(professional_title) <= 160),
  short_bio text check (char_length(short_bio) <= 500),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (char_length(phone) <= 40),
  location text check (char_length(location) <= 120),
  profile_image_url text check (profile_image_url ~* '^(https?://|/)\S*$'),
  profile_image_alt text check (char_length(profile_image_alt) <= 200),
  resume_url text check (resume_url ~* '^(https?://|/)\S*$'),
  -- hero
  hero_kicker text check (char_length(hero_kicker) <= 160),
  hero_title text check (char_length(hero_title) <= 160),
  hero_subtitle text check (char_length(hero_subtitle) <= 400),
  hero_description text check (char_length(hero_description) <= 1000),
  hero_primary_label text check (char_length(hero_primary_label) <= 40),
  hero_primary_url text check (hero_primary_url ~* '^(https?://|/|#)\S*$'),
  hero_secondary_label text check (char_length(hero_secondary_label) <= 40),
  hero_secondary_url text check (hero_secondary_url ~* '^(https?://|/|#)\S*$'),
  show_cv_button boolean not null default false,
  cv_button_label text not null default 'Download CV' check (char_length(cv_button_label) <= 40),
  -- about
  about_body text check (char_length(about_body) <= 8000),  -- paragraphs separated by a blank line
  about_quote text check (char_length(about_quote) <= 600),
  about_quote_attribution text check (char_length(about_quote_attribution) <= 120),
  years_of_experience numeric(4,1) check (years_of_experience >= 0),
  show_about_stats boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  site_name text not null check (char_length(site_name) between 1 and 120),
  logo_url text check (logo_url ~* '^(https?://|/)\S*$'),
  favicon_url text check (favicon_url ~* '^(https?://|/)\S*$'),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  site_url text check (site_url ~* '^https?://\S*$'),
  seo_title text check (char_length(seo_title) <= 120),
  seo_description text check (char_length(seo_description) <= 320),
  seo_keywords text check (char_length(seo_keywords) <= 400),
  og_image_url text check (og_image_url ~* '^(https?://|/)\S*$'),
  ga_measurement_id text check (ga_measurement_id ~ '^G-[A-Z0-9]{4,20}$'),
  footer_text text check (char_length(footer_text) <= 200),
  maintenance_mode boolean not null default false,
  maintenance_message text check (char_length(maintenance_message) <= 500),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- simple lists
create table public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'other' check (platform in
    ('github','linkedin','facebook','instagram','youtube','x','email','website','other')),
  label text not null check (char_length(label) between 1 and 60),
  handle text check (char_length(handle) <= 100),
  url text not null check (url ~* '^(https?://|mailto:|tel:)\S*$'),
  show_in_nav boolean not null default false,
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.about_facts (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 60),
  value text not null check (char_length(value) between 1 and 160),
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.focus_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 80),
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.toolbox_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  role text check (char_length(role) <= 200),
  link_label text check (char_length(link_label) <= 40),
  url text check (url ~* '^https?://\S*$'),
  icon_key text check (icon_key in ('github','supabase','vercel')),
  icon_url text check (icon_url ~* '^(https?://|/)\S*$'),
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- skills
create table public.skill_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  category_id uuid references public.skill_categories(id) on delete restrict,
  icon text check (char_length(icon) <= 300),                 -- emoji, or an image URL
  level smallint check (level between 0 and 100),
  years_experience numeric(4,1) check (years_experience >= 0),
  description text check (char_length(description) <= 500),
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index skills_category_idx on public.skills(category_id);

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  short_description text check (char_length(short_description) <= 400),
  full_description text check (char_length(full_description) <= 20000),
  main_image_url text check (main_image_url ~* '^(https?://|/)\S*$'),
  main_image_alt text check (char_length(main_image_alt) <= 200),
  gallery text[] not null default '{}',
  technologies text[] not null default '{}',
  category text check (char_length(category) <= 80),
  github_url text check (github_url ~* '^https?://\S*$'),
  live_url text check (live_url ~* '^https?://\S*$'),
  project_date date,
  project_status text not null default 'completed'
    check (project_status in ('planned','in_progress','completed','archived')),
  featured boolean not null default false,
  seo_title text check (char_length(seo_title) <= 120),
  seo_description text check (char_length(seo_description) <= 320),
  sort_order integer not null default 0,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- certificates
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  issuer text not null check (char_length(issuer) between 1 and 160),
  issue_date date,
  expiration_date date,
  credential_id text check (char_length(credential_id) <= 120),
  image_url text check (image_url ~* '^(https?://|/)\S*$'),
  image_alt text check (char_length(image_alt) <= 200),
  pdf_url text check (pdf_url ~* '^(https?://|/)\S*$'),
  verification_url text check (verification_url ~* '^https?://\S*$'),
  description text check (char_length(description) <= 2000),
  featured boolean not null default false,
  sort_order integer not null default 0,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiration_date is null or issue_date is null or expiration_date >= issue_date)
);

-- ---------------------------------------------------------------- experience & education
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  position text not null check (char_length(position) between 1 and 160),
  company text not null check (char_length(company) between 1 and 160),
  logo_url text check (logo_url ~* '^(https?://|/)\S*$'),
  start_date date not null,
  end_date date,
  is_current boolean not null default false,
  description text check (char_length(description) <= 4000),
  responsibilities text[] not null default '{}',
  technologies text[] not null default '{}',
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (is_current and end_date is not null)),
  check (end_date is null or end_date >= start_date)
);

create table public.education (
  id uuid primary key default gen_random_uuid(),
  institution text not null check (char_length(institution) between 1 and 200),
  degree text check (char_length(degree) <= 160),
  field_of_study text check (char_length(field_of_study) <= 160),
  badge_text text check (char_length(badge_text) <= 12),
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text check (char_length(description) <= 2000),
  logo_url text check (logo_url ~* '^(https?://|/)\S*$'),
  document_url text check (document_url ~* '^(https?://|/)\S*$'),
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (is_current and end_date is not null)),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- ---------------------------------------------------------------- media registry
create table public.media (
  id uuid primary key default gen_random_uuid(),
  storage_path text unique,                   -- null = a static file shipped with the site
  url text not null check (url ~* '^(https?://|/)\S*$'),
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null check (mime_type in
    ('image/jpeg','image/png','image/webp','image/gif','image/avif','application/pdf')),
  kind text generated always as (case when mime_type = 'application/pdf' then 'pdf' else 'image' end) stored,
  size_bytes bigint check (size_bytes >= 0),
  alt_text text check (char_length(alt_text) <= 200),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- contact messages (extend existing)
alter table public.contact_messages add column if not exists is_read boolean not null default false;
alter table public.contact_messages
  add constraint contact_name_len check (char_length(btrim(name)) between 1 and 120),
  add constraint contact_email_fmt check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint contact_message_len check (char_length(btrim(message)) between 1 and 5000);

-- ---------------------------------------------------------------- triggers
do $$
declare t text;
begin
  foreach t in array array['site_profile','site_settings','social_links','about_facts','focus_tags',
    'toolbox_items','skill_categories','skills','projects','certificates','experiences','education']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  -- list-style content: public reads published only; admin does everything
  foreach t in array array['social_links','about_facts','focus_tags','toolbox_items',
    'skill_categories','skills','projects','certificates','experiences','education']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Public reads published" on public.%I for select to anon, authenticated using (status = ''published'')', t);
    execute format('create policy "Admin full access" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  -- singletons: fully public read, admin write
  foreach t in array array['site_profile','site_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Public reads" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "Admin full access" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.media enable row level security;
create policy "Admin full access" on public.media for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.media to authenticated;

-- contact messages: anyone may insert (as unread), only admin may read / update / delete
drop policy if exists "Public can submit contact messages" on public.contact_messages;
create policy "Public can submit contact messages" on public.contact_messages
  for insert to anon, authenticated with check (is_read = false);
create policy "Admin reads messages" on public.contact_messages
  for select to authenticated using ((select public.is_admin()));
create policy "Admin updates messages" on public.contact_messages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin deletes messages" on public.contact_messages
  for delete to authenticated using ((select public.is_admin()));
grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;

-- ---------------------------------------------------------------- RPCs (security invoker: RLS still applies)
create or replace function public.reorder_rows(p_table text, p_ids uuid[])
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if p_table not in ('projects','skills','skill_categories','certificates','experiences',
                     'education','social_links','about_facts','focus_tags','toolbox_items') then
    raise exception 'Table % cannot be reordered', p_table;
  end if;
  execute format(
    'update public.%I t set sort_order = (o.ord * 10)::int from unnest($1) with ordinality as o(id, ord) where t.id = o.id',
    p_table) using p_ids;
end $$;
revoke all on function public.reorder_rows(text, uuid[]) from public, anon;
grant execute on function public.reorder_rows(text, uuid[]) to authenticated;

create or replace function public.admin_dashboard()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'projects',          (select count(*) from public.projects),
    'projects_published',(select count(*) from public.projects where status = 'published'),
    'projects_draft',    (select count(*) from public.projects where status = 'draft'),
    'projects_featured', (select count(*) from public.projects where featured),
    'skills',            (select count(*) from public.skills),
    'certificates',      (select count(*) from public.certificates),
    'experiences',       (select count(*) from public.experiences),
    'education',         (select count(*) from public.education),
    'messages',          (select count(*) from public.contact_messages),
    'messages_unread',   (select count(*) from public.contact_messages where not is_read),
    'recent_projects',   coalesce((select jsonb_agg(p) from (
        select id, title, status, created_at from public.projects order by created_at desc limit 5) p), '[]'),
    'recent_updates',    coalesce((select jsonb_agg(u) from (
        select * from (
          select 'projects' as kind, id, title as label, updated_at from public.projects
          union all select 'skills', id, name, updated_at from public.skills
          union all select 'certificates', id, name, updated_at from public.certificates
          union all select 'experiences', id, position, updated_at from public.experiences
          union all select 'education', id, institution, updated_at from public.education
        ) x order by updated_at desc limit 8) u), '[]'),
    'recent_messages',   coalesce((select jsonb_agg(m) from (
        select id, name, email, left(message, 140) as excerpt, is_read, created_at
        from public.contact_messages order by created_at desc limit 5) m), '[]')
  );
$$;
revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

-- ---------------------------------------------------------------- Storage bucket (public read, admin write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admin reads media objects" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
create policy "Admin uploads media objects" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "Admin updates media objects" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
create policy "Admin deletes media objects" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

-- ---------------------------------------------------------------- the one admin
insert into public.admins (email) values ('ezzmoha2022@gmail.com') on conflict do nothing;

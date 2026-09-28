-- 003: move the content that used to be hard-coded in index.html into the database.
-- Idempotent: safe to run more than once.

insert into public.site_profile (
  id, full_name, professional_title, short_bio, location, profile_image_url, profile_image_alt,
  hero_kicker, hero_title, hero_subtitle, hero_description,
  hero_primary_label, hero_primary_url, hero_secondary_label, hero_secondary_url,
  about_body, about_quote, about_quote_attribution
) values (
  1, 'Ezz-Eldin Mohamed', 'Software & AI Engineer',
  'Software engineer and AI builder from Egypt, studying Computers & AI. Full-stack, applied AI, and a habit of helping people work through problems.',
  'Egypt', '/assets/images/ezzeldin.webp', 'Portrait of Ezz-Eldin Mohamed',
  'Software & AI Engineer · Egypt', 'Ezz-Eldin Mohamed',
  'I build full-stack products and applied-AI systems, and I''m three years into a Computers & AI degree.',
  'Curiosity is what drives most of my work — I like picking a new subject apart until I understand it, then turning that into software. Helping other people get unstuck on their own problems is the part I enjoy most.',
  'Get in touch', '#contact', 'View the code', 'https://github.com/Eng3zzdinMohamed/EzzEldin-Mohamed-EzzEldin',
  E'I''m 21, based in Egypt, and currently in my third year of a Computers & AI degree. Most of what I do sits between full-stack engineering and applied AI — building the interface, the backend, and the model behind it as one connected thing rather than separate jobs.\n\nI learn by shipping. When something''s unfamiliar, I''d rather build a small working version of it than read about it for a week — and I like doing the same for other people, walking through a problem until it makes sense.',
  'انا احب التعلم عن كل شئ، ومهندس برمجيات الذكاء الاصطناعي، ومساعدة الآخرين هي ميزتي الخاصة، وأقيم في مصر.',
  '— in his own words'
) on conflict (id) do nothing;

insert into public.site_settings (
  id, site_name, logo_url, favicon_url, site_url, seo_title, seo_description, og_image_url, footer_text
) values (
  1, 'Ezz-Eldin Mohamed', null, '/favicon.webp', 'https://ezzeldin.vercel.app',
  'Ezz-Eldin Mohamed — Software & AI Engineer',
  'Ezz-Eldin Mohamed is a software engineer and AI builder from Egypt, studying Computers & AI, working across full-stack and applied AI.',
  'https://ezzeldin.vercel.app/assets/images/thumbnail.jpg', 'Building a better tomorrow.'
) on conflict (id) do nothing;

insert into public.social_links (platform, label, handle, url, show_in_nav, sort_order)
select 'github', 'GitHub', '@Eng3zzdinMohamed on GitHub',
       'https://github.com/Eng3zzdinMohamed/EzzEldin-Mohamed-EzzEldin', true, 10
where not exists (select 1 from public.social_links);

insert into public.about_facts (label, value, sort_order)
select v.label, v.value, v.ord from (values
  ('Name', 'Ezz-Eldin Mohamed Ezz-Eldin', 10), ('Age', '21', 20), ('Based in', 'Egypt', 30),
  ('Studying', 'Computers & AI', 40), ('Year', '3rd year, ongoing', 50),
  ('Strength', 'Helping others solve problems', 60)) as v(label, value, ord)
where not exists (select 1 from public.about_facts);

insert into public.focus_tags (label, sort_order)
select v.label, v.ord from (values
  ('Full-stack development', 10), ('Applied AI', 20), ('Web development', 30),
  ('Problem solving', 40), ('Teamwork', 50), ('Always learning something new', 60)) as v(label, ord)
where not exists (select 1 from public.focus_tags);

insert into public.toolbox_items (name, role, link_label, url, icon_key, sort_order)
select v.* from (values
  ('GitHub', 'Where the source for this site lives', 'Open repo',
   'https://github.com/Eng3zzdinMohamed/EzzEldin-Mohamed-EzzEldin', 'github', 10),
  ('Supabase', 'Where messages from the contact form land', 'supabase.com', 'https://supabase.com', 'supabase', 20),
  ('Vercel', 'Where this site is hosted and deployed', 'vercel.com', 'https://vercel.com', 'vercel', 30)
) as v(name, role, link_label, url, icon_key, ord)
where not exists (select 1 from public.toolbox_items);

insert into public.education (institution, badge_text, description, is_current, sort_order)
select 'Faculty of Computers & Artificial Intelligence', 'C&AI', '3rd year — Egypt', true, 10
where not exists (select 1 from public.education);

-- register the images already shipped with the site so they show up in the Media Library
insert into public.media (storage_path, url, file_name, mime_type, alt_text)
select null, v.url, v.fname, v.mime, v.alt from (values
  ('/assets/images/ezzeldin.webp', 'ezzeldin.webp', 'image/webp', 'Portrait of Ezz-Eldin Mohamed'),
  ('/assets/images/logo.webp', 'logo.webp', 'image/webp', 'Site logo'),
  ('/assets/images/thumbnail.jpg', 'thumbnail.jpg', 'image/jpeg', 'Social sharing preview'),
  ('/favicon.webp', 'favicon.webp', 'image/webp', 'Favicon')
) as v(url, fname, mime, alt)
where not exists (select 1 from public.media where url = v.url);

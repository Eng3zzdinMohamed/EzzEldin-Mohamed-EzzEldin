// Dependency-free admin panel. Security lives in Supabase (Auth + RLS + Storage policies);
// this file only uses the public publishable key, never a service-role key.
const SB = 'https://rvebcxwginxwwuyvalcg.supabase.co';
const KEY = 'sb_publishable_HXUhmwrZDAk7sLlVodf_Pw_ZtD8mAgB';
const $app = document.getElementById('app');

/* ---------- tiny DOM helper (text is always set via textContent => no XSS) ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

/* ---------- session + API ---------- */
let session = JSON.parse(localStorage.getItem('adm_session') || 'null');
const save = (s) => { session = s; s ? localStorage.setItem('adm_session', JSON.stringify(s)) : localStorage.removeItem('adm_session'); };

async function auth(path, body) {
  const r = await fetch(`${SB}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Auth failed');
  return { access_token: j.access_token, refresh_token: j.refresh_token, email: j.user && j.user.email };
}
async function refresh() {
  if (!session) throw new Error('Signed out');
  save(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
}
async function api(path, { method = 'GET', body, headers = {}, raw } = {}, retry = true) {
  const r = await fetch(`${SB}${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${session ? session.access_token : KEY}`, ...(raw ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body)
  });
  if (r.status === 401 && retry && session) { try { await refresh(); } catch { save(null); location.reload(); } return api(path, { method, body, headers, raw }, false); }
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new Error((j && (j.message || j.error)) || `Request failed (${r.status})`);
  return j;
}
const rest = (p, o) => api(`/rest/v1/${p}`, o);
const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: args || {} });

/* ---------- content schema ---------- */
const ST = ['draft', 'published', 'hidden'];
const status = ['status', 'Status', 'select', { options: ST }];
const R = {
  projects: { label: 'Projects', title: 'title', sort: true, fields: [
    ['title', 'Title', 'text', { req: 1 }], ['slug', 'Slug (URL name)', 'text', { req: 1, hint: 'lowercase-with-dashes' }],
    ['short_description', 'Short description', 'area'], ['full_description', 'Full description', 'area', { big: 1 }],
    ['main_image_url', 'Main image', 'image'], ['main_image_alt', 'Image alt text', 'text'],
    ['gallery', 'Gallery image URLs', 'list', { hint: 'one per line' }], ['technologies', 'Technologies', 'list', { hint: 'one per line' }],
    ['category', 'Category', 'text'], ['github_url', 'GitHub URL', 'text'], ['live_url', 'Live URL', 'text'],
    ['project_date', 'Date', 'date'], ['project_status', 'Project status', 'select', { options: ['planned', 'in_progress', 'completed', 'archived'] }],
    ['featured', 'Featured', 'bool'], ['seo_title', 'SEO title', 'text'], ['seo_description', 'SEO description', 'area'], status] },
  skill_categories: { label: 'Skill categories', title: 'name', sort: true, fields: [['name', 'Name', 'text', { req: 1 }], ['description', 'Description', 'area'], status] },
  skills: { label: 'Skills', title: 'name', sort: true, fields: [
    ['name', 'Name', 'text', { req: 1 }], ['category_id', 'Category', 'select', { from: 'skill_categories', fromLabel: 'name' }],
    ['icon', 'Icon (emoji or image URL)', 'text'], ['level', 'Level (0–100)', 'num'], ['years_experience', 'Years of experience', 'num'],
    ['description', 'Description', 'area'], status] },
  experiences: { label: 'Experience', title: 'position', sort: true, fields: [
    ['position', 'Position', 'text', { req: 1 }], ['company', 'Company', 'text', { req: 1 }], ['logo_url', 'Logo', 'image'],
    ['start_date', 'Start date', 'date', { req: 1 }], ['end_date', 'End date', 'date'], ['is_current', 'Current job', 'bool'],
    ['description', 'Description', 'area'], ['responsibilities', 'Responsibilities', 'list', { hint: 'one per line' }],
    ['technologies', 'Technologies', 'list', { hint: 'one per line' }], status] },
  education: { label: 'Education', title: 'institution', sort: true, fields: [
    ['institution', 'Institution', 'text', { req: 1 }], ['degree', 'Degree', 'text'], ['field_of_study', 'Field of study', 'text'],
    ['badge_text', 'Badge (max 12 chars)', 'text'], ['start_date', 'Start date', 'date'], ['end_date', 'End date', 'date'],
    ['is_current', 'Currently studying', 'bool'], ['description', 'Description', 'area'], ['logo_url', 'Logo', 'image'], ['document_url', 'Document', 'image'], status] },
  certificates: { label: 'Certificates', title: 'name', sort: true, fields: [
    ['name', 'Name', 'text', { req: 1 }], ['issuer', 'Issuer', 'text', { req: 1 }], ['issue_date', 'Issue date', 'date'], ['expiration_date', 'Expiration date', 'date'],
    ['credential_id', 'Credential ID', 'text'], ['image_url', 'Image', 'image'], ['image_alt', 'Image alt text', 'text'], ['pdf_url', 'PDF', 'image'],
    ['verification_url', 'Verification URL', 'text'], ['description', 'Description', 'area'], ['featured', 'Featured', 'bool'], status] },
  focus_tags: { label: 'Focus tags', title: 'label', sort: true, fields: [['label', 'Label', 'text', { req: 1 }], status] },
  about_facts: { label: 'About facts', title: 'label', sort: true, fields: [['label', 'Label', 'text', { req: 1 }], ['value', 'Value', 'text', { req: 1 }], status] },
  toolbox_items: { label: 'Toolbox', title: 'name', sort: true, fields: [
    ['name', 'Name', 'text', { req: 1 }], ['role', 'Role / description', 'text'], ['link_label', 'Link label', 'text'], ['url', 'URL', 'text'],
    ['icon_key', 'Built-in icon', 'select', { options: ['github', 'supabase', 'vercel'] }], ['icon_url', 'Custom icon', 'image'], status] },
  social_links: { label: 'Social links', title: 'label', sort: true, fields: [
    ['platform', 'Platform', 'select', { options: ['github', 'linkedin', 'facebook', 'instagram', 'youtube', 'x', 'email', 'website', 'other'], req: 1 }],
    ['label', 'Label', 'text', { req: 1 }], ['handle', 'Handle / text', 'text'], ['url', 'URL', 'text', { req: 1 }], ['show_in_nav', 'Show in navbar', 'bool'], status] }
};
const SINGLE = {
  site_profile: { label: 'Profile, hero & about', fields: [
    ['full_name', 'Full name', 'text', { req: 1 }], ['professional_title', 'Professional title', 'text'], ['short_bio', 'Short bio', 'area'],
    ['email', 'Email', 'text'], ['phone', 'Phone', 'text'], ['location', 'Location', 'text'],
    ['profile_image_url', 'Profile image', 'image'], ['profile_image_alt', 'Profile image alt', 'text'], ['resume_url', 'Resume / CV file', 'image'],
    ['hero_kicker', 'Hero kicker', 'text'], ['hero_title', 'Hero title', 'text'], ['hero_subtitle', 'Hero subtitle', 'area'], ['hero_description', 'Hero description', 'area'],
    ['hero_primary_label', 'Primary button label', 'text'], ['hero_primary_url', 'Primary button URL', 'text'],
    ['hero_secondary_label', 'Secondary button label', 'text'], ['hero_secondary_url', 'Secondary button URL', 'text'],
    ['show_cv_button', 'Show CV button', 'bool'], ['cv_button_label', 'CV button label', 'text'],
    ['about_body', 'About text', 'area', { big: 1, hint: 'blank line between paragraphs' }], ['about_quote', 'About quote', 'area'], ['about_quote_attribution', 'Quote attribution', 'text'],
    ['years_of_experience', 'Years of experience', 'num'], ['show_about_stats', 'Show stats', 'bool']] },
  site_settings: { label: 'Site settings & SEO', fields: [
    ['site_name', 'Site name', 'text', { req: 1 }], ['logo_url', 'Logo', 'image'], ['favicon_url', 'Favicon', 'image'], ['contact_email', 'Contact email', 'text'],
    ['site_url', 'Site URL', 'text'], ['seo_title', 'SEO title', 'text'], ['seo_description', 'SEO description', 'area'], ['seo_keywords', 'SEO keywords', 'text'],
    ['og_image_url', 'Social share image', 'image'], ['ga_measurement_id', 'Google Analytics ID', 'text', { hint: 'G-XXXXXXXX' }],
    ['footer_text', 'Footer text', 'text'], ['maintenance_mode', 'Maintenance mode', 'bool'], ['maintenance_message', 'Maintenance message', 'area']] }
};

/* ---------- media upload ---------- */
const OK_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf'];
async function upload(file) {
  if (!OK_MIME.includes(file.type)) throw new Error('Only JPG, PNG, WebP, GIF, AVIF or PDF files are allowed.');
  if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB.');
  const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-80);
  const path = `${crypto.randomUUID()}-${safe}`;
  await api(`/storage/v1/object/media/${path}`, { method: 'POST', body: file, raw: true, headers: { 'Content-Type': file.type, 'x-upsert': 'false' } });
  const url = `${SB}/storage/v1/object/public/media/${path}`;
  await rest('media', { method: 'POST', body: { storage_path: path, url, file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size }, headers: { Prefer: 'return=minimal' } });
  return url;
}

/* ---------- form rendering ---------- */
function fieldEl(f, val, ctx) {
  const [key, label, type, o = {}] = f;
  let input, get;
  if (type === 'bool') { input = h('input', { type: 'checkbox', id: key, checked: !!val }); get = () => input.checked; }
  else if (type === 'area') { input = h('textarea', { id: key, value: val ?? '', style: o.big ? 'min-height:260px' : '' }); get = () => input.value.trim() || null; }
  else if (type === 'list') { input = h('textarea', { id: key, value: (val || []).join('\n') }); get = () => input.value.split('\n').map((s) => s.trim()).filter(Boolean); }
  else if (type === 'num') { input = h('input', { type: 'number', step: 'any', id: key, value: val ?? '' }); get = () => (input.value === '' ? null : Number(input.value)); }
  else if (type === 'date') { input = h('input', { type: 'date', id: key, value: val ?? '' }); get = () => input.value || null; }
  else if (type === 'select') {
    const opts = o.from ? [['', '— none —'], ...ctx.lookups[key].map((r) => [r.id, r[o.fromLabel]])] : [...(o.req || key === 'status' ? [] : [['', '— none —']]), ...o.options.map((x) => [x, x])];
    input = h('select', { id: key }, opts.map(([v, t]) => h('option', { value: v, selected: String(val ?? (key === 'status' ? 'draft' : '')) === String(v) }, t)));
    get = () => input.value || null;
  } else if (type === 'image') {
    input = h('input', { type: 'text', id: key, value: val ?? '', placeholder: 'https://… or upload →' });
    const pick = h('input', { type: 'file', accept: OK_MIME.join(','), hidden: true });
    const msg = h('small', {});
    const btn = h('button', { type: 'button', class: 'btn ghost sm', onclick: () => pick.click() }, 'Upload');
    pick.addEventListener('change', async () => {
      if (!pick.files[0]) return;
      btn.disabled = true; msg.textContent = 'Uploading…';
      try { input.value = await upload(pick.files[0]); msg.textContent = 'Uploaded.'; msg.className = 'ok'; } catch (e) { msg.textContent = e.message; msg.className = 'err'; }
      btn.disabled = false;
    });
    get = () => input.value.trim() || null;
    return { key, get, el: h('div', { class: 'field' }, h('label', { for: key }, label), h('div', { class: 'imgf' }, input, btn, pick), msg) };
  } else { input = h('input', { type: 'text', id: key, value: val ?? '' }); get = () => input.value.trim() || null; }
  const cb = type === 'bool';
  return { key, get, el: h('div', { class: 'field' }, cb ? h('label', {}, input, ' ', label) : [h('label', { for: key }, label), input], o.hint && h('small', {}, o.hint)) };
}
async function buildForm(fields, row, { onSave, back }) {
  const ctx = { lookups: {} };
  for (const f of fields) if (f[3] && f[3].from) ctx.lookups[f[0]] = await rest(`${f[3].from}?select=id,${f[3].fromLabel}&order=${f[3].fromLabel}`);
  const parts = fields.map((f) => fieldEl(f, row ? row[f[0]] : undefined, ctx));
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Save');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    const body = {}; parts.forEach((p) => { body[p.key] = p.get(); });
    try { await onSave(body); } catch (x) { err.textContent = x.message; btn.disabled = false; }
  } }, parts.map((p) => p.el), err, h('div', { class: 'bar' }, btn, back && h('a', { class: 'btn ghost', href: back }, 'Cancel')));
  return form;
}

/* ---------- AI admin helper ---------- */
async function aiRequest(body, retry = true) {
  const r = await fetch('/api/admin-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body)
  });
  if (r.status === 401 && retry) {
    try { await refresh(); return aiRequest(body, false); } catch { save(null); location.reload(); }
  }
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(data?.error || `AI request failed (${r.status})`);
  return data;
}
function actionLabel(action) {
  if (!action) return 'Change requested';
  const a = action.args || {};
  if (action.name === 'create_row') return `Create a ${a.table} row: ${JSON.stringify(a.fields)}`;
  if (action.name === 'update_row') return `Update ${a.table} (${a.id}): ${JSON.stringify(a.fields)}`;
  if (action.name === 'delete_row') return `Delete ${a.table} row (${a.id})`;
  if (action.name === 'update_singleton') return `Update ${a.table}: ${JSON.stringify(a.fields)}`;
  if (action.name === 'mark_message_read') return `Mark message ${a.id} as ${a.is_read ? 'read' : 'unread'}`;
  return JSON.stringify(action);
}

/* ---------- views ---------- */
const views = {
  async dashboard() {
    const d = await rpc('admin_dashboard');
    const st = (n, l, href) => h('a', { class: 'card stat', href, style: 'text-decoration:none;color:inherit' }, h('b', {}, d[n]), h('span', {}, l));
    return [h('h2', {}, 'Dashboard'), h('div', { class: 'stats' },
      st('projects', 'Projects', '#/list/projects'), st('projects_published', 'Published', '#/list/projects'), st('projects_draft', 'Drafts', '#/list/projects'),
      st('projects_featured', 'Featured', '#/list/projects'), st('skills', 'Skills', '#/list/skills'), st('certificates', 'Certificates', '#/list/certificates'),
      st('experiences', 'Experience', '#/list/experiences'), st('education', 'Education', '#/list/education'),
      st('messages_unread', 'Unread messages', '#/messages'), st('messages', 'Messages total', '#/messages')),
    h('div', { class: 'card' }, h('b', {}, 'Recent updates'), (d.recent_updates.length ? d.recent_updates : [null]).map((u) => u ? h('div', {}, `${u.kind} · ${u.label} · ${new Date(u.updated_at).toLocaleString()}`) : h('div', {}, 'Nothing yet.'))),
    h('div', { class: 'card' }, h('b', {}, 'Latest messages'), (d.recent_messages.length ? d.recent_messages : [null]).map((m) => m ? h('div', {}, `${m.is_read ? '' : '● '}${m.name}: ${m.excerpt}`) : h('div', {}, 'No messages.')))];
  },

  async list(table) {
    const cfg = R[table]; let q = '';
    const box = h('div', {});
    const search = h('input', { type: 'search', placeholder: 'Search…', style: 'max-width:240px', oninput: () => { q = search.value.toLowerCase(); draw(); } });
    let rows = await rest(`${table}?select=*&order=sort_order,created_at`);
    async function move(i, j) { const ids = rows.map((r) => r.id); ids.splice(j, 0, ids.splice(i, 1)[0]); rows.splice(j, 0, rows.splice(i, 1)[0]); await rpc('reorder_rows', { p_table: table, p_ids: ids }); draw(); }
    function draw() {
      box.replaceChildren(...(rows.length ? rows : [null]).map((r, i) => {
        if (!r) return h('div', { class: 'card' }, 'Nothing here yet.');
        if (q && !String(r[cfg.title]).toLowerCase().includes(q)) return null;
        const el = h('div', { class: 'row', draggable: !q, ondragstart: (e) => { e.dataTransfer.setData('text/plain', i); el.classList.add('drag'); }, ondragend: () => el.classList.remove('drag'), ondragover: (e) => e.preventDefault(), ondrop: (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); if (from !== i) move(from, i); } },
          h('span', { class: 'grip', 'aria-hidden': 'true' }, '⠿'), h('span', { class: 't' }, r[cfg.title] || '(untitled)'), h('span', { class: `pill ${r.status}` }, r.status),
          h('button', { class: 'btn ghost sm', disabled: i === 0 || !!q, 'aria-label': 'Move up', onclick: () => move(i, i - 1) }, '↑'),
          h('button', { class: 'btn ghost sm', disabled: i === rows.length - 1 || !!q, 'aria-label': 'Move down', onclick: () => move(i, i + 1) }, '↓'),
          h('a', { class: 'btn ghost sm', href: `#/edit/${table}/${r.id}` }, 'Edit'),
          h('button', { class: 'btn danger sm', onclick: async () => { if (!confirm(`Delete “${r[cfg.title]}”? This cannot be undone.`)) return; try { await rest(`${table}?id=eq.${r.id}`, { method: 'DELETE' }); rows = rows.filter((x) => x.id !== r.id); draw(); } catch (e) { alert(e.message); } } }, 'Delete'));
        return el;
      }));
    }
    draw();
    return [h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, cfg.label), h('div', {}, search, ' ', h('a', { class: 'btn', href: `#/edit/${table}/new` }, '+ New'))), box];
  },

  async edit(table, id) {
    const cfg = R[table]; const isNew = id === 'new';
    const row = isNew ? null : (await rest(`${table}?id=eq.${id}&select=*`))[0];
    if (!isNew && !row) return h('p', { class: 'err' }, 'Not found.');
    const form = await buildForm(cfg.fields, row, { back: `#/list/${table}`, onSave: async (body) => {
      if (isNew) {
        const top = await rest(`${table}?select=sort_order&order=sort_order.desc&limit=1`);
        body.sort_order = (top[0] ? top[0].sort_order : 0) + 10;
        await rest(table, { method: 'POST', body, headers: { Prefer: 'return=minimal' } });
      } else await rest(`${table}?id=eq.${id}`, { method: 'PATCH', body, headers: { Prefer: 'return=minimal' } });
      location.hash = `#/list/${table}`;
    } });
    if (table === 'projects' && isNew) { // auto-slug from title
      const t = form.querySelector('#title'), s = form.querySelector('#slug');
      t.addEventListener('input', () => { if (!s.dataset.touched) s.value = t.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
      s.addEventListener('input', () => { s.dataset.touched = 1; });
    }
    return [h('h2', {}, `${isNew ? 'New' : 'Edit'} · ${cfg.label}`), h('div', { class: 'card' }, form)];
  },

  async single(table) {
    const cfg = SINGLE[table]; const row = (await rest(`${table}?id=eq.1&select=*`))[0];
    const note = h('div', {});
    const form = await buildForm(cfg.fields, row, { onSave: async (body) => {
      await rest(`${table}?id=eq.1`, { method: 'PATCH', body, headers: { Prefer: 'return=minimal' } });
      note.className = 'ok'; note.textContent = 'Saved.'; form.querySelector('button[type=submit]').disabled = false;
    } });
    return [h('h2', {}, cfg.label), h('div', { class: 'card' }, form, note)];
  },

  async messages() {
    let rows = await rest('contact_messages?select=*&order=created_at.desc');
    const box = h('div', {});
    const draw = () => box.replaceChildren(...(rows.length ? rows : [null]).map((m) => !m ? h('div', { class: 'card' }, 'No messages yet.') :
      h('div', { class: `card msg ${m.is_read ? '' : 'unread'}` }, h('b', {}, m.name), ' · ', h('a', { href: `mailto:${m.email}` }, m.email), h('small', { style: 'float:right;color:var(--muted)' }, new Date(m.created_at).toLocaleString()),
        h('p', {}, m.message),
        h('button', { class: 'btn ghost sm', onclick: async () => { await rest(`contact_messages?id=eq.${m.id}`, { method: 'PATCH', body: { is_read: !m.is_read } }); m.is_read = !m.is_read; draw(); } }, m.is_read ? 'Mark unread' : 'Mark read'), ' ',
        h('button', { class: 'btn danger sm', onclick: async () => { if (!confirm('Delete this message?')) return; await rest(`contact_messages?id=eq.${m.id}`, { method: 'DELETE' }); rows = rows.filter((x) => x.id !== m.id); draw(); } }, 'Delete'))));
    draw();
    return [h('h2', {}, 'Messages'), box];
  },

  async ai() {
    let rows = [];
    const box = h('div', { class: 'ai-admin-chat' });
    const history = [];
    const status = h('div', { class: 'muted' });
    const messages = h('div', { class: 'ai-admin-messages' });
    const input = h('textarea', { rows: 3, placeholder: 'Ask about the CMS, inspect content, or request a change…' });
    const send = h('button', { class: 'btn', type: 'button' }, 'Send');
    const auto = h('input', { type: 'checkbox' });
    const settingLabel = h('label', { class: 'ai-admin-setting' }, auto, ' Allow AI to execute changes without confirmation');
    const settingNote = h('small', { class: 'muted' }, 'Off = the AI proposes changes and you must click Confirm. On = clearly requested write actions can run immediately.');
    const settingCard = h('div', { class: 'card' }, h('b', {}, 'AI action mode'), settingLabel, settingNote);

    try {
      const current = (await rest('admin_settings?id=eq.1&select=ai_auto_execute'))[0];
      auto.checked = !!current?.ai_auto_execute;
    } catch (e) { status.className = 'err'; status.textContent = e.message; }

    auto.addEventListener('change', async () => {
      auto.disabled = true;
      try {
        await rest('admin_settings?id=eq.1', { method: 'PATCH', body: { ai_auto_execute: auto.checked }, headers: { Prefer: 'return=minimal' } });
        status.className = 'ok'; status.textContent = auto.checked ? 'Auto-execute enabled.' : 'Confirmation mode enabled.';
      } catch (e) { auto.checked = !auto.checked; status.className = 'err'; status.textContent = e.message; }
      auto.disabled = false;
    });

    function add(role, text) {
      const card = h('div', { class: `ai-admin-message ${role}` }, h('b', {}, role === 'user' ? 'You' : 'AI'), h('p', {}, text));
      messages.appendChild(card); messages.scrollTop = messages.scrollHeight; return card;
    }
    function addProposal(action) {
      if (!action) return;
      const card = h('div', { class: 'card ai-proposal' }, h('b', {}, 'Proposed change'), h('pre', {}, actionLabel(action)));
      const controls = h('div', { class: 'bar' });
      const confirmBtn = h('button', { class: 'btn', type: 'button' }, 'Confirm & apply');
      const cancelBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Dismiss');
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true; cancelBtn.disabled = true; status.className = ''; status.textContent = 'Applying…';
        try {
          const data = await aiRequest({ confirmedAction: action });
          add('model', 'Done — the confirmed change was applied.');
          status.className = 'ok'; status.textContent = 'Change applied successfully.';
          card.remove();
        } catch (e) { status.className = 'err'; status.textContent = e.message; confirmBtn.disabled = false; cancelBtn.disabled = false; }
      });
      cancelBtn.addEventListener('click', () => card.remove());
      controls.append(confirmBtn, cancelBtn); card.appendChild(controls); messages.appendChild(card); messages.scrollTop = messages.scrollHeight;
    }

    async function ask() {
      const text = input.value.trim(); if (!text || send.disabled) return;
      input.value = ''; send.disabled = true; input.disabled = true; status.className = ''; status.textContent = 'Thinking…';
      add('user', text); history.push({ role: 'user', text });
      try {
        const data = await aiRequest({ message: text, history: history.slice(-12) });
        add('model', data.reply || 'No response.');
        history.push({ role: 'model', text: data.reply || '' });
        if (data.proposedAction) addProposal(data.proposedAction);
        if (data.appliedActions?.length) status.textContent = `${data.appliedActions.length} action(s) applied.`;
        else status.textContent = data.autoExecute ? 'Auto-execute is enabled.' : 'Confirmation mode is enabled.';
      } catch (e) { add('model', `Error: ${e.message}`); status.className = 'err'; status.textContent = 'Request failed.'; }
      finally { send.disabled = false; input.disabled = false; input.focus(); }
    }
    send.addEventListener('click', ask);
    input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') ask(); });
    add('model', 'I can inspect your CMS data and help manage it. In confirmation mode, I will show a proposed change before anything is written.');
    return [h('div', { class: 'bar' }, h('div', {}, h('h2', { style: 'margin:0' }, 'AI helper'), h('small', { class: 'muted' }, 'Private admin assistant')), status), settingCard, h('div', { class: 'card' }, messages, h('div', { class: 'ai-admin-composer' }, input, send))];
  },

  async media() {
    let rows = await rest('media?select=*&order=created_at.desc');
    const box = h('div', { class: 'grid' }); const msg = h('div', {});
    const pick = h('input', { type: 'file', accept: OK_MIME.join(','), hidden: true, onchange: async () => { msg.className = ''; msg.textContent = 'Uploading…'; try { await upload(pick.files[0]); route(); } catch (e) { msg.className = 'err'; msg.textContent = e.message; } } });
    box.replaceChildren(...rows.map((m) => h('div', { class: 'card', style: 'padding:8px' },
      m.kind === 'image' ? h('img', { src: m.url, alt: m.alt_text || m.file_name, loading: 'lazy' }) : h('div', { style: 'height:110px;display:grid;place-items:center' }, 'PDF'),
      h('small', { style: 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, m.file_name),
      h('button', { class: 'btn ghost sm', onclick: () => navigator.clipboard.writeText(m.url.startsWith('/') ? location.origin + m.url : m.url) }, 'Copy URL'), ' ',
      m.storage_path && h('button', { class: 'btn danger sm', onclick: async () => { if (!confirm('Delete this file?')) return; try { await api(`/storage/v1/object/media/${m.storage_path}`, { method: 'DELETE' }); await rest(`media?id=eq.${m.id}`, { method: 'DELETE' }); route(); } catch (e) { alert(e.message); } } }, 'Delete'))));
    return [h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Media library'), h('button', { class: 'btn', onclick: () => pick.click() }, '+ Upload'), pick), msg, box];
  }
};

/* ---------- shell + router ---------- */
function nav(active) {
  const link = (href, t) => h('a', { href, class: active === href ? 'on' : '' }, t);
  return h('nav', { class: 'side' }, h('h1', {}, 'Admin'), link('#/dashboard', 'Dashboard'), link('#/messages', 'Messages'), link('#/ai', 'AI helper'), h('hr'),
    link('#/single/site_profile', 'Profile & About'), link('#/single/site_settings', 'Settings & SEO'), h('hr'),
    Object.entries(R).map(([k, v]) => link(`#/list/${k}`, v.label)), h('hr'), link('#/media', 'Media library'),
    h('a', { href: '../', target: '_blank', rel: 'noopener' }, 'View site ↗'),
    h('a', { href: '#', onclick: async (e) => { e.preventDefault(); try { await api('/auth/v1/logout', { method: 'POST' }); } catch {} save(null); location.hash = ''; location.reload(); } }, 'Sign out'));
}
async function route() {
  if (!session) return login();
  const [, view = 'dashboard', a, b] = location.hash.split('/');
  const active = view === 'list' || view === 'edit' ? `#/list/${a}` : view === 'single' ? `#/single/${a}` : `#/${view}`;
  const main = h('main', { class: 'main' }, 'Loading…');
  $app.replaceChildren(h('div', { class: 'shell' }, nav(active), main));
  try {
    if (!(await rpc('is_admin'))) { save(null); return login('This account is not an admin.'); }
    if (!views[view] || ((view === 'list' || view === 'edit') && !R[a]) || (view === 'single' && !SINGLE[a])) return main.replaceChildren(h('p', { class: 'err' }, 'Page not found.'));
    main.replaceChildren(...[await views[view](a, b)].flat());
  } catch (e) { main.replaceChildren(h('p', { class: 'err', role: 'alert' }, e.message)); }
}
function login(msg) {
  const err = h('div', { class: 'err', role: 'alert' }, msg || '');
  const email = h('input', { type: 'email', id: 'em', autocomplete: 'username', required: true });
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
  $app.replaceChildren(h('form', { class: 'login card', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try { save(await auth('token?grant_type=password', { email: email.value.trim(), password: pw.value })); route(); }
    catch (x) { err.textContent = x.message; btn.disabled = false; }
  } }, h('h2', {}, 'Admin sign in'), h('div', { class: 'field' }, h('label', { for: 'em' }, 'Email'), email), h('div', { class: 'field' }, h('label', { for: 'pw' }, 'Password'), pw), err, btn));
}
addEventListener('hashchange', route);
route();

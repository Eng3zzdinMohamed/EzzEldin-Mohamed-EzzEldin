document.getElementById('year').textContent = new Date().getFullYear();

// mobile nav toggle
var toggle = document.getElementById('navtoggle');
var links = document.getElementById('navlinks');
toggle.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});
links.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    });
});


// ---- content from Supabase (HTML above stays as the fallback if this fails) ----
function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function $(id) { return document.getElementById(id); }
function setText(id, v) { var n = $(id); if (n && v) n.textContent = v; }
function fmt(d) { return d ? new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short' }) : ''; }
function range(a, b, cur) { var s = fmt(a), e = cur ? 'Present' : fmt(b); return s && e ? s + ' – ' + e : s || e; }
function fill(id, items, build) {
    var box = $(id); if (!box || !items) return;
    var section = box.closest('section');
    if (!items.length) { if (section && section.hidden === false && !section.dataset.static) { /* keep static fallback */ } return; }
    box.replaceChildren.apply(box, items.map(build));
    if (section) section.hidden = false;
}
function link(href, label, cls) { var a = el('a', cls, label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; }

function render(d) {
    var p = d.profile || {}, s = d.settings || {};
    setText('heroKicker', p.hero_kicker); setText('heroName', p.hero_title || p.full_name);
    setText('heroRole', p.hero_subtitle); setText('heroLede', p.hero_description);
    if (p.profile_image_url && $('heroImg')) { $('heroImg').src = p.profile_image_url; if (p.profile_image_alt) $('heroImg').alt = p.profile_image_alt; }
    [['heroPrimary', p.hero_primary_label, p.hero_primary_url], ['heroSecondary', p.hero_secondary_label, p.hero_secondary_url]].forEach(function (b) {
        var a = $(b[0]); if (!a || !b[1] || !b[2]) return;
        a.textContent = b[1]; a.href = b[2]; if (/^https?:/.test(b[2])) { a.target = '_blank'; a.rel = 'noopener'; } else { a.removeAttribute('target'); }
    });
    if (p.show_cv_button && p.resume_url && $('heroPrimary')) { var cv = link(p.resume_url, p.cv_button_label || 'Download CV', 'btn btn-ghost'); $('heroSecondary').after(cv); }
    if (p.about_body && $('aboutBody')) $('aboutBody').replaceChildren.apply($('aboutBody'), p.about_body.split(/\n\s*\n/).map(function (t) { return el('p', null, t); }));
    if (p.about_quote && $('aboutQuote')) { var q = $('aboutQuote'); q.replaceChildren(document.createTextNode(p.about_quote)); if (p.about_quote_attribution) q.append(el('footer', null, p.about_quote_attribution)); }
    fill('factList', d.facts, function (f) { var li = el('li'); li.append(el('span', null, f.label), el('span', null, f.value)); return li; });
    fill('tagFlow', d.focus, function (t) { return el('li', null, t.label); });

    // toolbox: reuse the built-in SVG icons already in the page
    var icons = {}; document.querySelectorAll('#toolRows [data-icon]').forEach(function (a) { icons[a.dataset.icon] = a.querySelector('.tool-icon').innerHTML; });
    if (d.toolbox && d.toolbox.length) fill('toolRows', d.toolbox, function (t) {
        var a = el(t.url ? 'a' : 'div', 'tool-row'); if (t.url) { a.href = t.url; a.target = '_blank'; a.rel = 'noopener'; }
        var ic = el('span', 'tool-icon');
        if (t.icon_url) { var im = el('img'); im.src = t.icon_url; im.alt = ''; ic.append(im); } else if (icons[t.icon_key]) ic.innerHTML = icons[t.icon_key];
        var box = el('span'); box.append(el('div', 'tool-name', t.name), el('div', 'tool-role', t.role || ''));
        a.append(ic, box); if (t.link_label) a.append(el('span', 'tool-go', t.link_label)); return a;
    });

    fill('eduList', d.education, function (e) {
        var c = el('div', 'edu-card'); c.append(el('div', 'edu-badge', e.badge_text || ''));
        var b = el('div'); b.append(el('h3', null, e.institution));
        var sub = [e.degree, e.field_of_study, range(e.start_date, e.end_date, e.is_current)].filter(Boolean).join(' — ');
        if (sub) b.append(el('p', null, sub)); if (e.description) b.append(el('p', null, e.description));
        if (e.is_current) b.append(el('span', 'edu-status', 'Currently studying')); c.append(b); return c;
    });

    fill('projectList', d.projects, function (x) {
        var c = el('article', 'cms-card');
        if (x.main_image_url) { var im = el('img'); im.src = x.main_image_url; im.alt = x.main_image_alt || x.title; im.loading = 'lazy'; c.append(im); }
        c.append(el('h3', null, x.title)); if (x.short_description) c.append(el('p', null, x.short_description));
        if (x.technologies && x.technologies.length) { var ul = el('ul', 'tag-flow'); x.technologies.forEach(function (t) { ul.append(el('li', null, t)); }); c.append(ul); }
        var row = el('div', 'cms-links'); if (x.live_url) row.append(link(x.live_url, 'Live site')); if (x.github_url) row.append(link(x.github_url, 'Code')); c.append(row); return c;
    });
    if (d.skills && d.skills.length) {
        var groups = {}, order = [];
        (d.skill_categories || []).forEach(function (c) { groups[c.id] = { name: c.name, items: [] }; order.push(c.id); });
        d.skills.forEach(function (k) { var g = k.category_id && groups[k.category_id] ? k.category_id : 'x'; if (!groups[g]) { groups[g] = { name: 'Other', items: [] }; order.push(g); } groups[g].items.push(k); });
        fill('skillList', order.filter(function (i) { return groups[i].items.length; }), function (i) {
            var g = groups[i], w = el('div', 'cms-group'); w.append(el('h3', null, g.name));
            var ul = el('ul', 'tag-flow'); g.items.forEach(function (k) { ul.append(el('li', null, (k.icon && !/^(https?:|\/)/.test(k.icon) ? k.icon + ' ' : '') + k.name + (k.level != null ? ' · ' + k.level + '%' : ''))); });
            w.append(ul); return w;
        });
    }
    fill('expList', d.experiences, function (x) {
        var c = el('div', 'cms-card'); c.append(el('h3', null, x.position + ' · ' + x.company), el('p', 'cms-meta', range(x.start_date, x.end_date, x.is_current)));
        if (x.description) c.append(el('p', null, x.description));
        if (x.responsibilities && x.responsibilities.length) { var ul = el('ul'); x.responsibilities.forEach(function (r) { ul.append(el('li', null, r)); }); c.append(ul); }
        return c;
    });
    fill('certList', d.certificates, function (x) {
        var c = el('article', 'cms-card');
        if (x.image_url) { var im = el('img'); im.src = x.image_url; im.alt = x.image_alt || x.name; im.loading = 'lazy'; c.append(im); }
        c.append(el('h3', null, x.name), el('p', 'cms-meta', x.issuer + (x.issue_date ? ' · ' + fmt(x.issue_date) : '')));
        var row = el('div', 'cms-links'); if (x.verification_url) row.append(link(x.verification_url, 'Verify')); if (x.pdf_url) row.append(link(x.pdf_url, 'PDF')); c.append(row); return c;
    });

    (d.social || []).filter(function (x) { return x.platform === 'github'; }).slice(0, 1).forEach(function (x) {
        document.querySelectorAll('[data-social="github"]').forEach(function (a) { a.href = x.url; });
    });
    if (s.seo_title) document.title = s.seo_title;
    var md = document.querySelector('meta[name="description"]'); if (md && s.seo_description) md.content = s.seo_description;
    setText('footerText', s.footer_text ? 'Ezz-Eldin Mohamed. ' + s.footer_text : null);
}
// nav links to sections that are now visible
function syncNav() {
    var nav = $('navlinks'); if (!nav) return;
    [['projects', 'Projects'], ['skills', 'Skills'], ['experience', 'Experience'], ['certificates', 'Certificates']].forEach(function (x) {
        var sec = $(x[0]); if (sec && !sec.hidden && !nav.querySelector('a[href="#' + x[0] + '"]')) { var a = el('a', null, x[1]); a.href = '#' + x[0]; nav.insertBefore(a, nav.querySelector('a[href="#contact"]')); }
    });
}
// SUPABASE_URL / SUPABASE_KEY are declared below (var hoisting makes them available once this runs async)
fetch('https://rvebcxwginxwwuyvalcg.supabase.co/rest/v1/rpc/get_portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': 'sb_publishable_HXUhmwrZDAk7sLlVodf_Pw_ZtD8mAgB', 'Authorization': 'Bearer sb_publishable_HXUhmwrZDAk7sLlVodf_Pw_ZtD8mAgB' },
    body: '{}'
}).then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
  .then(function (d) { render(d); syncNav(); })
  .catch(function () { /* static HTML stays as is */ });

// contact form -> Supabase
var SUPABASE_URL = 'https://rvebcxwginxwwuyvalcg.supabase.co';
var SUPABASE_KEY = 'sb_publishable_HXUhmwrZDAk7sLlVodf_Pw_ZtD8mAgB';

var form = document.getElementById('contactForm');
var status = document.getElementById('formStatus');
var btn = document.getElementById('submitBtn');

form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('name').value.trim();
    var email = document.getElementById('email').value.trim();
    var message = document.getElementById('message').value.trim();

    if (!name || !email || !message) {
        status.textContent = 'Fill in every field before sending.';
        status.dataset.state = 'error';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    status.textContent = '';
    status.dataset.state = '';

    fetch(SUPABASE_URL + '/rest/v1/contact_messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ name: name, email: email, message: message })
    }).then(function (res) {
        if (!res.ok) { throw new Error('request failed'); }
        status.textContent = 'Sent — thanks, I\'ll get back to you soon.';
        status.dataset.state = 'ok';
        form.reset();
    }).catch(function () {
        status.textContent = "That didn't go through. Try again in a moment.";
        status.dataset.state = 'error';
    }).finally(function () {
        btn.disabled = false;
        btn.textContent = 'Send message';
    });
});
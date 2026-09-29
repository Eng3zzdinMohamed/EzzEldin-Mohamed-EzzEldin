(function () {
  'use strict';
  var launcher = document.getElementById('aiChatLauncher');
  var panel = document.getElementById('aiChatPanel');
  var close = document.getElementById('aiChatClose');
  var messages = document.getElementById('aiChatMessages');
  var form = document.getElementById('aiChatForm');
  var input = document.getElementById('aiChatInput');
  var send = document.getElementById('aiChatSend');
  if (!launcher || !panel || !messages || !form || !input) return;

  var history = [];
  var opened = false;

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function scrollBottom() { messages.scrollTop = messages.scrollHeight; }
  function addBubble(text, role, extra) {
    var wrap = node('div', 'ai-chat-bubble ' + role, text);
    messages.appendChild(wrap);
    if (extra) messages.appendChild(extra);
    scrollBottom();
    return wrap;
  }
  function openChat() {
    opened = true; panel.hidden = false; launcher.setAttribute('aria-expanded', 'true');
    if (!messages.children.length) addBubble('Hi! Ask me anything about Ezz-Eldin, his projects, skills, or how to contact him.', 'model');
    input.focus();
  }
  function closeChat() { opened = false; panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); }
  launcher.addEventListener('click', function () { opened ? closeChat() : openChat(); });
  close.addEventListener('click', closeChat);

  function addProfile(profile) {
    if (!profile || !profile.profile_image_url) return;
    var card = node('div', 'ai-widget ai-profile-card');
    var img = node('img'); img.src = profile.profile_image_url; img.alt = profile.profile_image_alt || profile.full_name || 'Ezz-Eldin';
    var copy = node('div'); copy.append(node('strong', null, profile.full_name || 'Ezz-Eldin'), node('small', null, profile.professional_title || profile.short_bio || ''));
    card.append(img, copy); messages.appendChild(card);
  }

  function addContacts(data) {
    var card = node('div', 'ai-widget');
    var title = node('strong', null, 'Contact Ezz-Eldin'); card.append(title);
    var row = node('div', 'ai-contact-buttons');
    var p = data.profile || {};
    if (p.email) { var a = node('a', null, '✉ Email'); a.href = 'mailto:' + p.email; row.appendChild(a); }
    if (p.phone) { var t = node('a', null, '☎ Phone'); t.href = 'tel:' + p.phone; row.appendChild(t); }
    (data.social || []).forEach(function (s) {
      if (!s || !s.url) return;
      var a = node('a', null, s.label || s.platform || 'Link'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; row.appendChild(a);
    });
    if (!row.children.length) row.append(node('small', null, 'No public contact methods are listed right now.'));
    card.appendChild(row); messages.appendChild(card);
  }

  function addGallery(projects) {
    projects.forEach(function (project) {
      var images = [];
      if (project.main_image_url) images.push(project.main_image_url);
      (Array.isArray(project.gallery) ? project.gallery : []).forEach(function (u) { if (u && images.indexOf(u) === -1) images.push(u); });
      if (!images.length) return;
      var card = node('div', 'ai-widget');
      var title = node('div', 'ai-gallery-title'); title.append(node('strong', null, project.title || 'Project'));
      if (project.live_url) { var live = node('a', null, 'Open'); live.href = project.live_url; live.target = '_blank'; live.rel = 'noopener'; title.appendChild(live); }
      card.appendChild(title);
      var viewport = node('div', 'ai-gallery-viewport');
      var img = node('img', 'ai-gallery-image'); img.alt = project.title || 'Project image'; viewport.appendChild(img); card.appendChild(viewport);
      var controls = node('div', 'ai-gallery-controls');
      var prev = node('button', null, '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous image');
      var count = node('span', 'ai-gallery-counter'); var next = node('button', null, '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next image');
      controls.append(prev, count, next); card.appendChild(controls); messages.appendChild(card);
      var index = 0;
      function render() { img.src = images[index]; count.textContent = (index + 1) + ' / ' + images.length; prev.disabled = images.length < 2; next.disabled = images.length < 2; }
      prev.addEventListener('click', function () { index = (index - 1 + images.length) % images.length; render(); });
      next.addEventListener('click', function () { index = (index + 1) % images.length; render(); });
      render();
    });
  }

  function renderWidgets(widgets) {
    (widgets || []).forEach(function (w) {
      if (!w) return;
      if (w.type === 'profile_card') addProfile(w.profile);
      if (w.type === 'contact_buttons') addContacts(w);
      if (w.type === 'project_gallery') addGallery(w.projects || []);
    });
    scrollBottom();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;
    addBubble(text, 'user');
    history.push({ role: 'user', text: text });
    input.value = ''; send.disabled = true; input.disabled = true;
    var typing = addBubble('Thinking…', 'model ai-chat-typing');
    try {
      var r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: history.slice(-10) }) });
      var data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      typing.remove();
      addBubble(data.reply || 'I do not have an answer for that yet.', 'model');
      history.push({ role: 'model', text: data.reply || '' });
      renderWidgets(data.widgets);
    } catch (err) {
      typing.textContent = err.message || 'The assistant is temporarily unavailable. Please try again.';
      typing.classList.add('error');
    } finally { send.disabled = false; input.disabled = false; input.focus(); }
  });
}());

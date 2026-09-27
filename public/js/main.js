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
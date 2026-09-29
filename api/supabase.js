// Server-side Supabase helpers for Vercel functions.
// Uses the SAME publishable/anon key the client already uses (no service-role key
// needed anywhere here) — RLS in the database is what actually enforces access.
// Admin-only calls are made with the caller's own JWT, forwarded from the browser,
// so `is_admin()` and the "Admin full access" RLS policies apply exactly as they
// do in public/admin/admin.js.

export const SUPABASE_URL = 'https://rvebcxwginxwwuyvalcg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_HXUhmwrZDAk7sLlVodf_Pw_ZtD8mAgB';

/**
 * Call a Postgres RPC function.
 * @param {string} fn function name
 * @param {object} args arguments object
 * @param {string} [accessToken] a user's access token; omit for anon-level calls
 */
export async function callRpc(fn, args = {}, accessToken) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const msg = (data && (data.message || data.error_description || data.error)) || `RPC ${fn} failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Low-level PostgREST call (table access), always as a given user's identity
 * (or anon). Used only by the admin API for whitelisted write actions —
 * RLS + is_admin() still fully applies.
 */
export async function rest(path, { method = 'GET', body, headers = {} } = {}, accessToken) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Verify a bearer token belongs to a real, confirmed Supabase user, and that
 * the user is listed in public.admins (via the existing is_admin() RPC).
 * Throws on any failure. Returns { userId, email }.
 */
export async function requireAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    const err = new Error('Missing Authorization header');
    err.statusCode = 401;
    throw err;
  }
  // Resolve the user from their token (also confirms the token is valid/unexpired).
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const err = new Error('Invalid or expired session');
    err.statusCode = 401;
    throw err;
  }
  const user = await r.json();

  const isAdmin = await callRpc('is_admin', {}, token);
  if (!isAdmin) {
    const err = new Error('This account is not an admin');
    err.statusCode = 403;
    throw err;
  }
  return { userId: user.id, email: user.email, accessToken: token };
}

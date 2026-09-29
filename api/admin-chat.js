// Admin-only AI helper API.
// The caller must have a valid Supabase admin session. Writes are either
// proposed for confirmation or executed immediately according to admin_settings.

import { requireAdmin, rest, callRpc } from './supabase.js';
import { generateContent, textFromCandidate, functionCallsFromCandidate } from './gemini.js';

export const config = { runtime: 'nodejs' };

const WRITABLE_FIELDS = {
  projects: ['title','slug','short_description','full_description','main_image_url','main_image_alt','gallery','technologies','category','github_url','live_url','project_date','project_status','featured','seo_title','seo_description','status','sort_order'],
  skills: ['name','category_id','icon','level','years_experience','description','status','sort_order'],
  skill_categories: ['name','description','status','sort_order'],
  experiences: ['position','company','logo_url','start_date','end_date','is_current','description','responsibilities','technologies','status','sort_order'],
  education: ['institution','degree','field_of_study','badge_text','start_date','end_date','is_current','description','logo_url','document_url','status','sort_order'],
  certificates: ['name','issuer','issue_date','expiration_date','credential_id','image_url','image_alt','pdf_url','verification_url','description','featured','status','sort_order'],
  focus_tags: ['label','status','sort_order'],
  about_facts: ['label','value','status','sort_order'],
  toolbox_items: ['name','role','link_label','url','icon_key','icon_url','status','sort_order'],
  social_links: ['platform','label','handle','url','show_in_nav','status','sort_order'],
};
const TITLE_COLUMNS = {
  projects: 'title', skills: 'name', skill_categories: 'name', experiences: 'position', education: 'institution',
  certificates: 'name', focus_tags: 'label', about_facts: 'label', toolbox_items: 'name', social_links: 'label',
};
const SINGLE_TABLES = ['site_profile', 'site_settings'];
const SINGLE_FIELDS = {
  site_profile: ['full_name','professional_title','short_bio','email','phone','location','profile_image_url','profile_image_alt','resume_url','hero_kicker','hero_title','hero_subtitle','hero_description','hero_primary_label','hero_primary_url','hero_secondary_label','hero_secondary_url','show_cv_button','cv_button_label','about_body','about_quote','about_quote_attribution','years_of_experience','show_about_stats'],
  site_settings: ['site_name','logo_url','favicon_url','contact_email','site_url','seo_title','seo_description','seo_keywords','og_image_url','ga_measurement_id','footer_text','maintenance_mode','maintenance_message'],
};
const ID_RE = /^[0-9a-f-]{36}$/i;

function cleanFields(table, fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields must be an object');
  const allowed = WRITABLE_FIELDS[table] || SINGLE_FIELDS[table];
  if (!allowed) throw new Error('Unknown table');
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key)) throw new Error(`Field "${key}" cannot be changed by the AI helper.`);
    out[key] = value;
  }
  if (!Object.keys(out).length) throw new Error('No fields were supplied.');
  return out;
}

const READ_TOOLS = [
  { name: 'get_dashboard', description: 'Get admin dashboard statistics and recent activity.', parameters: { type: 'object', properties: {} } },
  { name: 'list_rows', description: 'List rows from a content table, including drafts.', parameters: { type: 'object', properties: { table: { type: 'string', enum: Object.keys(WRITABLE_FIELDS) }, search: { type: 'string' }, limit: { type: 'integer' } }, required: ['table'] } },
  { name: 'get_row', description: 'Get one row by UUID from a content table.', parameters: { type: 'object', properties: { table: { type: 'string', enum: Object.keys(WRITABLE_FIELDS) }, id: { type: 'string' } }, required: ['table','id'] } },
  { name: 'list_messages', description: 'List contact messages, including read status.', parameters: { type: 'object', properties: { unread_only: { type: 'boolean' } } } },
];
const WRITE_TOOLS = [
  { name: 'create_row', description: 'Create a row in a content table. Use draft status unless the admin explicitly requests another status.', parameters: { type: 'object', properties: { table: { type: 'string', enum: Object.keys(WRITABLE_FIELDS) }, fields: { type: 'object' } }, required: ['table','fields'] } },
  { name: 'update_row', description: 'Update selected fields of an existing content row by UUID.', parameters: { type: 'object', properties: { table: { type: 'string', enum: Object.keys(WRITABLE_FIELDS) }, id: { type: 'string' }, fields: { type: 'object' } }, required: ['table','id','fields'] } },
  { name: 'delete_row', description: 'Delete an existing content row by UUID. Only use when the admin clearly requests deletion.', parameters: { type: 'object', properties: { table: { type: 'string', enum: Object.keys(WRITABLE_FIELDS) }, id: { type: 'string' } }, required: ['table','id'] } },
  { name: 'update_singleton', description: 'Update site_profile or site_settings fields.', parameters: { type: 'object', properties: { table: { type: 'string', enum: SINGLE_TABLES }, fields: { type: 'object' } }, required: ['table','fields'] } },
  { name: 'mark_message_read', description: 'Mark a contact message read or unread.', parameters: { type: 'object', properties: { id: { type: 'string' }, is_read: { type: 'boolean' } }, required: ['id','is_read'] } },
];

const SYSTEM = (auto) => `You are the private admin AI helper for Ezz-Eldin's portfolio CMS.
You can inspect the admin-visible database, including drafts, and can make database changes through the supplied tools.
Never invent IDs. Read the relevant row first when an ID is not already known.
Never expose secrets, access tokens, or environment variables.
${auto ? 'Auto-execute is enabled: when the admin clearly requests a write, you may execute it and then summarize exactly what changed.' : 'Confirmation mode is enabled: do not execute writes. Describe the exact proposed change and wait for the UI confirmation.'}
Be concise and precise. If a requested action is ambiguous or unsafe, ask for clarification instead of guessing.`;

async function callReadTool(name, args) {
  switch (name) {
    case 'get_dashboard': return callRpc('admin_dashboard', {}, args.accessToken);
    case 'list_rows': {
      const table = args.table;
      if (!WRITABLE_FIELDS[table]) throw new Error('Unknown table');
      const limit = Math.max(1, Math.min(Number(args.limit) || 20, 50));
      let q = `${table}?select=*&order=sort_order.asc,created_at.asc&limit=${limit}`;
      if (args.search) q += `&${TITLE_COLUMNS[table]}=ilike.*${encodeURIComponent(String(args.search).slice(0, 100))}*`;
      return rest(q, {}, args.accessToken);
    }
    case 'get_row':
      if (!WRITABLE_FIELDS[args.table] || !ID_RE.test(String(args.id || ''))) throw new Error('Invalid table or row id');
      return rest(`${args.table}?id=eq.${args.id}&select=*`, {}, args.accessToken);
    case 'list_messages': {
      let q = 'contact_messages?select=id,name,email,message,is_read,created_at&order=created_at.desc&limit=20';
      if (args.unread_only) q += '&is_read=eq.false';
      return rest(q, {}, args.accessToken);
    }
    default: throw new Error(`Unknown read tool: ${name}`);
  }
}

async function applyWriteTool(name, args, admin) {
  const log = async (action, targetTable, targetId, payload, result, errorMessage = null) => {
    try {
      await rest('ai_action_log', { method: 'POST', body: { admin_email: admin.email, action, target_table: targetTable || null, target_id: targetId || null, payload: payload || null, result, error_message: errorMessage }, headers: { Prefer: 'return=minimal' } }, admin.accessToken);
    } catch (e) { console.error('AI action log failed:', e.message); }
  };

  try {
    let result;
    if (name === 'create_row') {
      if (!WRITABLE_FIELDS[args.table]) throw new Error('Unknown table');
      const fields = cleanFields(args.table, args.fields);
      if (!('status' in fields)) fields.status = 'draft';
      const top = await rest(`${args.table}?select=sort_order&order=sort_order.desc&limit=1`, {}, admin.accessToken);
      if (!('sort_order' in fields)) fields.sort_order = (top[0]?.sort_order || 0) + 10;
      result = await rest(args.table, { method: 'POST', body: fields, headers: { Prefer: 'return=representation' } }, admin.accessToken);
      await log('create_row', args.table, result?.[0]?.id, fields, 'applied');
    } else if (name === 'update_row') {
      if (!WRITABLE_FIELDS[args.table] || !ID_RE.test(String(args.id || ''))) throw new Error('Invalid table or row id');
      const fields = cleanFields(args.table, args.fields);
      result = await rest(`${args.table}?id=eq.${args.id}`, { method: 'PATCH', body: fields, headers: { Prefer: 'return=representation' } }, admin.accessToken);
      await log('update_row', args.table, args.id, fields, 'applied');
    } else if (name === 'delete_row') {
      if (!WRITABLE_FIELDS[args.table] || !ID_RE.test(String(args.id || ''))) throw new Error('Invalid table or row id');
      result = await rest(`${args.table}?id=eq.${args.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, admin.accessToken);
      await log('delete_row', args.table, args.id, null, 'applied');
      result = { deleted: true };
    } else if (name === 'update_singleton') {
      if (!SINGLE_TABLES.includes(args.table)) throw new Error('Unknown singleton table');
      const fields = cleanFields(args.table, args.fields);
      result = await rest(`${args.table}?id=eq.1`, { method: 'PATCH', body: fields, headers: { Prefer: 'return=representation' } }, admin.accessToken);
      await log('update_singleton', args.table, null, fields, 'applied');
    } else if (name === 'mark_message_read') {
      if (!ID_RE.test(String(args.id || '')) || typeof args.is_read !== 'boolean') throw new Error('Invalid message id or read state');
      result = await rest(`contact_messages?id=eq.${args.id}`, { method: 'PATCH', body: { is_read: args.is_read }, headers: { Prefer: 'return=representation' } }, admin.accessToken);
      await log('mark_message_read', 'contact_messages', args.id, { is_read: args.is_read }, 'applied');
    } else throw new Error(`Unknown write tool: ${name}`);
    return result;
  } catch (e) {
    await log(name, args?.table || 'contact_messages', args?.id || null, args?.fields || null, 'failed', e.message);
    throw e;
  }
}

async function makeProposal(message, history, admin) {
  const contents = [];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-10)) {
      if (turn && typeof turn.text === 'string') contents.push({ role: turn.role === 'model' ? 'model' : 'user', parts: [{ text: turn.text.slice(0, 4000) }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: message }] });
  let candidate = await generateContent({
    contents,
    systemInstruction: 'Determine whether the admin request requires a database write. If it does, use read tools as needed to identify the exact target, then make exactly one write tool call as a PROPOSAL. Never execute a write in this turn. If no write is requested, return no tool call.',
    tools: [...READ_TOOLS, ...WRITE_TOOLS],
  });
  let proposal = null;
  for (let round = 0; round < 4 && !proposal; round++) {
    const calls = functionCallsFromCandidate(candidate);
    if (!calls.length) break;
    contents.push(candidate.content);
    const responseParts = [];
    for (const call of calls) {
      if (WRITE_TOOLS.some((t) => t.name === call.name)) {
        proposal = { name: call.name, args: call.args || {} };
        responseParts.push({ functionResponse: { id: call.id, name: call.name, response: { result: { proposed: true } } } });
      } else {
        let result;
        try { result = await callReadTool(call.name, { ...(call.args || {}), accessToken: admin.accessToken }); }
        catch (e) { result = { error: e.message }; }
        responseParts.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
      }
    }
    if (!proposal) {
      contents.push({ role: 'user', parts: responseParts });
      candidate = await generateContent({ contents, systemInstruction: 'Use the read results to identify the exact requested change. If a write is clearly requested, call exactly one matching write tool as a proposal; never execute it.', tools: [...READ_TOOLS, ...WRITE_TOOLS] });
    }
  }
  if (proposal) {
    // Validate before showing a confirmation button. This never writes anything.
    if (['create_row','update_row'].includes(proposal.name)) proposal.args.fields = cleanFields(proposal.args.table, proposal.args.fields);
    if (proposal.name === 'update_singleton') proposal.args.fields = cleanFields(proposal.args.table, proposal.args.fields);
    if (['update_row','delete_row'].includes(proposal.name) && !ID_RE.test(String(proposal.args.id || ''))) throw new Error('The AI could not identify a valid row ID.');
    if (proposal.name === 'mark_message_read' && (!ID_RE.test(String(proposal.args.id || '')) || typeof proposal.args.is_read !== 'boolean')) throw new Error('The AI could not identify a valid message or read state.');
  }
  return proposal;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let admin;
  try { admin = await requireAdmin(req); }
  catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }

  try {
    const { message, history, confirmedAction } = req.body || {};
    if (confirmedAction?.name) {
      if (!WRITE_TOOLS.some((t) => t.name === confirmedAction.name)) return res.status(400).json({ error: 'Invalid action.' });
      const result = await applyWriteTool(confirmedAction.name, confirmedAction.args || {}, admin);
      return res.status(200).json({ applied: true, result, action: confirmedAction });
    }
    if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'A message is required.' });
    if (message.length > 4000) return res.status(400).json({ error: 'Message is too long.' });

    const settings = (await rest('admin_settings?id=eq.1&select=ai_auto_execute', {}, admin.accessToken))[0];
    const autoExecute = !!settings?.ai_auto_execute;
    const tools = autoExecute ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
    const contents = [];
    if (Array.isArray(history)) for (const turn of history.slice(-12)) {
      if (turn && typeof turn.text === 'string') contents.push({ role: turn.role === 'model' ? 'model' : 'user', parts: [{ text: turn.text.slice(0, 4000) }] });
    }
    contents.push({ role: 'user', parts: [{ text: message.trim() }] });

    let candidate = await generateContent({ contents, systemInstruction: SYSTEM(autoExecute), tools });
    const appliedActions = [];
    for (let round = 0; round < 4; round++) {
      const calls = functionCallsFromCandidate(candidate);
      if (!calls.length) break;
      contents.push(candidate.content);
      const responseParts = [];
      for (const call of calls) {
        let result;
        try {
          if (WRITE_TOOLS.some((t) => t.name === call.name) && autoExecute) {
            result = await applyWriteTool(call.name, call.args || {}, admin);
            appliedActions.push({ name: call.name, args: call.args || {} });
          } else result = await callReadTool(call.name, { ...(call.args || {}), accessToken: admin.accessToken });
        } catch (e) { result = { error: e.message }; }
        responseParts.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
      }
      contents.push({ role: 'user', parts: responseParts });
      candidate = await generateContent({ contents, systemInstruction: SYSTEM(autoExecute), tools });
    }

    let proposedAction = null;
    if (!autoExecute) proposedAction = await makeProposal(message.trim(), history, admin);
    return res.status(200).json({ reply: textFromCandidate(candidate) || "I couldn't come up with a response.", appliedActions, proposedAction, autoExecute });
  } catch (e) {
    console.error('admin-chat api error:', e);
    return res.status(500).json({ error: e.message || 'Something went wrong.' });
  }
}

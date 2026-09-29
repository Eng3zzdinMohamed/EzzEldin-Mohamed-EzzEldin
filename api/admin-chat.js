// Admin-only AI helper API. Requires a valid admin Supabase session (verified
// server-side via requireAdmin). Can read anything the admin can read and,
// depending on admin_settings.ai_auto_execute, either proposes write actions
// for the admin to confirm, or applies them immediately — always through the
// same RLS-protected REST calls the admin panel itself uses (no service key).

import { requireAdmin, rest, callRpc } from './_lib/supabase.js';
import { generateContent, textFromCandidate, functionCallsFromCandidate } from './_lib/gemini.js';

export const config = { runtime: 'nodejs' };

// Tables the assistant is allowed to touch, and how to summarize a row for confirmation prompts.
const WRITABLE_TABLES = {
  projects: 'title', skills: 'name', skill_categories: 'name', experiences: 'position',
  education: 'institution', certificates: 'name', focus_tags: 'label', about_facts: 'label',
  toolbox_items: 'name', social_links: 'label',
};
const SINGLE_TABLES = ['site_profile', 'site_settings'];

const READ_TOOLS = [
  {
    name: 'get_dashboard',
    description: 'Get admin dashboard stats: counts of projects/skills/certificates/experience/education, unread messages, recent updates.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_rows',
    description: 'List rows from a content table (any status, including drafts), optionally filtered.',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: Object.keys(WRITABLE_TABLES), description: 'Which table to list.' },
        search: { type: 'string', description: 'Optional case-insensitive substring to filter the title/name field by.' },
        limit: { type: 'integer', description: 'Max rows to return, default 20.' },
      },
      required: ['table'],
    },
  },
  {
    name: 'get_row',
    description: 'Get one full row by id from a content table.',
    parameters: {
      type: 'object',
      properties: { table: { type: 'string', enum: Object.keys(WRITABLE_TABLES) }, id: { type: 'string' } },
      required: ['table', 'id'],
    },
  },
  {
    name: 'list_messages',
    description: 'List contact form messages (id, name, email, excerpt, is_read, created_at).',
    parameters: { type: 'object', properties: { unread_only: { type: 'boolean' } } },
  },
];

const WRITE_TOOLS = [
  {
    name: 'create_row',
    description: 'Create a new row in a content table. Fields must match that table\'s columns. New rows default to draft unless a status is given.',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: Object.keys(WRITABLE_TABLES) },
        fields: { type: 'object', description: 'Column values for the new row.' },
      },
      required: ['table', 'fields'],
    },
  },
  {
    name: 'update_row',
    description: 'Update specific fields of an existing row by id (partial update).',
    parameters: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: Object.keys(WRITABLE_TABLES) },
        id: { type: 'string' },
        fields: { type: 'object', description: 'Only the columns to change.' },
      },
      required: ['table', 'id', 'fields'],
    },
  },
  {
    name: 'delete_row',
    description: 'Delete a row by id. Irreversible — only call after the admin has clearly confirmed which row.',
    parameters: {
      type: 'object',
      properties: { table: { type: 'string', enum: Object.keys(WRITABLE_TABLES) }, id: { type: 'string' } },
      required: ['table', 'id'],
    },
  },
  {
    name: 'update_singleton',
    description: "Update fields on site_profile (name/bio/hero/about) or site_settings (SEO/site name/etc).",
    parameters: {
      type: 'object',
      properties: { table: { type: 'string', enum: SINGLE_TABLES }, fields: { type: 'object' } },
      required: ['table', 'fields'],
    },
  },
  {
    name: 'mark_message_read',
    description: 'Mark a contact message as read or unread.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, is_read: { type: 'boolean' } }, required: ['id', 'is_read'] },
  },
];

const SYSTEM_INSTRUCTION = (autoExecute) => `You are the admin's AI helper for the backend of Ezz-Eldin's portfolio site. You can read any content (including drafts) and, when asked, perform create/update/delete actions on the portfolio database.

Rules:
- Always use tools to read real data before answering factual questions — never guess ids or current values.
- For write actions (create_row, update_row, delete_row, update_singleton, mark_message_read): ${autoExecute
  ? 'the admin has enabled auto-execute, so you may call these tools directly. Still summarize what you changed afterward.'
  : 'you are in PROPOSE-ONLY mode. Do NOT call these tools yourself. Instead, respond with a clear, concrete natural-language description of the exact change you would make (table, id if updating, and the field values), and tell the admin to confirm it in the UI to apply it.'}
- Be concise and precise about ids, table names, and field values you use or propose.
- Never invent an id — always look it up first with list_rows or get_row.
- Delete actions are irreversible; be extra clear about what will be deleted.`;

async function callReadTool(name, args) {
  switch (name) {
    case 'get_dashboard':
      return callRpc('admin_dashboard', {}, args.accessToken);
    case 'list_rows': {
      const table = args.table;
      if (!WRITABLE_TABLES[table]) throw new Error('Unknown table');
      const titleCol = WRITABLE_TABLES[table];
      let q = `${table}?select=*&order=sort_order.asc&limit=${Math.min(args.limit || 20, 50)}`;
      if (args.search) q += `&${titleCol}=ilike.*${encodeURIComponent(args.search)}*`;
      return rest(q, {}, args.accessToken);
    }
    case 'get_row':
      if (!WRITABLE_TABLES[args.table]) throw new Error('Unknown table');
      return rest(`${args.table}?id=eq.${args.id}&select=*`, {}, args.accessToken);
    case 'list_messages': {
      let q = 'contact_messages?select=id,name,email,message,is_read,created_at&order=created_at.desc&limit=20';
      if (args.unread_only) q += '&is_read=eq.false';
      return rest(q, {}, args.accessToken);
    }
    default:
      throw new Error(`Unknown read tool: ${name}`);
  }
}

async function applyWriteTool(name, args, admin) {
  const log = async (action, target_table, target_id, payload, result, error_message) => {
    try {
      await rest('ai_action_log', {
        method: 'POST',
        body: { admin_email: admin.email, action, target_table, target_id: target_id || null, payload, result, error_message },
        headers: { Prefer: 'return=minimal' },
      }, admin.accessToken);
    } catch { /* logging failure should never block the actual response */ }
  };

  try {
    let result;
    switch (name) {
      case 'create_row': {
        if (!WRITABLE_TABLES[args.table]) throw new Error('Unknown table');
        const top = await rest(`${args.table}?select=sort_order&order=sort_order.desc&limit=1`, {}, admin.accessToken);
        const body = { ...args.fields, sort_order: (top[0] ? top[0].sort_order : 0) + 10 };
        result = await rest(args.table, { method: 'POST', body, headers: { Prefer: 'return=representation' } }, admin.accessToken);
        await log('create_row', args.table, result && result[0] && result[0].id, args.fields, 'applied');
        break;
      }
      case 'update_row': {
        if (!WRITABLE_TABLES[args.table]) throw new Error('Unknown table');
        result = await rest(`${args.table}?id=eq.${args.id}`, { method: 'PATCH', body: args.fields, headers: { Prefer: 'return=representation' } }, admin.accessToken);
        await log('update_row', args.table, args.id, args.fields, 'applied');
        break;
      }
      case 'delete_row': {
        if (!WRITABLE_TABLES[args.table]) throw new Error('Unknown table');
        await rest(`${args.table}?id=eq.${args.id}`, { method: 'DELETE' }, admin.accessToken);
        result = { deleted: true };
        await log('delete_row', args.table, args.id, null, 'applied');
        break;
      }
      case 'update_singleton': {
        if (!SINGLE_TABLES.includes(args.table)) throw new Error('Unknown table');
        result = await rest(`${args.table}?id=eq.1`, { method: 'PATCH', body: args.fields, headers: { Prefer: 'return=representation' } }, admin.accessToken);
        await log('update_singleton', args.table, null, args.fields, 'applied');
        break;
      }
      case 'mark_message_read': {
        result = await rest(`contact_messages?id=eq.${args.id}`, { method: 'PATCH', body: { is_read: args.is_read }, headers: { Prefer: 'return=representation' } }, admin.accessToken);
        await log('mark_message_read', 'contact_messages', args.id, { is_read: args.is_read }, 'applied');
        break;
      }
      default:
        throw new Error(`Unknown write tool: ${name}`);
    }
    return result;
  } catch (e) {
    await log(name, args.table || 'contact_messages', args.id, args.fields, 'failed', e.message);
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let admin;
  try {
    admin = await requireAdmin(req);
  } catch (e) {
    res.status(e.statusCode || 401).json({ error: e.message });
    return;
  }

  try {
    const { message, history, confirmedAction } = req.body || {};

    // Path 1: admin clicked "Confirm" on a previously-proposed action.
    if (confirmedAction && confirmedAction.name) {
      const result = await applyWriteTool(confirmedAction.name, confirmedAction.args || {}, admin);
      res.status(200).json({ applied: true, result });
      return;
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'A message is required.' });
      return;
    }
    if (message.length > 4000) {
      res.status(400).json({ error: 'Message is too long.' });
      return;
    }

    const settingsRow = (await rest('admin_settings?id=eq.1&select=ai_auto_execute', {}, admin.accessToken))[0];
    const autoExecute = !!(settingsRow && settingsRow.ai_auto_execute);
    const tools = autoExecute ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;

    const contents = [];
    if (Array.isArray(history)) {
      for (const turn of history.slice(-12)) {
        if (!turn || typeof turn.text !== 'string') continue;
        contents.push({ role: turn.role === 'model' ? 'model' : 'user', parts: [{ text: turn.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const systemInstruction = SYSTEM_INSTRUCTION(autoExecute);
    let candidate = await generateContent({ contents, systemInstruction, tools });
    let appliedActions = [];

    for (let i = 0; i < 4; i++) {
      const calls = functionCallsFromCandidate(candidate);
      if (!calls.length) break;

      contents.push(candidate.content);
      const responseParts = [];
      for (const call of calls) {
        let toolResult;
        try {
          if (WRITE_TOOLS.some((t) => t.name === call.name)) {
            // Only reachable when autoExecute is true (write tools aren't offered otherwise).
            toolResult = await applyWriteTool(call.name, call.args || {}, admin);
            appliedActions.push({ name: call.name, args: call.args });
          } else {
            toolResult = await callReadTool(call.name, { ...(call.args || {}), accessToken: admin.accessToken });
          }
        } catch (e) {
          toolResult = { error: e.message };
        }
        responseParts.push({ functionResponse: { name: call.name, response: { result: toolResult } } });
      }
      contents.push({ role: 'user', parts: responseParts });
      candidate = await generateContent({ contents, systemInstruction, tools });
    }

    const text = textFromCandidate(candidate) || "I couldn't come up with a response.";

    // If not auto-executing, try to detect a clear proposed write in the model's
    // own text isn't reliable — instead we ask the model, on the *next* turn if
    // the admin wants to apply it, to re-state it as a structured tool call by
    // temporarily allowing write tools in "dry run" mode. Simpler and more robust:
    // when not auto-executing, re-run this exact turn once with write tools
    // enabled but intercepted, to get a structured proposal instead of prose.
    let proposedAction = null;
    if (!autoExecute) {
      const proposalContents = [...contents.slice(0, -1)]; // drop the final tool-response round if any; reuse original request
      // Simplest reliable approach: ask again with write tools visible, but treat
      // any resulting function call as a PROPOSAL only (never executed here).
      const proposalCandidate = await generateContent({
        contents: [{ role: 'user', parts: [{ text: message }] }],
        systemInstruction: 'You are the same admin assistant, but for THIS turn only: if the admin\'s message describes a write action (create/update/delete a row, or update a singleton, or mark a message read/unread), call the single matching tool with your best-filled arguments based on the conversation so far. Do not call read tools here. If no write action is being requested, do not call any tool.',
        tools: [...READ_TOOLS, ...WRITE_TOOLS],
      });
      const proposalCalls = functionCallsFromCandidate(proposalCandidate);
      const writeCall = proposalCalls.find((c) => WRITE_TOOLS.some((t) => t.name === c.name));
      if (writeCall) proposedAction = { name: writeCall.name, args: writeCall.args || {} };
    }

    res.status(200).json({ reply: text, appliedActions, proposedAction, autoExecute });
  } catch (e) {
    console.error('admin-chat api error:', e);
    res.status(500).json({ error: e.message || 'Something went wrong.' });
  }
}

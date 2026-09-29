// Public-facing chat API for the homepage widget.
// Read-only: every "tool" here calls a SECURITY INVOKER RPC that only ever
// returns status = 'published' rows (see migration 005). No admin/session
// context is used or required.

import { callRpc } from './_lib/supabase.js';
import { generateContent, textFromCandidate, functionCallsFromCandidate } from './_lib/gemini.js';

export const config = { runtime: 'nodejs' };

const TOOLS = [
  {
    name: 'get_profile',
    description: "Get Ezzeldin's profile info: name, title, bio, email, phone, location, profile picture URL, social links, and quick facts. Call this whenever the user asks who he is, how to contact him, for his picture, or for a social/contact link.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_projects',
    description: "List Ezzeldin's published portfolio projects, each with a title, description, main image, a gallery of image URLs, and technologies used. Optionally filter by a search term (matches title/category/description). Call this whenever the user asks about his projects, work, or portfolio.",
    parameters: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Optional keyword to filter projects by (e.g. a technology or category).' } },
    },
  },
  {
    name: 'list_skills',
    description: 'List all of ' + "Ezzeldin's" + ' published skills with category, level (0-100), and years of experience. Call this when asked about his skills, tech stack, or expertise.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_experience',
    description: "List Ezzeldin's work experience (position, company, dates, description). Call this when asked about his work history or career.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_certificates',
    description: "List Ezzeldin's certificates (name, issuer, date, verification link). Call this when asked about certifications or credentials.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'show_contact_options',
    description: "Render an interactive set of buttons for Ezzeldin's contact/communication methods (email, WhatsApp, social links, etc.) directly in the chat, pulled from get_profile data. Call this whenever the user wants to contact him or asks how to reach him — do this IN ADDITION TO calling get_profile if you have not already.",
    parameters: { type: 'object', properties: {} },
  },
];

const SYSTEM_INSTRUCTION = `You are the friendly assistant on Ezz-Eldin's personal portfolio website. You answer visitor questions about Ezz-Eldin: who he is, his projects, skills, experience, certificates, and how to contact him.

Rules:
- Only talk about Ezz-Eldin, his work, and how to contact him. Politely decline unrelated requests (general trivia, coding help for the visitor, etc.) and steer back to Ezz-Eldin.
- Always call the relevant tool to get real data before answering factual questions about him — never invent details.
- Keep answers short, warm, and conversational (2-4 sentences unless listing projects/skills).
- When you call show_contact_options, do not also re-list every contact method as text — the UI will render buttons for it; just add a short friendly sentence.
- When talking about a specific project the user seems interested in, mention that its gallery can be viewed (the UI shows it automatically when list_projects data is used).
- If asked something you have no data for, say so honestly instead of guessing.`;

async function callTool(name, args) {
  switch (name) {
    case 'get_profile':
      return callRpc('ai_get_profile');
    case 'list_projects':
      return callRpc('ai_list_projects', { p_search: (args && args.search) || null });
    case 'list_skills':
      return callRpc('ai_list_skills');
    case 'list_experience':
      return callRpc('ai_list_experience');
    case 'list_certificates':
      return callRpc('ai_list_certificates');
    case 'show_contact_options': {
      const profile = await callRpc('ai_get_profile');
      return { ui_hint: 'render_contact_buttons', profile };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Map a tool result to a UI directive the widget knows how to render.
function uiWidgetFor(toolName, result) {
  if (toolName === 'show_contact_options') {
    return { type: 'contact_buttons', profile: result.profile.profile, social: result.profile.social };
  }
  if (toolName === 'list_projects' && Array.isArray(result) && result.length) {
    return { type: 'project_gallery', projects: result };
  }
  if (toolName === 'get_profile' && result && result.profile) {
    return { type: 'profile_card', profile: result.profile };
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'A message is required.' });
      return;
    }
    if (message.length > 2000) {
      res.status(400).json({ error: 'Message is too long.' });
      return;
    }

    // history: [{role:'user'|'model', text:'...'}], last ~10 turns from the client
    const contents = [];
    if (Array.isArray(history)) {
      for (const turn of history.slice(-10)) {
        if (!turn || typeof turn.text !== 'string') continue;
        contents.push({ role: turn.role === 'model' ? 'model' : 'user', parts: [{ text: turn.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const widgets = [];
    let candidate = await generateContent({ contents, systemInstruction: SYSTEM_INSTRUCTION, tools: TOOLS });

    // Allow a small number of tool-call round-trips.
    for (let i = 0; i < 4; i++) {
      const calls = functionCallsFromCandidate(candidate);
      if (!calls.length) break;

      contents.push(candidate.content); // the model's turn requesting tool(s)
      const responseParts = [];
      for (const call of calls) {
        let toolResult;
        try {
          toolResult = await callTool(call.name, call.args || {});
          const widget = uiWidgetFor(call.name, toolResult);
          if (widget) widgets.push(widget);
        } catch (e) {
          toolResult = { error: e.message };
        }
        responseParts.push({ functionResponse: { name: call.name, response: { result: toolResult } } });
      }
      contents.push({ role: 'user', parts: responseParts });
      candidate = await generateContent({ contents, systemInstruction: SYSTEM_INSTRUCTION, tools: TOOLS });
    }

    const text = textFromCandidate(candidate) || "Sorry, I couldn't come up with an answer just now.";
    res.status(200).json({ reply: text, widgets });
  } catch (e) {
    console.error('chat api error:', e);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
}

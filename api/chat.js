// Public-facing chat API for the homepage widget.
// Read-only: every tool calls a SECURITY INVOKER RPC that only returns
// published portfolio data. The Gemini key never reaches the browser.

import { callRpc } from './supabase.js';
import { generateContent, textFromCandidate, functionCallsFromCandidate } from './gemini.js';

export const config = { runtime: 'nodejs' };

const TOOLS = [
  { name: 'get_profile', description: "Get Ezzeldin's published profile, contact details, profile picture, social links, and quick facts. Use for questions about who he is, his picture, or contact details.", parameters: { type: 'object', properties: {} } },
  { name: 'list_projects', description: "List Ezzeldin's published projects with descriptions, technologies, main images, and galleries. Optionally filter by a keyword.", parameters: { type: 'object', properties: { search: { type: 'string' } } } },
  { name: 'list_skills', description: "List Ezzeldin's published skills, categories, levels, and experience.", parameters: { type: 'object', properties: {} } },
  { name: 'list_experience', description: "List Ezzeldin's published work experience.", parameters: { type: 'object', properties: {} } },
  { name: 'list_certificates', description: "List Ezzeldin's published certificates and verification links.", parameters: { type: 'object', properties: {} } },
  { name: 'show_contact_options', description: "Prepare interactive contact buttons for email, phone/WhatsApp, and published social links. Use whenever the visitor asks how to contact Ezzeldin.", parameters: { type: 'object', properties: {} } },
];

const SYSTEM_INSTRUCTION = `You are the friendly assistant on Ezz-Eldin's personal portfolio website.
You answer questions only about Ezz-Eldin, his work, projects, skills, experience, certificates, and how to contact him.
Always use the relevant tool before stating factual information about him. Never invent or infer personal facts.
Keep replies concise and conversational. If a request is unrelated, politely say you can help with information about Ezz-Eldin and his portfolio.
When contact options are requested, use show_contact_options. When projects are requested, use list_projects so the UI can render their galleries.
If information is unavailable, say that it is not currently listed on the portfolio.`;

async function callTool(name, args) {
  switch (name) {
    case 'get_profile': return callRpc('ai_get_profile');
    case 'list_projects': return callRpc('ai_list_projects', { p_search: args?.search || null });
    case 'list_skills': return callRpc('ai_list_skills');
    case 'list_experience': return callRpc('ai_list_experience');
    case 'list_certificates': return callRpc('ai_list_certificates');
    case 'show_contact_options': {
      const profile = await callRpc('ai_get_profile');
      return { ui_hint: 'render_contact_buttons', profile };
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

function widgetsFor(toolName, result) {
  if (toolName === 'show_contact_options') {
    return [{ type: 'contact_buttons', profile: result.profile?.profile || {}, social: result.profile?.social || [] }];
  }
  if (toolName === 'list_projects' && Array.isArray(result) && result.length) {
    return [{ type: 'project_gallery', projects: result }];
  }
  if (toolName === 'get_profile' && result?.profile) {
    return [{ type: 'profile_card', profile: result.profile }];
  }
  return [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { message, history } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'A message is required.' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message is too long.' });

    const contents = [];
    if (Array.isArray(history)) {
      for (const turn of history.slice(-10)) {
        if (!turn || typeof turn.text !== 'string') continue;
        contents.push({ role: turn.role === 'model' ? 'model' : 'user', parts: [{ text: turn.text.slice(0, 4000) }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message.trim() }] });

    const widgets = [];
    let candidate = await generateContent({ contents, systemInstruction: SYSTEM_INSTRUCTION, tools: TOOLS });

    for (let round = 0; round < 4; round++) {
      const calls = functionCallsFromCandidate(candidate);
      if (!calls.length) break;
      contents.push(candidate.content);
      const responseParts = [];
      for (const call of calls) {
        let toolResult;
        try {
          toolResult = await callTool(call.name, call.args || {});
          widgets.push(...widgetsFor(call.name, toolResult));
        } catch (e) {
          toolResult = { error: e.message };
        }
        responseParts.push({ functionResponse: { id: call.id, name: call.name, response: { result: toolResult } } });
      }
      contents.push({ role: 'user', parts: responseParts });
      candidate = await generateContent({ contents, systemInstruction: SYSTEM_INSTRUCTION, tools: TOOLS });
    }

    return res.status(200).json({ reply: textFromCandidate(candidate) || "Sorry, I couldn't answer that just now.", widgets });
  } catch (e) {
    console.error('chat api error:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
}

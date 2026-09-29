// Minimal Gemini (Google AI Studio) client, using the REST API directly
// (no SDK dependency). Reads the key from the server-only env var —
// this file never runs in the browser.

const MODEL = 'gemini-flash-lite-latest';

function apiKey() {
  // Support either name in case the var gets renamed; PUBLIC_ prefix here is
  // just this project's naming choice — the var is only ever read server-side.
  const key = process.env.PUBLIC_GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key is not configured on the server (PUBLIC_GEMINI_API_KEYS).');
  return key;
}

/**
 * One Gemini generateContent call.
 * @param {object} opts
 * @param {Array} opts.contents Gemini "contents" array (role/parts)
 * @param {string} [opts.systemInstruction] system prompt text
 * @param {Array} [opts.tools] Gemini tool declarations (functionDeclarations)
 * @param {object} [opts.generationConfig]
 */
export async function generateContent({ contents, systemInstruction, tools, generationConfig }) {
  const body = {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024, ...generationConfig },
  };

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey()}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await r.json();
  if (!r.ok) {
    throw new Error((data && data.error && data.error.message) || `Gemini request failed (${r.status})`);
  }
  const candidate = data.candidates && data.candidates[0];
  if (!candidate) {
    const reason = data.promptFeedback && data.promptFeedback.blockReason;
    throw new Error(reason ? `Blocked by Gemini: ${reason}` : 'Gemini returned no response.');
  }
  return candidate; // { content: { role, parts }, finishReason, ... }
}

/** Extract plain text from a candidate's parts (ignores function calls). */
export function textFromCandidate(candidate) {
  const parts = (candidate.content && candidate.content.parts) || [];
  return parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('');
}

/** Extract all functionCall parts, if any. */
export function functionCallsFromCandidate(candidate) {
  const parts = (candidate.content && candidate.content.parts) || [];
  return parts.filter((p) => p.functionCall).map((p) => p.functionCall);
}

'use strict';

const axios = require('axios');

const LLM_API_URL = process.env.LLM_API_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL   = process.env.LLM_MODEL || 'mistralai/mistral-7b-instruct:free';

/**
 * Phase 5 + 7 — LLM Integration with AI Task Detection
 *
 * Works with any OpenAI-compatible endpoint (OpenRouter, OpenAI, etc.).
 * When using OpenRouter the HTTP-Referer and X-Title headers are recommended
 * so that your app appears correctly in the OpenRouter dashboard.
 *
 * System prompt instructs the LLM to return structured JSON so the bot can
 * distinguish between a chat response and a task-creation action.
 */
const SYSTEM_PROMPT = `You are a precise personal AI assistant. Always respond with valid JSON only — no extra text.

If the user's message contains a task or reminder intent (phrases such as "remind me", "schedule", "do this", "tomorrow", "by Friday", "don't forget", "need to", "have to"):
{"action":"create_task","title":"<concise task title>","due_date":"<YYYY-MM-DD or null>"}

For all other messages respond conversationally:
{"action":"chat","response":"<your reply>"}`;

/**
 * Generate a reply for the given user input with conversation context.
 *
 * @param {{ role: string, content: string }[]} history  Recent conversation
 * @param {string} input  Latest user message
 * @returns {Promise<{ action: string, response?: string, title?: string, due_date?: string|null }>}
 */
async function generateReply(history, input) {
  if (!LLM_API_URL) throw new Error('LLM_API_URL is not set.');
  if (!LLM_API_KEY) throw new Error('LLM_API_KEY is not set.');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: input },
  ];

  const response = await axios.post(
    LLM_API_URL,
    { model: LLM_MODEL, messages, temperature: 0.3 },
    {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
        // Recommended by OpenRouter — safe to include for other providers too
        'HTTP-Referer':  'https://github.com/QuvonchbekToshqoziyev/personal-llm',
        'X-Title':       'personal-llm',
      },
    }
  );

  const choice = response.data.choices && response.data.choices[0];
  if (!choice || !choice.message || choice.message.content === null || choice.message.content === undefined) {
    throw new Error('Unexpected LLM response format.');
  }

  const raw = choice.message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    // LLM returned non-JSON text — treat as plain chat response
    return { action: 'chat', response: raw };
  }
}

module.exports = { generateReply };


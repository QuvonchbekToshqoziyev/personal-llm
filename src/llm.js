'use strict';

const axios = require('axios');

const LLM_API_URL = process.env.LLM_API_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL   = process.env.LLM_MODEL || 'gpt-4o-mini';

/**
 * Send a conversation to the LLM and return the assistant reply.
 *
 * @param {{ role: string, content: string }[]} messages  Full message history
 *        (each entry has `role`: "system" | "user" | "assistant" and `content`).
 * @returns {Promise<string>}  The assistant's reply text.
 */
async function chat(messages) {
  if (!LLM_API_URL) {
    throw new Error('LLM_API_URL is not set in environment variables.');
  }
  if (!LLM_API_KEY) {
    throw new Error('LLM_API_KEY is not set in environment variables.');
  }

  const response = await axios.post(
    LLM_API_URL,
    { model: LLM_MODEL, messages },
    {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
    }
  );

  const choice = response.data.choices && response.data.choices[0];
  if (!choice || !choice.message || choice.message.content == null) {
    throw new Error('Unexpected LLM response format.');
  }
  return choice.message.content.trim();
}

module.exports = { chat };

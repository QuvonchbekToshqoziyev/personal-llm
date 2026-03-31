'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { saveMessage, getRecentMessages } = require('./db');
const { chat } = require('./llm');

const token = process.env.TELEGRAM_BOT_TOKEN;
const MAX_CONTEXT_MESSAGES = parseInt(process.env.LLM_CONTEXT_MESSAGES || '10', 10);

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');

bot.on('message', async (msg) => {
  const chatId  = msg.chat.id;
  const userId  = msg.from ? msg.from.id : null;
  const text    = (msg.text || '').trim();

  if (!text) return;

  // Phase 2: persist the incoming user message
  saveMessage(chatId, userId, 'user', text);

  // Phase 3: build context from recent history and query the LLM
  const history = getRecentMessages(chatId, MAX_CONTEXT_MESSAGES);

  let reply;
  try {
    reply = await chat(history);
  } catch (err) {
    console.error('LLM error:', err.message);
    const hint = err.message.includes('not set')
      ? 'The bot is not configured correctly (missing API key or URL).'
      : 'The AI service is temporarily unavailable. Please try again later.';
    reply = `Sorry, I could not get a response. ${hint}`;
  }

  // Persist the assistant reply and send it back to the user
  saveMessage(chatId, null, 'assistant', reply);
  bot.sendMessage(chatId, reply);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

module.exports = bot;

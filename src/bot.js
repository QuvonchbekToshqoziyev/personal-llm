'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { storeMessage }    = require('./storage');
const { getRecentMessages } = require('./memory');
const { generateReply }   = require('./llm');
const { createTask, listTasks, completeTask } = require('./tasks');

const token = process.env.TELEGRAM_BOT_TOKEN;
const MAX_CONTEXT = parseInt(process.env.LLM_CONTEXT_MESSAGES || '10', 10);

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');

// ─── Phase 8: Command — /task <title> [due: YYYY-MM-DD] ───────────────────
bot.onText(/^\/task (.+)/i, async (msg, match) => {
  const userId = msg.from ? msg.from.id : msg.chat.id;
  const chatId = msg.chat.id;
  const input  = match[1].trim();

  // Optional due date suffix: "Buy groceries due: 2024-12-01"
  const dueMatch = input.match(/\bdue:\s*(\d{4}-\d{2}-\d{2})\b/i);
  const dueDate  = dueMatch ? dueMatch[1] : null;
  const title    = input.replace(/\bdue:\s*\d{4}-\d{2}-\d{2}\b/i, '').trim();

  const taskId = createTask(userId, title, dueDate);
  const reply  = `✅ Task #${taskId} created: "${title}"${dueDate ? ` (due ${dueDate})` : ''}`;

  await storeMessage(bot, userId, reply, 'assistant', 'task');
  bot.sendMessage(chatId, reply);
});

// ─── Phase 8: Command — /tasks ─────────────────────────────────────────────
bot.onText(/^\/tasks$/i, (msg) => {
  const userId = msg.from ? msg.from.id : msg.chat.id;
  const chatId = msg.chat.id;
  const tasks  = listTasks(userId);

  if (tasks.length === 0) {
    return bot.sendMessage(chatId, '📋 No pending tasks.');
  }

  const lines = tasks.map(
    t => `#${t.id} ${t.title}${t.due_date ? ` — due ${t.due_date}` : ''}`
  );
  bot.sendMessage(chatId, `📋 Pending tasks:\n${lines.join('\n')}`);
});

// ─── Phase 8: Command — /done <id> ─────────────────────────────────────────
bot.onText(/^\/done (\d+)$/i, (msg, match) => {
  const chatId = msg.chat.id;
  const taskId = parseInt(match[1], 10);
  const ok     = completeTask(taskId);
  bot.sendMessage(chatId, ok
    ? `✔️ Task #${taskId} marked as done.`
    : `⚠️ Task #${taskId} not found.`
  );
});

// ─── Phase 3–7: Regular message flow ───────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const userId = msg.from ? msg.from.id : msg.chat.id;
  const chatId = msg.chat.id;
  const text   = msg.text.trim();

  // Phase 3: persist incoming user message (mirror to Telegram storage chat)
  await storeMessage(bot, userId, text, 'user');

  // Phase 4: reconstruct context from the DB index
  const history = getRecentMessages(userId, MAX_CONTEXT);

  // Phase 5 + 7: call LLM — returns { action, response? } or { action, title, due_date }
  let parsed;
  try {
    parsed = await generateReply(history, text);
  } catch (err) {
    console.error('LLM error:', err.message);
    const isConfig = err.message.includes('LLM_API_URL is not set') ||
                     err.message.includes('LLM_API_KEY is not set');
    const hint = isConfig
      ? 'The bot is not configured correctly (missing API key or URL).'
      : 'The AI service is temporarily unavailable. Please try again later.';
    bot.sendMessage(chatId, `Sorry, I could not get a response. ${hint}`);
    return;
  }

  let reply;
  if (parsed.action === 'create_task') {
    // Phase 7: auto-detected task intent → create task
    const taskId = createTask(userId, parsed.title, parsed.due_date || null);
    reply = `✅ Task #${taskId} created: "${parsed.title}"${parsed.due_date ? ` (due ${parsed.due_date})` : ''}`;
    await storeMessage(bot, userId, reply, 'assistant', 'task');
  } else {
    reply = parsed.response || "I couldn't understand that.";
    await storeMessage(bot, userId, reply, 'assistant');
  }

  bot.sendMessage(chatId, reply);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

module.exports = bot;


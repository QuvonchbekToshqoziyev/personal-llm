'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { storeMessage }    = require('./storage');
const { getRecentMessages } = require('./memory');
const { generateReply, setLlmSetting, llmApiUrl, llmApiKey, llmModel } = require('./llm');
const { createTask, listTasks, completeTask } = require('./tasks');
const db         = require('./db');
const userClient = require('./userClient');
const { exportGroup, EXPORTS_DIR } = require('./exporter');

const token      = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID   = parseInt(process.env.TELEGRAM_OWNER_ID || '0', 10);
const MAX_CONTEXT = parseInt(process.env.LLM_CONTEXT_MESSAGES || '10', 10);

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');

// ─── Owner guard ────────────────────────────────────────────────────────────

function isOwner(msg) {
  if (!OWNER_ID) return true; // no restriction if TELEGRAM_OWNER_ID not set
  return (msg.from && msg.from.id === OWNER_ID) || msg.chat.id === OWNER_ID;
}

function ownerOnly(handler) {
  return async (msg, match) => {
    if (!isOwner(msg)) {
      return bot.sendMessage(msg.chat.id, '⛔ This command is restricted to the bot owner.');
    }
    return handler(msg, match);
  };
}

// ─── Phase 1 helper: /myid ──────────────────────────────────────────────────
// Task 1 — show the user their Telegram chat/user ID so they can set
// TELEGRAM_OWNER_ID and find group chat IDs.

bot.onText(/^\/myid$/i, (msg) => {
  const uid  = msg.from ? msg.from.id : msg.chat.id;
  const cid  = msg.chat.id;
  const type = msg.chat.type;
  bot.sendMessage(cid,
    `🪪 *Your info*\n` +
    `User ID: \`${uid}\`\n` +
    `Chat ID: \`${cid}\`\n` +
    `Chat type: ${type}`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Phase 8: /task /tasks /done ────────────────────────────────────────────

bot.onText(/^\/task (.+)/i, async (msg, match) => {
  const userId = msg.from ? msg.from.id : msg.chat.id;
  const chatId = msg.chat.id;
  const input  = match[1].trim();

  const dueMatch = input.match(/\bdue:\s*(\d{4}-\d{2}-\d{2})\b/i);
  const dueDate  = dueMatch ? dueMatch[1] : null;
  const title    = input.replace(/\bdue:\s*\d{4}-\d{2}-\d{2}\b/i, '').trim();

  const taskId = createTask(userId, title, dueDate);
  const reply  = `✅ Task #${taskId} created: "${title}"${dueDate ? ` (due ${dueDate})` : ''}`;

  await storeMessage(bot, userId, reply, 'assistant', 'task');
  bot.sendMessage(chatId, reply);
});

bot.onText(/^\/tasks$/i, (msg) => {
  const userId = msg.from ? msg.from.id : msg.chat.id;
  const chatId = msg.chat.id;
  const tasks  = listTasks(userId);

  if (tasks.length === 0) return bot.sendMessage(chatId, '📋 No pending tasks.');

  const lines = tasks.map(
    t => `#${t.id} ${t.title}${t.due_date ? ` — due ${t.due_date}` : ''}`
  );
  bot.sendMessage(chatId, `📋 Pending tasks:\n${lines.join('\n')}`);
});

bot.onText(/^\/done (\d+)$/i, (msg, match) => {
  const chatId = msg.chat.id;
  const taskId = parseInt(match[1], 10);
  const ok     = completeTask(taskId);
  bot.sendMessage(chatId, ok
    ? `✔️ Task #${taskId} marked as done.`
    : `⚠️ Task #${taskId} not found.`
  );
});

// ─── Task 1 — MTProto auth: /auth /authcode /authpass ───────────────────────
//
// /auth <phone>   — start auth with your Telegram account's phone number
// /authcode <code> — submit the OTP Telegram sent to your phone
// /authpass <pwd>  — submit your 2FA cloud password (only if Telegram asks)

bot.onText(/^\/auth (.+)/i, ownerOnly(async (msg, match) => {
  const chatId = msg.chat.id;
  const phone  = match[1].trim();

  if (userClient.hasSession()) {
    return bot.sendMessage(chatId,
      '✅ Already authenticated. Delete `data.session` and restart to re-authenticate.',
      { parse_mode: 'Markdown' }
    );
  }

  if (!process.env.TELEGRAM_API_ID || !process.env.TELEGRAM_API_HASH) {
    return bot.sendMessage(chatId,
      '⚠️ Set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` in your `.env` first.\n' +
      'Get them at https://my.telegram.org/apps',
      { parse_mode: 'Markdown' }
    );
  }

  bot.sendMessage(chatId, `📱 Sending code to *${phone}*…`, { parse_mode: 'Markdown' });

  userClient.startAuth(phone, (state, extra) => {
    if (state === 'awaiting_code') {
      bot.sendMessage(chatId,
        '🔢 Telegram sent a code to your phone / app.\n' +
        'Send it here with: `/authcode 12345`',
        { parse_mode: 'Markdown' }
      );
    } else if (state === 'awaiting_password') {
      bot.sendMessage(chatId,
        '🔐 2FA is enabled on your account.\n' +
        'Send your cloud password with: `/authpass yourPassword`',
        { parse_mode: 'Markdown' }
      );
    } else if (state === 'done') {
      bot.sendMessage(chatId, '✅ MTProto authentication successful! Session saved.');
    } else if (state === 'error') {
      bot.sendMessage(chatId, `❌ Auth error: ${extra}`);
    }
  }).catch(err => {
    bot.sendMessage(chatId, `❌ Auth failed: ${err.message}`);
  });
}));

bot.onText(/^\/authcode (.+)/i, ownerOnly((msg, match) => {
  userClient.submitCode(match[1].trim());
  bot.sendMessage(msg.chat.id, '⏳ Verifying code…');
}));

bot.onText(/^\/authpass (.+)/i, ownerOnly((msg, match) => {
  userClient.submitPassword(match[1].trim());
  bot.sendMessage(msg.chat.id, '⏳ Verifying password…');
}));

// ─── Task 2 — /chats and /read ──────────────────────────────────────────────
//
// /chats         — list all dialogs your Telegram account can see
// /read <chatId> [limit] — read recent messages from a group

bot.onText(/^\/chats$/i, ownerOnly(async (msg) => {
  const chatId = msg.chat.id;
  try {
    const dialogs = await userClient.listChats(50);
    if (!dialogs.length) return bot.sendMessage(chatId, 'No chats found.');

    const lines = dialogs.map(d => `${d.type === 'channel' ? '📢' : d.type === 'group' ? '👥' : '💬'} ${d.title} — \`${d.id}\``);
    // Telegram messages have a 4096-char limit; chunk if needed
    const chunks = _chunkLines(lines, 4000);
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ ${err.message}\nMake sure you have authenticated with /auth first.`);
  }
}));

bot.onText(/^\/read (-?\d+)(?:\s+(\d+))?$/i, ownerOnly(async (msg, match) => {
  const chatId  = msg.chat.id;
  const groupId = match[1];
  const limit   = Math.min(parseInt(match[2] || '20', 10), 100);

  try {
    const messages = await userClient.readGroupMessages(groupId, limit);
    if (!messages.length) return bot.sendMessage(chatId, 'No messages found.');

    const lines = messages.map(m =>
      `[${m.date.slice(0, 16)}] ${m.sender}: ${m.text || (m.hasMedia ? '[media]' : '')}`.slice(0, 200)
    );
    const chunks = _chunkLines(lines, 4000);
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
    }
  } catch (err) {
    bot.sendMessage(chatId, `❌ ${err.message}`);
  }
}));

// ─── Task 3 — /watch /unwatch /export ───────────────────────────────────────
//
// /watch <chatId>   — add a group to the deletion watchlist
// /unwatch <chatId> — remove from watchlist
// /watched          — list all watched groups
// /export <chatId>  — export a group right now (messages + media)

bot.onText(/^\/watch (-?\d+)$/i, ownerOnly(async (msg, match) => {
  const chatId  = msg.chat.id;
  const groupId = match[1];

  try {
    const client = await userClient.connect();
    const entity = await client.getEntity(groupId);
    const title  = entity.title || entity.username || groupId;
    db.addWatchedGroup(groupId, title);
    bot.sendMessage(chatId, `👁 Now watching "*${title}*" (\`${groupId}\`) for deletion.`, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, `❌ Could not access chat ${groupId}: ${err.message}`);
  }
}));

bot.onText(/^\/unwatch (-?\d+)$/i, ownerOnly((msg, match) => {
  const removed = db.removeWatchedGroup(match[1]);
  bot.sendMessage(msg.chat.id, removed
    ? `✅ Removed \`${match[1]}\` from watchlist.`
    : `⚠️ \`${match[1]}\` was not in the watchlist.`,
    { parse_mode: 'Markdown' }
  );
}));

bot.onText(/^\/watched$/i, ownerOnly((msg) => {
  const groups = db.getWatchedGroups();
  if (!groups.length) return bot.sendMessage(msg.chat.id, '📭 No groups in watchlist.');
  const lines = groups.map(g => `👥 ${g.title || '(unknown)'} — \`${g.chat_id}\``);
  bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
}));

bot.onText(/^\/export (-?\d+)$/i, ownerOnly(async (msg, match) => {
  const chatId  = msg.chat.id;
  const groupId = match[1];

  bot.sendMessage(chatId, `⏳ Starting export of \`${groupId}\`… This may take a while.`, { parse_mode: 'Markdown' });

  try {
    const result = await exportGroup(groupId, (done) => {
      // optional: could send periodic progress updates here
    });
    bot.sendMessage(chatId,
      `✅ Export complete!\n` +
      `📁 Saved to: \`${result.dir}\`\n` +
      `💬 Messages: ${result.messageCount}\n` +
      `🖼 Media files: ${result.mediaCount}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    bot.sendMessage(chatId, `❌ Export failed: ${err.message}`);
  }
}));

// ─── Task 5 — /setmodel /setkey /seturl ─────────────────────────────────────
//
// Update the LLM configuration at runtime without restarting the bot.
// Changes are persisted to the SQLite settings table.

bot.onText(/^\/setmodel (.+)/i, ownerOnly((msg, match) => {
  const model = match[1].trim();
  setLlmSetting('llm_model', model);
  bot.sendMessage(msg.chat.id, `🤖 LLM model set to: \`${model}\``, { parse_mode: 'Markdown' });
}));

bot.onText(/^\/setkey (.+)/i, ownerOnly((msg, match) => {
  const key = match[1].trim();
  setLlmSetting('llm_api_key', key);
  bot.sendMessage(msg.chat.id, '🔑 LLM API key updated.');
}));

bot.onText(/^\/seturl (.+)/i, ownerOnly((msg, match) => {
  const url = match[1].trim();
  setLlmSetting('llm_api_url', url);
  bot.sendMessage(msg.chat.id, `🔗 LLM API URL set to: \`${url}\``, { parse_mode: 'Markdown' });
}));

bot.onText(/^\/llminfo$/i, ownerOnly((msg) => {
  bot.sendMessage(msg.chat.id,
    `🤖 *Current LLM settings*\n` +
    `URL: \`${llmApiUrl() || '(not set)'}\`\n` +
    `Model: \`${llmModel()}\`\n` +
    `Key: \`${llmApiKey() ? '(set)' : '(not set)'}\``,
    { parse_mode: 'Markdown' }
  );
}));

// ─── Phase 3–7: Regular message flow ────────────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const userId = msg.from ? msg.from.id : msg.chat.id;
  const chatId = msg.chat.id;
  const text   = msg.text.trim();

  // Phase 3: persist incoming user message
  await storeMessage(bot, userId, text, 'user');

  // Phase 4: reconstruct context
  const history = getRecentMessages(userId, MAX_CONTEXT);

  // Phase 5 + 7: LLM reply
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

// ─── Watchdog: auto-export groups that disappear ─────────────────────────────

userClient.startWatchdog(async (chatId, title) => {
  console.log(`[watchdog] Group gone: ${title} (${chatId}) — starting export`);

  if (OWNER_ID) {
    bot.sendMessage(OWNER_ID,
      `⚠️ Watched group "*${title || chatId}*" (\`${chatId}\`) appears to be deleted!\n` +
      `Starting automatic export…`,
      { parse_mode: 'Markdown' }
    );
  }

  try {
    const result = await exportGroup(chatId);
    if (OWNER_ID) {
      bot.sendMessage(OWNER_ID,
        `✅ Auto-export complete for \`${chatId}\`\n` +
        `💬 Messages: ${result.messageCount} | 🖼 Media: ${result.mediaCount}\n` +
        `📁 Saved to: \`${result.dir}\``,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('[watchdog] Export failed:', err.message);
    if (OWNER_ID) {
      bot.sendMessage(OWNER_ID, `❌ Auto-export failed for \`${chatId}\`: ${err.message}`, { parse_mode: 'Markdown' });
    }
  }
});

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Split an array of lines into chunks that each fit within maxChars. */
function _chunkLines(lines, maxChars) {
  const chunks = [];
  let   current = [];
  let   len     = 0;

  for (const line of lines) {
    if (len + line.length + 1 > maxChars && current.length) {
      chunks.push(current.join('\n'));
      current = [];
      len     = 0;
    }
    current.push(line);
    len += line.length + 1;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

module.exports = bot;


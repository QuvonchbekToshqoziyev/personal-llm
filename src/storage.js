'use strict';

const db = require('./db');

const STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID;

/**
 * Phase 3 — Telegram Storage System
 *
 * Mirrors a message to the private Telegram storage chat (if configured)
 * and stores its metadata in SQLite.
 *
 * @param {import('node-telegram-bot-api')} bot
 * @param {number} userId
 * @param {string} text
 * @param {'user'|'assistant'} [role='user']
 * @param {'chat'|'task'|'note'} [type='chat']
 * @param {string} [keywords='']
 * @returns {Promise<number|null>}  Telegram message_id in storage chat, or null
 */
async function storeMessage(bot, userId, text, role = 'user', type = 'chat', keywords = '') {
  let telegramMessageId = null;

  if (STORAGE_CHAT_ID) {
    try {
      const sent = await bot.sendMessage(STORAGE_CHAT_ID, text);
      telegramMessageId = sent.message_id;
    } catch (err) {
      console.warn('[storage] Failed to mirror to storage chat:', err.message);
    }
  }

  db.insertMessage({ telegramMessageId, userId, role, type, keywords, text });
  return telegramMessageId;
}

module.exports = { storeMessage };

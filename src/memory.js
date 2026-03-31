'use strict';

const db = require('./db');

/**
 * Phase 4 — Memory System
 *
 * Retrieves recent messages for a user from the SQLite index.
 * The `telegram_message_id` field in each row is a pointer to the archived
 * copy of the message in the Telegram storage chat (TELEGRAM_STORAGE_CHAT_ID),
 * which serves as the persistent source of truth.
 *
 * @param {number} userId
 * @param {number} [limit=10]
 * @returns {{ role: string, content: string }[]}
 */
function getRecentMessages(userId, limit = 10) {
  const rows = db.getRecentMessages(userId, limit);
  return rows.map(r => ({ role: r.role, content: r.text }));
}

module.exports = { getRecentMessages };

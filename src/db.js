'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(process.cwd(), 'data.db');

let _db;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id   INTEGER NOT NULL,
        user_id   INTEGER,
        role      TEXT    NOT NULL CHECK(role IN ('user','assistant')),
        content   TEXT    NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
    `);
  }
  return _db;
}

/**
 * Persist a message for a given chat.
 * @param {number} chatId
 * @param {number|null} userId
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
function saveMessage(chatId, userId, role, content) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO messages (chat_id, user_id, role, content) VALUES (?, ?, ?, ?)'
  );
  stmt.run(chatId, userId ?? null, role, content);
}

/**
 * Retrieve the N most-recent messages for a chat (oldest first).
 * @param {number} chatId
 * @param {number} [limit=10]
 * @returns {{ role: string, content: string }[]}
 */
function getRecentMessages(chatId, limit = 10) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT role, content
         FROM messages
        WHERE chat_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`
    )
    .all(chatId, limit);
  return rows.reverse();
}

module.exports = { saveMessage, getRecentMessages };

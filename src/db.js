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
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_message_id INTEGER,
        user_id             INTEGER NOT NULL,
        role                TEXT    NOT NULL DEFAULT 'user',
        type                TEXT    NOT NULL DEFAULT 'chat',
        keywords            TEXT,
        text                TEXT    NOT NULL,
        created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_user
        ON messages(user_id, created_at);

      CREATE TABLE IF NOT EXISTS tasks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        title      TEXT    NOT NULL,
        status     TEXT    NOT NULL DEFAULT 'pending',
        due_date   TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_user
        ON tasks(user_id, status);
    `);
  }
  return _db;
}

/**
 * Insert a message row.
 * @param {{ telegramMessageId: number|null, userId: number, role: string,
 *           type: string, keywords: string, text: string }} params
 */
function insertMessage({ telegramMessageId, userId, role, type, keywords, text }) {
  getDb()
    .prepare(
      `INSERT INTO messages (telegram_message_id, user_id, role, type, keywords, text)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(telegramMessageId ?? null, userId, role, type, keywords ?? '', text);
}

/**
 * Retrieve the N most-recent messages for a user (oldest first).
 * @param {number} userId
 * @param {number} [limit=10]
 * @returns {{ role: string, text: string, telegram_message_id: number|null }[]}
 */
function getRecentMessages(userId, limit = 10) {
  const rows = getDb()
    .prepare(
      `SELECT role, text, telegram_message_id
         FROM messages
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`
    )
    .all(userId, limit);
  return rows.reverse();
}

/**
 * Insert a new task and return its id.
 * @param {{ userId: number, title: string, dueDate: string|null }} params
 * @returns {number}
 */
function insertTask({ userId, title, dueDate }) {
  return getDb()
    .prepare(
      `INSERT INTO tasks (user_id, title, due_date) VALUES (?, ?, ?)`
    )
    .run(userId, title, dueDate ?? null).lastInsertRowid;
}

/**
 * Return all pending tasks for a user.
 * @param {number} userId
 * @returns {Array}
 */
function getPendingTasks(userId) {
  return getDb()
    .prepare(
      `SELECT * FROM tasks
        WHERE user_id = ? AND status = 'pending'
        ORDER BY
          -- dated tasks first (NULL due_date sorts last)
          CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
          due_date ASC,
          created_at ASC`
    )
    .all(userId);
}

/**
 * Mark a task as done.
 * @param {number} taskId
 * @returns {boolean}
 */
function markTaskDone(taskId) {
  return getDb()
    .prepare(`UPDATE tasks SET status = 'done' WHERE id = ?`)
    .run(taskId).changes > 0;
}

module.exports = {
  getDb,
  insertMessage,
  getRecentMessages,
  insertTask,
  getPendingTasks,
  markTaskDone,
};


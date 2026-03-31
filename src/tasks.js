'use strict';

const db = require('./db');

/**
 * Phase 6 — Task System
 *
 * Structured task management backed by SQLite.
 */

/**
 * Create a new task for a user.
 * @param {number} userId
 * @param {string} title
 * @param {string|null} [dueDate]  ISO date string 'YYYY-MM-DD' or null
 * @returns {number}  New task ID
 */
function createTask(userId, title, dueDate = null) {
  return db.insertTask({ userId, title, dueDate });
}

/**
 * List all pending tasks for a user.
 * @param {number} userId
 * @returns {Array}
 */
function listTasks(userId) {
  return db.getPendingTasks(userId);
}

/**
 * Mark a task as done.
 * @param {number} taskId
 * @returns {boolean}  true if the task was found and updated
 */
function completeTask(taskId) {
  return db.markTaskDone(taskId);
}

module.exports = { createTask, listTasks, completeTask };

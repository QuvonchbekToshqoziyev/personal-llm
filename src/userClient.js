'use strict';

/**
 * Phase 10 — Telegram MTProto User Client
 *
 * Connects to Telegram as your personal account (not just the bot) using
 * the official MTProto protocol via GramJS.  This lets the bot:
 *   • Read messages from any private group/channel you are a member of,
 *     even groups where media forwarding is disabled (no-forward flag).
 *   • Export full chat history including media before a group is deleted.
 *   • Watch groups and trigger automatic export when they become inaccessible.
 *
 * Prerequisites (add to .env):
 *   TELEGRAM_API_ID   — numeric App ID from https://my.telegram.org/apps
 *   TELEGRAM_API_HASH — App hash from the same page
 *
 * The session string is persisted to `data.session` in the project root so
 * you only need to go through the phone-code flow once.
 */

const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const { Api }            = require('telegram');
const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const SESSION_FILE = path.resolve(process.cwd(), 'data.session');

const API_ID   = parseInt(process.env.TELEGRAM_API_ID  || '0', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '';

// ─── Singleton client ──────────────────────────────────────────────────────

let _client = null;

function _loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return fs.readFileSync(SESSION_FILE, 'utf8').trim();
    }
  } catch { /* ignore */ }
  return '';
}

function _saveSession(str) {
  try {
    fs.writeFileSync(SESSION_FILE, str, 'utf8');
  } catch (err) {
    console.error('[userClient] Could not save session:', err.message);
  }
}

function _getClient() {
  if (!_client) {
    const session = new StringSession(_loadSession());
    _client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 5,
    });
  }
  return _client;
}

// ─── Auth state machine ────────────────────────────────────────────────────
//
// Authentication happens in three possible steps:
//   1. Start: provide phone number  → Telegram sends an OTP
//   2. Code:  user sends OTP back   → bot resolves pendingCode
//   3. Pass:  user sends 2FA pass   → bot resolves pendingPassword  (optional)
//
// Callers in bot.js react to state changes via the onStateChange callback.

let _authState = 'idle'; // 'idle' | 'awaiting_code' | 'awaiting_password' | 'done'
let _pendingCodeResolve     = null;
let _pendingPasswordResolve = null;
let _onStateChange          = null; // (state, extra) => void

function authState() { return _authState; }

/**
 * Begin an MTProto auth session for the given phone number.
 * The returned Promise resolves when the full auth flow (including optional
 * 2FA) is complete.  Intermediate state changes are delivered via
 * `onStateChange(state, extra)`.
 *
 * @param {string}   phone          E.164 format, e.g. "+998901234567"
 * @param {Function} onStateChange  (state: string, extra?: string) => void
 * @returns {Promise<void>}
 */
async function startAuth(phone, onStateChange) {
  if (!API_ID || !API_HASH) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env');
  }

  _onStateChange = onStateChange;
  _authState     = 'awaiting_code';
  onStateChange('awaiting_code');

  const client = _getClient();
  await client.connect();

  await client.start({
    phoneNumber: () => Promise.resolve(phone),

    phoneCode: () => {
      _authState = 'awaiting_code';
      _onStateChange && _onStateChange('awaiting_code');
      return new Promise(resolve => { _pendingCodeResolve = resolve; });
    },

    password: () => {
      _authState = 'awaiting_password';
      _onStateChange && _onStateChange('awaiting_password');
      return new Promise(resolve => { _pendingPasswordResolve = resolve; });
    },

    onError: (err) => {
      _authState = 'idle';
      _onStateChange && _onStateChange('error', err.message);
    },
  });

  _saveSession(client.session.save());
  _authState = 'done';
  _onStateChange && _onStateChange('done');
}

/** Submit the OTP code received on the user's phone. */
function submitCode(code) {
  if (_pendingCodeResolve) {
    _pendingCodeResolve(code.trim());
    _pendingCodeResolve = null;
  }
}

/** Submit the 2FA cloud password (only needed when Telegram prompts for it). */
function submitPassword(password) {
  if (_pendingPasswordResolve) {
    _pendingPasswordResolve(password.trim());
    _pendingPasswordResolve = null;
  }
}

// ─── Connection helpers ────────────────────────────────────────────────────

/**
 * Ensure the user client is connected (reuses an existing session if present).
 * @returns {Promise<TelegramClient>}
 */
async function connect() {
  if (!API_ID || !API_HASH) throw new Error('TELEGRAM_API_ID / TELEGRAM_API_HASH not set');
  const client = _getClient();
  if (!client.connected) await client.connect();
  return client;
}

/**
 * Return true when a valid session exists and the client is (or can be)
 * connected without a new auth flow.
 */
function hasSession() {
  return _loadSession().length > 0;
}

// ─── Chat / group access ───────────────────────────────────────────────────

/**
 * List all dialogs (chats, groups, channels) the user account can see.
 * Returns a simplified array suitable for a Telegram message.
 *
 * @param {number} [limit=50]
 * @returns {Promise<{ id: string, title: string, type: string }[]>}
 */
async function listChats(limit = 50) {
  const client = await connect();
  const dialogs = await client.getDialogs({ limit });
  return dialogs.map(d => ({
    id:    String(d.id),
    title: d.title || d.name || '(no title)',
    type:  d.isChannel ? 'channel' : d.isGroup ? 'group' : 'private',
  }));
}

/**
 * Fetch recent messages from a group/channel (even when forwarding is
 * restricted by the chat's no-forward flag — the MTProto API can still read).
 *
 * @param {string|number} chatId  Numeric chat ID (with or without -100 prefix)
 * @param {number}        [limit=50]
 * @returns {Promise<{ id: number, date: string, sender: string, text: string, hasMedia: boolean }[]>}
 */
async function readGroupMessages(chatId, limit = 50) {
  const client   = await connect();
  const entity   = await client.getEntity(String(chatId));
  const messages = await client.getMessages(entity, { limit });

  return messages.map(m => ({
    id:       m.id,
    date:     new Date(m.date * 1000).toISOString(),
    sender:   m.senderId ? String(m.senderId) : 'unknown',
    text:     m.message || '',
    hasMedia: !!(m.media),
  }));
}

// ─── Group-deletion watchdog ───────────────────────────────────────────────

const POLL_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
let _watchTimer   = null;
let _onGroupGone  = null; // async (chatId, title) => void

/**
 * Start the background watchdog that periodically verifies watched groups
 * are still accessible.  When a group becomes inaccessible (deleted or the
 * user was kicked), `onGroupGone(chatId, title)` is called so the caller can
 * trigger an export.
 *
 * @param {Function} onGroupGone  async (chatId: string, title: string) => void
 */
function startWatchdog(onGroupGone) {
  _onGroupGone = onGroupGone;
  if (_watchTimer) clearInterval(_watchTimer);
  _watchTimer = setInterval(_pollWatchedGroups, POLL_INTERVAL_MS);
  // also run immediately
  _pollWatchedGroups();
}

async function _pollWatchedGroups() {
  const groups = db.getWatchedGroups();
  if (!groups.length) return;

  let client;
  try {
    client = await connect();
  } catch {
    return; // user client not yet authenticated — skip
  }

  for (const g of groups) {
    try {
      await client.getEntity(g.chat_id);
      db.touchWatchedGroup(g.chat_id);
    } catch (err) {
      // Entity not found / forbidden → group is gone
      console.warn(`[userClient] Watched group ${g.chat_id} ("${g.title}") is gone:`, err.message);
      db.removeWatchedGroup(g.chat_id);
      if (_onGroupGone) {
        try { await _onGroupGone(g.chat_id, g.title); } catch { /* caller handles */ }
      }
    }
  }
}

module.exports = {
  authState,
  startAuth,
  submitCode,
  submitPassword,
  connect,
  hasSession,
  listChats,
  readGroupMessages,
  startWatchdog,
};

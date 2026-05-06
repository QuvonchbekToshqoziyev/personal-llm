'use strict';

/**
 * Phase 11 — Chat Exporter
 *
 * Exports a full Telegram group/channel to the local `exports/` directory:
 *   exports/<chatId>/messages.json  — every message as a JSON array
 *   exports/<chatId>/messages.txt   — human-readable plain-text transcript
 *   exports/<chatId>/media/         — all photos and documents (books, PDFs…)
 *
 * Uses the MTProto user client (src/userClient.js) so it can reach private
 * groups even when message forwarding is restricted.
 */

const fs   = require('fs');
const path = require('path');

const { connect } = require('./userClient');

const EXPORTS_DIR = path.resolve(process.cwd(), 'exports');

// ─── Helpers ────────────────────────────────────────────────────────────────

function _ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Sanitise a string so it can be used as a file-system component. */
function _safe(str) {
  return String(str).replace(/[/\\:*?"<>|]/g, '_').slice(0, 60).trim() || 'chat';
}

// ─── Export entry point ──────────────────────────────────────────────────────

/**
 * Export all messages and media from a group/channel to the local filesystem.
 *
 * @param {string|number} chatId    Telegram chat / channel ID
 * @param {Function}      [onProgress]  (done: number, total: number|null) => void
 * @returns {Promise<{ dir: string, messageCount: number, mediaCount: number }>}
 */
async function exportGroup(chatId, onProgress) {
  const client   = await connect();
  const chatIdStr = String(chatId);

  // ── Resolve entity ──────────────────────────────────────────────────────
  let entity;
  try {
    entity = await client.getEntity(chatIdStr);
  } catch (err) {
    throw new Error(`Cannot access chat ${chatIdStr}: ${err.message}`);
  }

  const title    = entity.title || entity.username || chatIdStr;
  const exportId = `${chatIdStr}_${_safe(title)}`;
  const chatDir  = path.join(EXPORTS_DIR, exportId);
  const mediaDir = path.join(chatDir, 'media');
  _ensureDir(chatDir);
  _ensureDir(mediaDir);

  // ── Fetch all messages ──────────────────────────────────────────────────
  const allMessages = [];
  let   offsetId    = 0;
  const batchSize   = 100;

  for (;;) {
    const batch = await client.getMessages(entity, {
      limit:    batchSize,
      offsetId: offsetId,
      reverse:  false,
    });
    if (!batch || batch.length === 0) break;

    allMessages.push(...batch);
    offsetId = batch[batch.length - 1].id;
    onProgress && onProgress(allMessages.length, null);

    if (batch.length < batchSize) break; // last page
  }

  // Sort oldest-first for the transcript
  allMessages.sort((a, b) => a.date - b.date);

  // ── Write messages.json ─────────────────────────────────────────────────
  const jsonData = allMessages.map(m => ({
    id:       m.id,
    date:     new Date(m.date * 1000).toISOString(),
    senderId: m.senderId ? String(m.senderId) : null,
    text:     m.message || '',
    hasMedia: !!(m.media),
  }));
  fs.writeFileSync(
    path.join(chatDir, 'messages.json'),
    JSON.stringify(jsonData, null, 2),
    'utf8'
  );

  // ── Write messages.txt ──────────────────────────────────────────────────
  const txtLines = allMessages.map(m => {
    const ts     = new Date(m.date * 1000).toISOString();
    const sender = m.senderId ? String(m.senderId) : 'unknown';
    const text   = m.message || (m.media ? '[media]' : '');
    return `[${ts}] ${sender}: ${text}`;
  });
  fs.writeFileSync(
    path.join(chatDir, 'messages.txt'),
    txtLines.join('\n'),
    'utf8'
  );

  // ── Download media ──────────────────────────────────────────────────────
  let mediaCount = 0;
  const mediaMessages = allMessages.filter(m => m.media);

  for (const m of mediaMessages) {
    try {
      const filename = _mediaFilename(m);
      const dest     = path.join(mediaDir, filename);

      if (fs.existsSync(dest)) { mediaCount++; continue; } // already downloaded

      const buffer = await client.downloadMedia(m);
      if (buffer && buffer.length > 0) {
        fs.writeFileSync(dest, buffer);
        mediaCount++;
      }
    } catch (err) {
      console.warn(`[exporter] Could not download media for msg ${m.id}:`, err.message);
    }
    onProgress && onProgress(allMessages.length, allMessages.length);
  }

  return { dir: chatDir, messageCount: allMessages.length, mediaCount };
}

/**
 * Derive a safe filename for a message's media attachment.
 * Prefers the original document filename when available.
 *
 * @param {object} msg  GramJS message object
 * @returns {string}
 */
function _mediaFilename(msg) {
  const media = msg.media;

  // Document (PDF, epub, zip, …)
  if (media && media.document) {
    const attr = (media.document.attributes || []).find(a => a.fileName);
    if (attr && attr.fileName) {
      // prefix with message ID to avoid collisions
      return `${msg.id}_${_safe(attr.fileName)}`;
    }
    return `${msg.id}_document`;
  }

  // Photo
  if (media && media.photo) return `${msg.id}_photo.jpg`;

  return `${msg.id}_media`;
}

module.exports = { exportGroup, EXPORTS_DIR };

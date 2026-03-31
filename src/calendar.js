'use strict';

/**
 * Phase 9 — Google Calendar Integration (Placeholder)
 *
 * Full OAuth2 flow is intentionally NOT implemented here.
 * The structure is ready to be wired up with the `googleapis` npm package.
 *
 * Required environment variables (when implemented):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 */

/**
 * Create a Google Calendar event.
 *
 * @param {string} title
 * @param {string} datetime  ISO 8601 datetime string (e.g. '2024-12-01T10:00:00')
 * @returns {Promise<{ id: string|null, htmlLink: string|null }>}
 */
async function createCalendarEvent(title, datetime) {
  // TODO: uncomment and configure once OAuth credentials are available:
  //
  // const { google } = require('googleapis');
  // const auth = new google.auth.OAuth2(
  //   process.env.GOOGLE_CLIENT_ID,
  //   process.env.GOOGLE_CLIENT_SECRET
  // );
  // auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  // const calendar = google.calendar({ version: 'v3', auth });
  // const event = await calendar.events.insert({
  //   calendarId: 'primary',
  //   resource: {
  //     summary: title,
  //     start: { dateTime: datetime, timeZone: 'UTC' },
  //     end:   { dateTime: datetime, timeZone: 'UTC' },
  //   },
  // });
  // return { id: event.data.id, htmlLink: event.data.htmlLink };

  console.warn('[calendar] createCalendarEvent not yet implemented:', { title, datetime });
  return { id: null, htmlLink: null };
}

module.exports = { createCalendarEvent };

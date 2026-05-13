'use strict';

const axios = require('axios');

const YOUTUBE_API_URL = process.env.YOUTUBE_API_URL || 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DEFAULT_MAX_RESULTS = parseInt(process.env.YOUTUBE_MAX_RESULTS || '5', 10);

function getMaxResults() {
  if (Number.isNaN(DEFAULT_MAX_RESULTS)) return 5;
  return Math.min(Math.max(DEFAULT_MAX_RESULTS, 1), 10);
}

async function searchYoutubeVideos(query) {
  if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY is not set.');
  if (!query || !query.trim()) return [];

  try {
    const response = await axios.get(YOUTUBE_API_URL, {
      params: {
        part: 'snippet',
        type: 'video',
        q: query.trim(),
        maxResults: getMaxResults(),
        key: YOUTUBE_API_KEY,
      },
      timeout: 10000,
    });

    const items = Array.isArray(response.data?.items) ? response.data.items : [];

    return items
      .map((item) => item && item.id && item.id.videoId)
      .filter(Boolean)
      .map((videoId) => `https://www.youtube.com/watch?v=${videoId}`);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const apiMessage = err.response?.data?.error?.message;
      throw new Error(apiMessage || 'Failed to reach YouTube API.');
    }

    throw err;
  }
}

module.exports = { searchYoutubeVideos };

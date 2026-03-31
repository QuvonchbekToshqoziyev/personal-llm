'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  bot.sendMessage(chatId, `OK: ${text}`);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

module.exports = bot;

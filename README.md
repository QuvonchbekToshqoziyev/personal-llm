# personal-llm

Personal AI Telegram assistant — Phase 1: Basic Bot

## Architecture

```
User → Telegram Bot → Node.js
                     ↓
                SQLite (index)
                     ↓
               Telegram (content)
                     ↓
                   LLM
```

## Setup

### Prerequisites
- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Installation

```bash
npm install
```

### Configuration

Copy the example environment file and fill in your bot token:

```bash
cp .env.example .env
```

Edit `.env`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### Running

```bash
npm start
```

The bot will start polling for messages and reply to every message with `OK: <message>`.

## Dependencies

| Package | Purpose |
|---|---|
| `node-telegram-bot-api` | Telegram Bot API client |
| `better-sqlite3` | SQLite database (index & metadata) |
| `dotenv` | Environment variable loading |
| `axios` | HTTP client for LLM API calls |

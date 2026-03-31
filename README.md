# personal-llm

Personal AI Telegram assistant — Phases 1–3

## Architecture

```
User → Telegram Bot → Node.js
                     ↓
                SQLite (index)          ← Phase 2
                     ↓
               Telegram (content)
                     ↓
                   LLM                  ← Phase 3
```

## Phases

| Phase | Description |
|---|---|
| 1 | Bootstrap minimal Telegram bot (polling, echo reply) |
| 2 | Persist every message in SQLite for per-chat context retrieval |
| 3 | Send conversation history to an OpenAI-compatible LLM and forward the response |

## Setup

### Prerequisites
- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- An OpenAI-compatible LLM API key and endpoint

### Installation

```bash
npm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here

# LLM — OpenAI-compatible Chat Completions endpoint
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_llm_api_key_here
LLM_MODEL=gpt-4o-mini

# How many recent messages to include as context for each LLM call (default: 10)
LLM_CONTEXT_MESSAGES=10
```

### Running

```bash
npm start
```

The bot will start polling for messages, store them in `data.db` (SQLite), and reply
using the configured LLM. Each chat maintains its own independent conversation history.

## Dependencies

| Package | Purpose |
|---|---|
| `node-telegram-bot-api` | Telegram Bot API client |
| `better-sqlite3` | SQLite database (message index & context) |
| `dotenv` | Environment variable loading |
| `axios` | HTTP client for LLM API calls |

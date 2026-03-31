# personal-llm

Personal AI Telegram assistant — Phases 1–9

## Architecture

```
User → Telegram Bot → Node.js
                     ↓
                SQLite (index)          ← Phase 2
                     ↓
               Telegram (content)       ← Phase 3
                     ↓
                   LLM                  ← Phase 5
```

**Key design rules**
1. DB = index, not storage
2. Telegram = source of content
3. Never scan Telegram blindly — always query DB first
4. Keep context small (configurable window)

## Phases

| Phase | Description | Module |
|---|---|---|
| 1 | Bootstrap minimal Telegram bot | `src/bot.js` |
| 2 | SQLite schema — `messages` + `tasks` tables | `src/db.js` |
| 3 | Mirror every message to private Telegram storage chat | `src/storage.js` |
| 4 | Reconstruct conversation context from DB index | `src/memory.js` |
| 5 | OpenAI-compatible LLM replies with context window | `src/llm.js` |
| 6 | Structured task CRUD backed by SQLite | `src/tasks.js` |
| 7 | AI task detection — LLM returns `{action, ...}` JSON | `src/llm.js` |
| 8 | Command handlers: `/task`, `/tasks`, `/done` | `src/bot.js` |
| 9 | Google Calendar integration (placeholder) | `src/calendar.js` |

## Setup

### Prerequisites
- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A private Telegram chat/channel for message storage (add your bot as admin)
- An OpenAI-compatible LLM API key and endpoint

### Installation

```bash
npm install
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Private chat the bot uses as message archive (bot must be admin)
TELEGRAM_STORAGE_CHAT_ID=-100xxxxxxxxxx

# LLM
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_llm_api_key_here
LLM_MODEL=gpt-4o-mini
LLM_CONTEXT_MESSAGES=10
```

### Running

```bash
npm start
```

## Commands

| Command | Description |
|---|---|
| `/task <title> [due: YYYY-MM-DD]` | Create a task |
| `/tasks` | List all pending tasks |
| `/done <id>` | Mark a task as done |

Any other message is processed by the LLM. If the LLM detects a reminder/task
intent it automatically creates a task; otherwise it replies conversationally.

## File structure

```
src/
  bot.js       Main entry — polling, command routing, message flow
  db.js        SQLite init + schema + queries
  storage.js   Phase 3 — mirror messages to Telegram storage chat
  memory.js    Phase 4 — retrieve context from DB index
  llm.js       Phase 5/7 — LLM with JSON action routing
  tasks.js     Phase 6 — task CRUD
  calendar.js  Phase 9 — Google Calendar placeholder
```

## Dependencies

| Package | Purpose |
|---|---|
| `node-telegram-bot-api` | Telegram Bot API client |
| `better-sqlite3` | SQLite database (message index & task store) |
| `dotenv` | Environment variable loading |
| `axios` | HTTP client for LLM API calls |

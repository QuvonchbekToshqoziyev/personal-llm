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
| 5 | OpenRouter / OpenAI-compatible LLM replies with context window | `src/llm.js` |
| 6 | Structured task CRUD backed by SQLite | `src/tasks.js` |
| 7 | AI task detection — LLM returns `{action, ...}` JSON | `src/llm.js` |
| 8 | Command handlers: `/task`, `/tasks`, `/done` | `src/bot.js` |
| 9 | Google Calendar integration (placeholder) | `src/calendar.js` |

## Setup

### Prerequisites
- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A private Telegram chat/channel for message storage (add your bot as admin)
- An [OpenRouter](https://openrouter.ai) API key (or any OpenAI-compatible provider)
- A YouTube Data API v3 key

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

# LLM — the three variables below MUST all belong to the same provider.
# Mixing an OpenRouter key with the OpenAI URL (or vice-versa) will fail with a 401.
#
#   Provider      LLM_API_URL                                       LLM_API_KEY      LLM_MODEL example
#   OpenRouter    https://openrouter.ai/api/v1/chat/completions     sk-or-v1-...     mistralai/mistral-7b-instruct:free
#   OpenAI        https://api.openai.com/v1/chat/completions        sk-...           gpt-4o-mini
#   Ollama(local) http://localhost:11434/v1/chat/completions        ollama           llama3
#
LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
LLM_API_KEY=sk-or-v1-...          # your OpenRouter key
LLM_MODEL=mistralai/mistral-7b-instruct:free   # must be a model offered by the provider above
LLM_CONTEXT_MESSAGES=10

YOUTUBE_API_KEY=your_youtube_api_key_here
YOUTUBE_MAX_RESULTS=5
```

### Rotating / revoking your API key

If you revoke and regenerate your API key (e.g. on the OpenRouter dashboard), **only `LLM_API_KEY` needs to change**. The URL and model are tied to the provider and the model you chose — not to any specific key — so they stay exactly the same:

```
# Before rotation
LLM_API_URL=https://openrouter.ai/api/v1/chat/completions   ← unchanged
LLM_API_KEY=sk-or-v1-OLD...                                  ← replace this
LLM_MODEL=mistralai/mistral-7b-instruct:free                 ← unchanged

# After rotation
LLM_API_URL=https://openrouter.ai/api/v1/chat/completions   ← same
LLM_API_KEY=sk-or-v1-NEW...                                  ← updated new key
LLM_MODEL=mistralai/mistral-7b-instruct:free                 ← same
```

Restart the bot after saving the updated `.env` and it will use the new key immediately.

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

Tap the **YouTube** button to send a search query. The bot replies with the top YouTube result URLs only.

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
  youtube.js   YouTube search integration
  calendar.js  Phase 9 — Google Calendar placeholder
```

## Dependencies

| Package | Purpose |
|---|---|
| `node-telegram-bot-api` | Telegram Bot API client |
| `better-sqlite3` | SQLite database (message index & task store) |
| `dotenv` | Environment variable loading |
| `axios` | HTTP client for LLM API calls |

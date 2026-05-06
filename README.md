# personal-llm

Personal AI Telegram assistant — Phases 1–11

## Architecture

```
User → Telegram Bot → Node.js
                     ↓
                SQLite (index)          ← Phase 2
                     ↓
               Telegram (content)       ← Phase 3
                     ↓
                   LLM                  ← Phase 5
                     ↓
           MTProto User Client          ← Phase 10
           (private groups, export)
```

**Key design rules**
1. DB = index + settings, not storage
2. Telegram = source of content
3. Never scan Telegram blindly — always query DB first
4. Keep context small (configurable window)
5. MTProto user client accesses groups the bot can't reach

## Phases

| Phase | Description | Module |
|---|---|---|
| 1  | Bootstrap minimal Telegram bot | `src/bot.js` |
| 2  | SQLite schema — `messages`, `tasks`, `settings`, `watched_groups` | `src/db.js` |
| 3  | Mirror every message to private Telegram storage chat | `src/storage.js` |
| 4  | Reconstruct conversation context from DB index | `src/memory.js` |
| 5  | OpenRouter / OpenAI-compatible LLM replies with context window | `src/llm.js` |
| 6  | Structured task CRUD backed by SQLite | `src/tasks.js` |
| 7  | AI task detection — LLM returns `{action, ...}` JSON | `src/llm.js` |
| 8  | Command handlers: `/task`, `/tasks`, `/done` | `src/bot.js` |
| 9  | Google Calendar integration (placeholder) | `src/calendar.js` |
| 10 | MTProto user client — read private groups, watch for deletion | `src/userClient.js` |
| 11 | Chat exporter — messages + photos + documents to local files | `src/exporter.js` |

## Setup

### Prerequisites
- Node.js 18+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A private Telegram chat/channel for message storage (add your bot as admin)
- An [OpenRouter](https://openrouter.ai) API key (or any OpenAI-compatible provider)
- *(For private-group access)* Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)

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
TELEGRAM_OWNER_ID=YOUR_USER_ID_HERE     # your Telegram user ID — /myid shows it
TELEGRAM_STORAGE_CHAT_ID=-100xxxxxxxxxx

# MTProto (required for private-group features)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890abcdef1234567890

# LLM
LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=mistralai/mistral-7b-instruct:free
LLM_CONTEXT_MESSAGES=10
```

### MTProto first-time authentication

After filling in `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`:

1. Start the bot: `npm start`
2. Send `/auth +998901234567` (your phone number in E.164 format)
3. Telegram sends a code to your phone/app — forward it with `/authcode 12345`
4. If 2FA is enabled: `/authpass yourCloudPassword`
5. Done — the session is saved to `data.session` and survives restarts.

### Rotating / revoking your LLM API key

```
/setkey sk-or-v1-NEW...
```

No restart needed — the new key is active immediately.

### Running

```bash
npm start
```

## Commands

### General
| Command | Description |
|---|---|
| `/myid` | Show your Telegram user ID and chat ID |

### Tasks
| Command | Description |
|---|---|
| `/task <title> [due: YYYY-MM-DD]` | Create a task |
| `/tasks` | List all pending tasks |
| `/done <id>` | Mark a task as done |

### MTProto — private group access *(owner only)*
| Command | Description |
|---|---|
| `/auth <phone>` | Start MTProto authentication with your Telegram account |
| `/authcode <code>` | Submit the OTP sent to your phone |
| `/authpass <password>` | Submit your 2FA cloud password (only if asked) |
| `/chats` | List all chats/groups your account can see |
| `/read <chatId> [limit]` | Read recent messages from a private group |

### Chat export *(owner only)*
| Command | Description |
|---|---|
| `/watch <chatId>` | Watch a group for deletion — auto-exports if it disappears |
| `/unwatch <chatId>` | Remove a group from the watchlist |
| `/watched` | List all watched groups |
| `/export <chatId>` | Manually export a group (messages + photos + documents) |

### LLM settings *(owner only)*
| Command | Description |
|---|---|
| `/setmodel <model>` | Switch to a different AI model |
| `/setkey <key>` | Update the LLM API key |
| `/seturl <url>` | Change the LLM API endpoint |
| `/llminfo` | Show current LLM settings |

Any other message is processed by the LLM. If the LLM detects a reminder/task
intent it automatically creates a task; otherwise it replies conversationally.

## How private-group reading works

Telegram's "no-forward" (restricted content) flag prevents the UI from
forwarding or saving messages, but the MTProto protocol lets you **read**
any message in a group you are a member of.  `src/userClient.js` connects as
your personal account (not just the bot) using the GramJS library, giving the
bot access to every chat visible to you — including restricted private groups.

## How the deletion watchdog works

1. Add groups with `/watch <chatId>`.
2. Every 5 minutes the bot checks whether each watched group is still accessible.
3. When a group becomes inaccessible (deleted or you were kicked), the bot
   immediately starts a full export of that group's messages and media to
   `exports/<chatId>/` and notifies you.

## Exported files

```
exports/
  <chatId>_<title>/
    messages.json   — all messages as a JSON array
    messages.txt    — human-readable transcript
    media/
      <msgId>_<filename>   — photos (.jpg) and documents (PDFs, epubs, …)
```

## File structure

```
src/
  bot.js         Main entry — polling, command routing, message flow
  db.js          SQLite init + schema + queries
  storage.js     Phase 3 — mirror messages to Telegram storage chat
  memory.js      Phase 4 — retrieve context from DB index
  llm.js         Phase 5/7 — LLM with JSON action routing + runtime settings
  tasks.js       Phase 6 — task CRUD
  calendar.js    Phase 9 — Google Calendar placeholder
  userClient.js  Phase 10 — MTProto user client (GramJS)
  exporter.js    Phase 11 — full chat export (messages + media)
```

## Dependencies

| Package | Purpose |
|---|---|
| `node-telegram-bot-api` | Telegram Bot API client |
| `telegram` | GramJS — Telegram MTProto user-account client |
| `better-sqlite3` | SQLite database (message index, task store, settings) |
| `dotenv` | Environment variable loading |
| `axios` | HTTP client for LLM API calls |


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

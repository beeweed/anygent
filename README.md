# Vibe Coder — Autonomous ReAct AI Agent

A production-grade, multi-tenant SaaS-ready AI coding agent built with a **FastAPI** backend and a **Next.js 16 + Radix UI** frontend. The agent follows the **ReAct (Reasoning + Acting)** pattern, uses **native function calling** through **OpenRouter** (so any tool-capable model works out of the box), and writes/reads files to a **browser-resident virtual file system** via two registered tools.

## Architecture

```
┌──────────────────────────────┐      SSE      ┌──────────────────────────┐
│  Next.js 16 + Radix UI       │ ─── POST ───▶ │  FastAPI backend         │
│  (chat, file panel, settings)│ ◀── stream ── │  (stateless, scalable)   │
│                              │               │           │              │
│  Browser file system         │               │           ▼              │
│  (localStorage, /home/user/*)│               │  OpenRouter Chat API     │
│  Executes tool_calls locally │               │  (any tool-capable model)│
└──────────────────────────────┘               └──────────────────────────┘
```

### ReAct loop
```
user message
  → POST /api/chat (full history + tools)
    → backend streams SSE: reasoning → content → tool_call → assistant → done
      → frontend executes each tool_call in the browser FS
        → appends tool result to history
          → POST /api/chat again (next iteration)
            → repeat until model produces an assistant message with no tool_calls
            → max_iterations = 1000 (hard ceiling on both client and server)
```

### Why stateless backend?
Each request carries the API key and full conversation history, so the backend stores nothing. This means:
- Trivially horizontally scalable for SaaS (many users on a single instance, or scale-out to N instances behind a load balancer).
- The user's API key is never persisted server-side — it lives only in the user's browser `localStorage`.

## Registered Tools (native function calling)

Both tools follow the exact schemas you specified. They are advertised to the LLM as the `tools` parameter; the model emits a structured `tool_calls` array which the frontend executes against the browser FS.

| Tool | Purpose | Executed in |
|---|---|---|
| `file_write(file_path, content)` | Create or overwrite a file at an absolute `/home/user/...` path | Browser (localStorage) |
| `file_read(file_path)` | Read a file with line numbers; returns structured error if missing | Browser (localStorage) |

## Project layout

```
webapp/
├── backend/                     # FastAPI + Python 3.12
│   ├── requirements.txt
│   ├── run.sh
│   ├── .env.example
│   └── src/
│       ├── main.py              # FastAPI app, /api/health, /api/models, /api/chat
│       ├── agent/
│       │   ├── tools.py         # Native tool schemas (single source of truth)
│       │   ├── prompts.py       # ReAct system prompt
│       │   └── react_agent.py   # Streaming ReAct turn runner (SSE)
│       ├── services/
│       │   └── openrouter.py    # OpenRouter HTTP client + SSE parser
│       └── tests/
│           ├── test_tools.py
│           └── test_react_agent.py
└── frontend/                    # Next.js 16.2.6 + React 19 + Radix UI
    ├── .env.local               # NEXT_PUBLIC_BACKEND_URL
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx         # Main page (chat | files | settings)
        │   └── globals.css
        ├── components/
        │   ├── chat-panel.tsx
        │   ├── chat-message.tsx
        │   ├── file-panel.tsx
        │   ├── settings-dialog.tsx
        │   ├── tool-chip.tsx
        │   ├── thinking-indicator.tsx
        │   ├── reasoning-block.tsx
        │   ├── message-markdown.tsx
        │   └── icons.tsx
        └── lib/
            ├── api.ts           # Backend client (fetch + SSE)
            ├── sse.ts           # Streaming SSE parser
            ├── use-agent.ts     # ReAct loop hook (the agent runtime)
            ├── file-system.ts   # Browser virtual FS + tool executor
            ├── settings.ts      # API key / model persistence
            ├── types.ts         # Shared TS types
            └── utils.ts         # cn(), formatBytes(), …
```

## Backend API

| Method | Path | Description |
|---|---|---|
| `GET`  | `/`             | Service info + tool names |
| `GET`  | `/api/health`   | Liveness probe |
| `GET`  | `/api/tools`    | Returns the OpenAI-format tool schemas |
| `POST` | `/api/models`   | `{ api_key }` → list models with `supports_tools` / `supports_reasoning` flags |
| `POST` | `/api/chat`     | `{ api_key, model, messages[], enable_reasoning, system_prompt? }` → streams `text/event-stream` |

### SSE event types from `/api/chat`
- `start` — `{ turn_id, model }`
- `reasoning` — `{ delta }` (token-level model reasoning when supported)
- `content` — `{ delta }` (token-level visible content)
- `tool_call` — `{ id, name, arguments, parsed_arguments }` (fully assembled)
- `assistant` — `{ message }` (complete assistant message to append to history)
- `done` — `{ turn_id, finish_reason, elapsed_ms }`
- `error` — `{ message, status? }`

## Frontend UX

- **Left**: chat panel — markdown rendering, streamed reasoning, animated thinking indicator, tool-call chips (`create: …` / `read: …`), per-turn iteration badge, stop/reset buttons, status bar.
- **Right**: VS Code-style file panel — tree explorer (folders first, alphabetical), syntax-highlighted viewer (highlight.js / One Dark), breadcrumb, line numbers, copy/download buttons, live updates when the agent writes new files.
- **Settings dialog (Radix)**: paste OpenRouter API key, click **Load models**, search/filter (tool-capable toggle), pick a model, toggle reasoning. All settings persist in `localStorage`.
- **Mobile**: tab-switched chat / files layout below `md:`.

## Running locally

### Backend
```bash
cd backend
pip install -r requirements.txt
./run.sh                      # or: python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8000
pytest src/tests              # 10 tests
```

### Frontend
```bash
cd frontend
# Configure the backend URL the browser will hit
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:8000" > .env.local
npm install
npm run build
npm start                     # or: npx next start -H 0.0.0.0 -p 3000
```

Open <http://localhost:3000>, click the **gear icon** → paste your OpenRouter key → click **Load models** → pick a tool-capable model → save.

### Running in this sandbox (PM2)
Both services are already running:
```bash
pm2 list                      # vibe-backend (8000) + vibe-frontend (3000)
pm2 logs vibe-backend --nostream
pm2 logs vibe-frontend --nostream
```

## Adding another model provider

The provider abstraction lives entirely in `backend/src/services/`. To add e.g. Together or Groq:
1. Add a new service module mirroring `openrouter.py` (`list_models`, `stream_chat`).
2. Pick the provider in the settings dialog (extend the AgentSettings type with `provider`).
3. Route `/api/models` and `/api/chat` to the chosen provider in `main.py`.

The agent loop, SSE protocol, tool registry, and UI need zero changes.

## Adding another tool

1. Define the JSON schema in `backend/src/agent/tools.py` and append it to `ALL_TOOLS`.
2. Implement the executor in `frontend/src/lib/file-system.ts → executeToolCall` (or a new module).
3. Optionally add a chip rendering rule in `components/tool-chip.tsx`.

The model will discover and use the new tool automatically — no changes to the loop or prompt are required.

## Status

- Backend tests: **10/10 passing** (`pytest src/tests`)
- Frontend build: **clean** (Next.js 16.2.6, React 19, Tailwind 4, TypeScript strict)
- Native function calling: **enabled** via OpenRouter `tools` + `tool_choice: "auto"`
- Real-time streaming: **token-level SSE** (reasoning + content + tool_calls)
- Max iterations: **1000** (enforced on client and server)
- CORS: **open** (the backend explicitly enables `*` so the browser can hit a different origin)
- Multi-tenant: **stateless backend**, every request carries its own API key + history

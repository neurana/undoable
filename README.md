<p align="center">
  <img src="ui/assets/logo.svg" alt="Undoable Logo" width="120" height="120">
</p>

<h1 align="center">Undoable</h1>

<p align="center">
  <strong>Security-first, local-first AI agent runtime with transactional execution</strong>
</p>

<p align="center">
  <em>Undo anything. Ship with confidence.</em>
</p>

<p align="center">
  <sub>Inspired by <a href="https://github.com/openclaw/openclaw">OpenClaw</a></sub>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#docker">Docker</a> •
  <a href="#api">API</a> •
  <a href="#configuration">Configuration</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/pnpm-10-orange" alt="pnpm 10">
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License MIT">
</p>

---

## Why Undoable?

Every AI agent action should be **reversible**, **auditable**, and **secure**. Undoable provides a complete runtime for AI agents with built-in safety guarantees:

```
PLAN (read-only) → EXECUTE (isolated) → REVIEW → APPLY → UNDO (rollback)
```

- **Real Undo** — Roll back any agent action, file change, or entire run
- **Security First** — Sandboxed execution, approval gates, audit trails
- **Multi-Provider** — OpenAI, Anthropic, Google, DeepSeek, and local models
- **SWARM Workflows** — DAG-based multi-agent orchestration
- **Channel Integrations** — WhatsApp, Telegram, Discord, Slack
- **Voice & Media** — TTS, STT, vision, and transcription

---

## Installation

### One-Line Install (Native)

```bash
curl -fsSL https://undoable.xyz/install.sh | bash
```

This installs Node.js 22+, PostgreSQL, clones the repo, and sets up everything.

### One-Line Install (Docker)

```bash
curl -fsSL https://undoable.xyz/install.sh | bash -s -- --docker
```

Uses Docker Compose with PostgreSQL, daemon, and UI containers.

### Manual Installation

```bash
# Clone repository
git clone https://github.com/neurana/undoable.git
cd undoable

# Install dependencies
pnpm install

# Setup PostgreSQL database
createdb undoable
psql -d undoable -c "CREATE USER undoable WITH PASSWORD 'undoable_dev';"
psql -d undoable -c "GRANT ALL PRIVILEGES ON DATABASE undoable TO undoable;"
psql -d undoable -c "GRANT ALL ON SCHEMA public TO undoable;"

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://undoable:undoable_dev@localhost:5432/undoable
OPENAI_API_KEY=sk-your-key-here
EOF

# Push schema to database (creates tables)
pnpm db:push

# Build and start
pnpm build
./dev.sh
```

### Onboarding Wizard

First-time users can run the interactive setup wizard:

```bash
# Run the onboarding wizard
pnpm cli onboard

# Or with the CLI directly
undoable onboard
```

The wizard guides you through:
- Security warnings and risk acceptance
- QuickStart vs Manual setup flow
- Provider and model selection
- Channel integrations (Telegram, Discord, Slack, WhatsApp)
- Skills configuration (GitHub, Web Search)
- Profile customization (SOUL.md, USER.md, IDENTITY.md)

---

## Features

### Transactional Execution

Every agent action goes through a controlled pipeline with full rollback support.

| Phase | Description |
|-------|-------------|
| **Plan** | Read-only analysis, no file mutations |
| **Shadow** | Isolated execution in Docker sandbox |
| **Apply** | Approved changes committed to filesystem |
| **Undo** | Full rollback of any run or action |

### Security by Default

- **Sandboxed Execution** — Docker-based isolation for untrusted code
- **Approval Gates** — Review actions before they're applied
- **Tool Policies** — Fine-grained permissions (allowlist, blocklist)
- **Audit Trail** — Every action logged with timestamps
- **Cryptographic Receipts** — Integrity verification for runs

### Multi-Provider LLM Support

| Provider | Models | Features |
|----------|--------|----------|
| **OpenAI** | GPT-5.2, GPT-5.2 Pro, GPT-5.1, GPT-5, GPT-5 Mini, o3, o3 Pro, o4 Mini, GPT-4.1, GPT-4o | Vision, Tools, Thinking |
| **Anthropic** | Claude Opus 4.6, Claude Opus 4.5, Claude Sonnet 4.5, Claude Sonnet 4, Claude 3.5 Haiku | Vision, Tools, Thinking |
| **Google** | Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Pro, Gemini 2.5 Flash | Vision, Tools, 1M context |
| **DeepSeek** | DeepSeek V3.2, DeepSeek R1 | Tag Reasoning, Thinking |
| **Ollama** | Llama 3.3, Qwen 3, DeepSeek R1 (local) | Local, Private |
| **LM Studio** | Any GGUF model | Local, Private |
| **OpenRouter** | 100+ models | Unified API |

### Model Aliases

Use shortcuts instead of full model IDs:

```bash
claude    → Claude Opus 4.6
opus      → Claude Opus 4.6
sonnet    → Claude Sonnet 4.5
haiku     → Claude 3.5 Haiku
gpt5      → GPT-5.2
smart     → GPT-5.2
fast      → GPT-4.1 Mini
cheap     → GPT-4.1 Mini
deepseek  → DeepSeek V3.2
gemini    → Gemini 3 Pro
```

### SWARM Orchestration

Build complex multi-agent workflows with DAG-based orchestration:

- **Nodes** — Individual agent tasks with prompts
- **Edges** — Dependencies and data flow between nodes
- **Schedules** — Cron-based triggers for automation
- **Conditions** — Dynamic branching based on results

### Channel Integrations

Connect your agents to messaging platforms:

| Channel | Status | Features |
|---------|--------|----------|
| **WhatsApp** | ✅ Ready | Business API, media support |
| **Telegram** | ✅ Ready | Bot API, inline queries |
| **Discord** | ✅ Ready | Slash commands, embeds |
| **Slack** | ✅ Ready | Bolt API, blocks |

### Voice & Media

| Feature | Providers |
|---------|-----------|
| **Text-to-Speech (TTS)** | OpenAI, ElevenLabs, edge-tts |
| **Speech-to-Text (STT)** | OpenAI Whisper, Deepgram |
| **Vision** | GPT-5, Claude, Gemini |
| **Transcription** | Whisper, Deepgram |

### Inline Directives

Control agent behavior from chat:

```
/think high      Set thinking level (off, low, medium, high)
/model claude    Switch model
/verbose on      Enable verbose output
/reset           Reset session
/status          Show current status
/help            List commands
```

---

## Quick Start

### Start Development Server

```bash
# Full development mode (daemon + UI with hot reload)
./dev.sh

# Or daemon only
pnpm dev

# Or production mode
pnpm build && pnpm start
```

### Access Points

| Service | URL |
|---------|-----|
| **Web UI** | http://localhost:5173 |
| **API** | http://localhost:7433 |
| **Database** | localhost:5432 |

### CLI Commands

```bash
# Interactive chat
undoable chat --session main

# Plan mode (read-only analysis)
undoable plan "analyze this codebase"

# Shadow execution (isolated sandbox)
undoable shadow "refactor to add validation" --cwd .

# Apply approved changes
undoable apply --run <run_id>

# Rollback changes
undoable undo --run <run_id>

# Verify run integrity
undoable verify <run_id>

# View run receipt
undoable receipt <run_id> --format md
```

---

## Docker

### Quick Start

```bash
cd docker
./start.sh              # Start production
./start.sh --dev        # Start development (hot reload)
./start.sh --logs       # View logs
./start.sh --down       # Stop all services
./start.sh --build      # Rebuild images
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| **postgres** | 5432 | PostgreSQL 16 database |
| **daemon** | 7433 | Undoable API server |
| **ui** | 5173 | Web interface |

### Docker Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production setup |
| `docker-compose.dev.yml` | Development with hot reload |

### Environment Variables

Create `.env` in project root:

```bash
DATABASE_URL=postgresql://undoable:undoable_dev@postgres:5432/undoable
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...
```

---

## API Reference

### Chat (SSE Streaming)

```bash
curl -X POST http://localhost:7433/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, help me with my code",
    "sessionId": "main",
    "model": "claude"
  }'
```

Response is Server-Sent Events stream with:
- `text` — Assistant text chunks
- `thinking` — Reasoning process
- `tool_call` — Tool invocations
- `tool_result` — Tool outputs
- `done` — Completion signal

### Sessions

```bash
GET    /sessions              # List all sessions
GET    /sessions/:id          # Get session details
POST   /sessions              # Create new session
DELETE /sessions/:id          # Delete session
POST   /sessions/:id/reset    # Reset session history
```

### Runs

```bash
GET    /runs                  # List all runs
GET    /runs/:id              # Get run details
POST   /runs/:id/apply        # Apply run changes
POST   /runs/:id/undo         # Undo run changes
GET    /runs/:id/receipt      # Get run receipt
POST   /runs/:id/verify       # Verify run integrity
```

### Actions

```bash
GET    /actions               # List actions
GET    /actions/:id           # Get action details
POST   /actions/:id/undo      # Undo specific action
POST   /actions/undo-last     # Undo last N actions
POST   /actions/undo-all      # Undo all actions
```

### Gateway (JSON-RPC)

```bash
curl -X POST http://localhost:7433/gateway \
  -H "Content-Type: application/json" \
  -d '{"method": "status", "params": {}}'
```

Available methods:

| Method | Description |
|--------|-------------|
| `status` | System status and health |
| `models.list` | Available models |
| `models.switch` | Switch active model |
| `providers.list` | Available providers |
| `thinking.set` | Set thinking level |
| `thinking.status` | Get thinking status |
| `approval.set` | Set approval mode |
| `approval.status` | Get approval status |
| `tts.status` | TTS service status |
| `stt.status` | STT service status |
| `usage.status` | Usage and cost stats |

### SWARM Workflows

```bash
GET    /swarm/workflows              # List workflows
POST   /swarm/workflows              # Create workflow
GET    /swarm/workflows/:id          # Get workflow
PUT    /swarm/workflows/:id          # Update workflow
DELETE /swarm/workflows/:id          # Delete workflow
POST   /swarm/workflows/:id/execute  # Execute workflow
GET    /swarm/workflows/:id/runs     # Get workflow runs
```

### Channels

```bash
GET    /channels                     # List channel configs
POST   /channels                     # Add channel
DELETE /channels/:id                 # Remove channel
POST   /channels/:id/test            # Test channel
```

### Plugins

```bash
GET    /plugins                      # List plugins
POST   /plugins/:name/enable         # Enable plugin
POST   /plugins/:name/disable        # Disable plugin
```

---

## Configuration

### Environment Variables

```bash
# Database (optional - runs without persistence if not set)
DATABASE_URL=postgresql://undoable:undoable_dev@localhost:5432/undoable

# LLM Providers (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...
GROQ_API_KEY=...

# Voice Services (optional)
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...

# Server (optional)
PORT=7433
NODE_ENV=development
```

### Config File

Create `.undoable/config.yaml` in project root or `~/.undoable/config.yaml` globally:

```yaml
daemon:
  port: 7433
  host: 0.0.0.0

security:
  approval_mode: mutate    # off | mutate | always
  exec_mode: allowlist     # off | allowlist | strict
  sandbox: docker          # off | docker

llm:
  default_provider: openai
  default_model: gpt-5.2
  fallback_models:
    - gpt-4.1
    - claude-sonnet-4-5-20250514

thinking:
  enabled: true
  level: medium            # off | low | medium | high

channels:
  whatsapp:
    enabled: false
    phone_id: ""
    token: ""
  telegram:
    enabled: false
    token: ""
  discord:
    enabled: false
    token: ""
  slack:
    enabled: false
    token: ""
```

### CLI Config Commands

```bash
undoable config list                    # List all config
undoable config get daemon.port         # Get specific value
undoable config set daemon.port 9000    # Set value
undoable doctor                         # Check configuration
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web UI (Lit)                             │
│                      localhost:5173                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   Chat   │  │ Sessions │  │   SWARM  │  │ Settings │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Daemon (Node.js)                            │
│                      localhost:7433                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      Routes                              │   │
│  │  Chat │ Sessions │ Runs │ Actions │ SWARM │ Gateway     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     Services                             │   │
│  │  Chat │ Provider │ Actions │ Undo │ Scheduler │ Usage   │   │
│  │  TTS │ STT │ Media │ Channels │ Skills │ Plugins        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                       Tools                              │   │
│  │  Exec │ File │ Web │ Browser │ Media │ Channel │ SWARM  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Middleware                            │   │
│  │  Action Log │ Approval Gate │ Tool Wrapper │ Undo Data  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│    PostgreSQL    │  │   LLM Providers  │  │     Channels     │
│   localhost:5432 │  │ OpenAI/Anthropic │  │ WhatsApp/Telegram│
│                  │  │ Google/DeepSeek  │  │ Discord/Slack    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## Packages

| Package | Description |
|---------|-------------|
| `@undoable/shared` | Shared types, utilities, crypto helpers |
| `@undoable/core` | Engine: phases, tools, agents, policies, undo |
| `@undoable/daemon` | HTTP/SSE server, routes, services |
| `@undoable/cli` | CLI entrypoint and commands |
| `@undoable/llm-sdk` | LLM provider plugin SDK |
| `@undoable/sandbox` | Docker sandbox runtime |

---

## Development

### Prerequisites

- **Node.js** 22+
- **pnpm** 10+
- **PostgreSQL** 16+
- **Docker** (optional, for sandbox)

### Setup

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run tests with watch
pnpm test:watch

# Type check
pnpm check

# Lint
pnpm lint

# Build all packages
pnpm build

# Clean build artifacts
pnpm clean
```

### Database Commands

```bash
# Push schema to database (creates/updates tables)
pnpm db:push

# Generate migration files from schema changes
pnpm db:generate

# Run pending migrations
pnpm db:migrate

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

### Project Structure

```
undoable/
├── packages/
│   ├── shared/          # Shared utilities and types
│   ├── core/            # Core engine and policies
│   ├── daemon/          # HTTP server and services
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   ├── tools/       # Agent tools
│   │   │   ├── actions/     # Action log and undo
│   │   │   ├── channels/    # Messaging integrations
│   │   │   └── plugins/     # Plugin system
│   │   └── package.json
│   ├── cli/             # CLI commands
│   ├── llm-sdk/         # LLM provider SDK
│   └── sandbox/         # Docker sandbox
├── ui/                  # Web UI (Lit)
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── api/         # API client
│   │   └── styles/      # CSS
│   └── package.json
├── docker/              # Docker configs
│   ├── Dockerfile
│   ├── Dockerfile.ui
│   ├── docker-compose.yml
│   └── start.sh
├── drizzle/             # Database migrations
├── drizzle.config.ts    # Drizzle ORM config
├── install.sh           # One-line installer
├── dev.sh               # Development script
└── README.md
```

---

## Troubleshooting

### Common Issues

**Database connection failed**
```bash
# Check PostgreSQL is running
pg_isready

# Check connection string
psql $DATABASE_URL -c "SELECT 1"
```

**API key not working**
```bash
# Verify key is set
echo $OPENAI_API_KEY

# Test with curl
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Docker not starting**
```bash
# Check Docker is running
docker info

# View container logs
docker compose logs -f
```

**Port already in use**
```bash
# Find process using port
lsof -i :7433

# Kill process
kill -9 <PID>
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- TypeScript with strict mode
- ESLint + Prettier
- Conventional commits

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built with security in mind. Ship with confidence.</strong>
</p>

<p align="center">
  <a href="https://github.com/neurana/undoable">GitHub</a> •
  <a href="https://undoable.xyz">Website</a>
</p>

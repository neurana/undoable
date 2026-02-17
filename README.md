<p align="center">
  <img src="ui/public/logo.svg" alt="Undoable Logo" width="80" height="80">
</p>

<h1 align="center">Undoable</h1>

<p align="center">
  <strong>Security-first, local-first AI agent runtime with transactional execution</strong>
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
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

## Why Undoable?

Every AI agent action should be **reversible**, **auditable**, and **secure**. Undoable provides a complete runtime for AI agents with built-in safety guarantees:

```
PLAN (read-only) → EXECUTE (isolated) → REVIEW → APPLY → UNDO (rollback)
```

**Undo anything. Ship with confidence.**

---

## Installation

### One-Line Install

```bash
curl -fsSL https://undoable.xyz/install.sh | bash
```

### With Docker (Recommended)

```bash
curl -fsSL https://undoable.xyz/install.sh | bash -s -- --docker
```

### Manual Installation

```bash
# Clone repository
git clone https://github.com/neurana/undoable.git
cd undoable

# Install dependencies
pnpm install

# Setup database
createdb undoable

# Start development server
./dev.sh
```

---

## Features

### Transactional Execution

Every agent action goes through a controlled pipeline with full rollback support.

| Phase | Description |
|-------|-------------|
| **Plan** | Read-only analysis, no mutations |
| **Shadow** | Isolated execution in sandbox |
| **Apply** | Approved changes committed |
| **Undo** | Full rollback of any run |

### Security by Default

- **Sandboxed execution** - Docker-based isolation
- **Approval gates** - Review before apply
- **Tool policies** - Fine-grained permissions
- **Audit trail** - Every action logged
- **Cryptographic receipts** - Integrity verification

### Multi-Provider LLM Support

| Provider | Models |
|----------|--------|
| OpenAI | GPT-4o, GPT-4.1, GPT-5 |
| Anthropic | Claude Opus, Sonnet, Haiku |
| Google | Gemini Pro, Flash |
| DeepSeek | DeepSeek Chat |
| Groq | Llama, Mixtral |
| Local | Ollama models |

### SWARM Orchestration

Build complex multi-agent workflows with DAG-based orchestration:

- **Nodes** - Individual agent tasks
- **Edges** - Dependencies between nodes
- **Schedules** - Cron-based triggers
- **Conditions** - Dynamic branching

### Channel Integrations

Connect your agents to messaging platforms:

- WhatsApp (via WhatsApp Business API)
- Telegram
- Discord
- Slack

### Voice & Media

- **TTS** - OpenAI, ElevenLabs, edge-tts
- **STT** - OpenAI Whisper, Deepgram
- **Vision** - Image understanding
- **Transcription** - Audio to text

---

## Quick Start

### Start the Server

```bash
# Development mode (daemon + UI with hot reload)
./dev.sh

# Or start daemon only
pnpm dev
```

### Access the UI

Open [http://localhost:5173](http://localhost:5173) in your browser.

### API Endpoint

The daemon runs at [http://localhost:7433](http://localhost:7433).

### Chat via CLI

```bash
# Interactive chat session
undoable chat --session main

# Plan mode (read-only)
undoable plan "analyze this codebase"

# Shadow execution (isolated)
undoable shadow "refactor to add validation" --cwd .

# Apply approved changes
undoable apply --run <run_id>

# Rollback changes
undoable undo --run <run_id>
```

---

## Docker

### Production Setup

```bash
cd docker
./start.sh
```

Services:
- **UI**: http://localhost:5173
- **API**: http://localhost:7433
- **PostgreSQL**: localhost:5432

### Development Setup

```bash
cd docker
./start.sh --dev
```

### Commands

```bash
./start.sh              # Start production
./start.sh --dev        # Start development (hot reload)
./start.sh --logs       # View logs
./start.sh --down       # Stop all services
./start.sh --build      # Rebuild images
```

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: undoable
      POSTGRES_USER: undoable
      POSTGRES_PASSWORD: undoable_dev
    ports:
      - "5432:5432"

  daemon:
    build: .
    ports:
      - "7433:7433"
    environment:
      DATABASE_URL: postgresql://undoable:undoable_dev@postgres:5432/undoable

  ui:
    build:
      dockerfile: docker/Dockerfile.ui
    ports:
      - "5173:5173"
```

---

## API

### Chat (SSE Streaming)

```bash
curl -X POST http://localhost:7433/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "sessionId": "main"}'
```

### Runs

```bash
# List runs
GET /runs

# Get run details
GET /runs/:id

# Apply run
POST /runs/:id/apply

# Undo run
POST /runs/:id/undo
```

### Sessions

```bash
# List sessions
GET /sessions

# Get session
GET /sessions/:id

# Create session
POST /sessions

# Delete session
DELETE /sessions/:id
```

### SWARM Workflows

```bash
# List workflows
GET /swarm/workflows

# Create workflow
POST /swarm/workflows

# Get workflow
GET /swarm/workflows/:id

# Execute workflow
POST /swarm/workflows/:id/execute
```

### Gateway (JSON-RPC)

```bash
curl -X POST http://localhost:7433/gateway \
  -H "Content-Type: application/json" \
  -d '{"method": "status", "params": {}}'
```

Available methods:
- `status` - System status
- `models.list` - Available models
- `models.switch` - Switch active model
- `thinking.set` - Set thinking level
- `approval.set` - Set approval mode

---

## Configuration

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://undoable:undoable_dev@localhost:5432/undoable

# LLM Providers (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...
GROQ_API_KEY=...

# Optional
PORT=7433
NODE_ENV=development
```

### Config File

Create `.undoable/config.yaml` in your project or `~/.undoable/config.yaml` globally:

```yaml
daemon:
  port: 7433

security:
  approval_mode: mutate  # off | mutate | always
  exec_mode: allowlist   # off | allowlist | strict

llm:
  default_provider: openai
  default_model: gpt-4o

thinking:
  enabled: true
  level: medium  # off | low | medium | high
```

### CLI Config

```bash
undoable config list
undoable config get daemon.port
undoable config set daemon.port 9000
undoable doctor  # Check configuration
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         UI (Lit)                            │
│                    localhost:5173                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Daemon (Node.js)                        │
│                    localhost:7433                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │  Chat   │  │  Runs   │  │  SWARM  │  │ Gateway │       │
│  │ Routes  │  │ Routes  │  │ Routes  │  │ Routes  │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│         │           │           │           │              │
│         ▼           ▼           ▼           ▼              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                   Services                          │  │
│  │  Chat │ Provider │ Actions │ Scheduler │ Channels  │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                               │
│                           ▼                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                    Tools                            │  │
│  │  Exec │ File │ Web │ Browser │ Media │ Channel     │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                       │
│                    localhost:5432                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Packages

| Package | Description |
|---------|-------------|
| `@undoable/shared` | Shared types, utilities, crypto helpers |
| `@undoable/core` | Engine: phases, tools, agents, policies |
| `@undoable/daemon` | HTTP/SSE server and orchestration |
| `@undoable/cli` | CLI entrypoint |
| `@undoable/llm-sdk` | LLM provider plugin SDK |
| `@undoable/sandbox` | Docker sandbox runtime |

---

## Development

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+
- Docker (optional)

### Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with watch
pnpm test:watch

# Type check
pnpm check

# Build
pnpm build
```

### Project Structure

```
undoable/
├── packages/
│   ├── shared/      # Shared utilities
│   ├── core/        # Core engine
│   ├── daemon/      # HTTP server
│   ├── cli/         # CLI tool
│   ├── llm-sdk/     # LLM providers
│   └── sandbox/     # Sandbox runtime
├── ui/              # Web UI (Lit)
├── docker/          # Docker configs
└── scripts/         # Build scripts
```

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with security in mind. Ship with confidence.
</p>

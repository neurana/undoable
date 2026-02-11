# Undoable

Security-first, local-first computer agent runtime with transactional execution.

Every AI agent action is **planned**, **sandboxed**, **diffed**, **approved**, and **reversible**.

## How It Works

```
PLAN (read-only)  →  SHADOW (isolated execution)  →  APPLY (after approval)  →  UNDO (rollback)
```

Each run produces a **receipt** with a cryptographic **fingerprint** for verifiability.

## Quick Start

```bash
# Start infrastructure
docker compose -f docker/docker-compose.yml up -d

# Start the daemon
nrn daemon start

# Plan a task (read-only)
nrn plan "refactor this repo to add zod validation"

# Shadow run (safe execution in isolated workspace)
nrn shadow "refactor this repo to add zod validation" --cwd .

# Apply changes (requires approval)
nrn apply --run <run_id>

# Undo changes
nrn undo --run <run_id>

# Stream a run in real time
nrn stream <run_id>

# View receipt
nrn receipt <run_id> --format md

# Verify fingerprint integrity
nrn verify <run_id>
```

## Architecture

| Package | Description |
|---------|-------------|
| `@undoable/shared` | Shared types, utilities, crypto helpers |
| `@undoable/core` | Engine: phases, event bus, tools, agents, policy |
| `@undoable/daemon` | HTTP/SSE server (nrn-agentd) |
| `@undoable/cli` | CLI entrypoint (nrn) |
| `@undoable/llm-sdk` | LLM provider plugin SDK |
| `@undoable/sandbox` | Docker sandbox runtime |

## Key Features

- **Transactional execution** — Plan → Shadow → Apply → Undo
- **Docker-first isolation** — shadow runs execute inside containers
- **Multi-agent** — configurable agents with routing rules and subagent delegation
- **Multi-user** — RBAC (admin/operator/viewer) with per-user audit trails
- **Browser tool** — Playwright-based browser automation inside sandbox
- **HTTP tool** — policy-gated HTTP requests with full audit
- **Pluggable LLMs** — OpenAI, Anthropic, Gemini, Ollama, or manual plans
- **Verifiable runs** — cryptographic fingerprints + receipts
- **Pause/Resume** — checkpoint-based long-running task support
- **Real-time streaming** — SSE for CLI, WebSocket for UI

## Configuration

Config is loaded from three sources (in order of precedence):

1. **Environment variables** — `UNDOABLE_DAEMON_PORT`, `UNDOABLE_JWT_SECRET`, `UNDOABLE_DATABASE_URL`, `UNDOABLE_LOG_LEVEL`
2. **Project config** — `.undoable/config.yaml` in project root
3. **Global config** — `~/.undoable/config.yaml`

```bash
nrn config list          # Show resolved config
nrn config get daemon.port
nrn config set daemon.port 9000
nrn doctor               # Diagnose setup (Node, Docker, Git, config)
```

## Development

```bash
pnpm install
pnpm test                # 423 tests across 43 files
```

Type check all packages:
```bash
for pkg in shared core daemon cli llm-sdk sandbox; do
  npx tsc --noEmit -p packages/$pkg/tsconfig.json
done
```

## License

MIT

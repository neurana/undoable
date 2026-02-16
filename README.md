# Undoable

Security-first, local-first agent runtime with **transactional execution**, **reversible changes**, and **SWARM orchestration**.

Every agent action is planned, isolated, reviewed, and traceable.

## Core Execution Model

```
PLAN (read-only) → SHADOW (isolated execution) → APPLY (approved changes) → UNDO (rollback)
```

Each run includes a receipt and cryptographic fingerprint for integrity verification.

## Why Undoable

- **Security by default**: sandboxed execution, approval gates, policy-controlled tools, and auditable operations.
- **Real undo**: apply only after review, then rollback run effects when needed.
- **Operator visibility**: status, events, receipts, and run history are first-class.
- **SWARM workflows**: build DAG-style multi-node workflows with schedules and dependency edges.

## Security Highlights

- Isolated shadow execution (Docker-first runtime)
- Explicit apply step before mutation
- Tool-level policy enforcement (e.g. web/file/exec constraints)
- Approval and audit trail support
- Fingerprint verification for run receipts

## Undo & Recovery Highlights

- Transactional lifecycle: Plan → Shadow → Apply → Undo
- Reversible run changes via run-level undo
- Job history controls (undo/redo) for scheduling operations
- Pause/resume/cancel for long-running runs

## SWARM Highlights

- Workflow model: **nodes + directed edges** (DAG validation)
- Node schedules mapped to scheduler jobs
- Workflow/node enablement controls job behavior
- Manage through daemon APIs (`/swarm/workflows/...`) and UI SWARM view

## Quick Start

```bash
# Fastest path (terminal-first)
nrn chat --session main

# Optional: stop background daemon when done
nrn daemon stop
```

```bash
# Source/dev quick start (without global install)
pnpm exec tsx packages/cli/src/index.ts chat --session main
```

```bash
# Start infrastructure
docker compose -f docker/docker-compose.yml up -d

# Start daemon
nrn daemon start

# Read-only planning
nrn plan "refactor this repo to add zod validation"

# Isolated shadow run
nrn shadow "refactor this repo to add zod validation" --cwd .

# Apply approved changes
nrn apply --run <run_id>

# Roll back
nrn undo --run <run_id>

# Inspect and verify
nrn stream <run_id>
nrn receipt <run_id> --format md
nrn verify <run_id>
```

## Packages

| Package | Description |
|---------|-------------|
| `@undoable/shared` | Shared types, utilities, crypto helpers |
| `@undoable/core` | Engine: phases, tools, agents, policies, scheduling primitives |
| `@undoable/daemon` | HTTP/SSE server and orchestration services |
| `@undoable/cli` | CLI entrypoint (`nrn`) |
| `@undoable/llm-sdk` | LLM provider plugin SDK |
| `@undoable/sandbox` | Sandbox runtime |

## Configuration

Resolution order:

1. Environment variables
2. Project config: `.undoable/config.yaml`
3. Global config: `~/.undoable/config.yaml`

```bash
nrn config list
nrn config get daemon.port
nrn config set daemon.port 9000
nrn doctor
```

## Development

```bash
pnpm install
pnpm test
```

## License

MIT

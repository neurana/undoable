<p align="center">
  <img src="ui/assets/logo.svg" alt="Undoable Logo" width="120" height="120">
</p>

<h1 align="center">Undoable</h1>

<p align="center">
  <strong>Security-first, local-first AI runtime with undoable actions, channel adapters, and SWARM workflows.</strong>
</p>

<p align="center">
  <em>Everything the AI does is recorded and can be undone.</em>
</p>

<p align="center">
  ☁️ <strong>Want to skip the setup? Use <a href="https://undoable.xyz">Undoable Cloud</a> and get started instantly.</strong>
</p>

## Table of Contents

- [What Undoable Is](#what-undoable-is)
- [Core Guarantees](#core-guarantees)
- [Requirements](#requirements)
- [Install](#install)
- [First Run](#first-run)
- [24/7 Operation](#247-operation)
- [UI and API Endpoints](#ui-and-api-endpoints)
- [CLI Overview](#cli-overview)
- [Settings Console (UI + CLI)](#settings-console-ui--cli)
- [Undo and Redo](#undo-and-redo)
- [SWARM Workflows](#swarm-workflows)
- [Skills](#skills)
- [Channels and Pairing](#channels-and-pairing)
- [Economy Mode and Spend Controls](#economy-mode-and-spend-controls)
- [Media Reliability (Images and Audio)](#media-reliability-images-and-audio)
- [Configuration](#configuration)
- [Manual Setup from Source](#manual-setup-from-source)
- [Docker Operations](#docker-operations)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Project Layout](#project-layout)
- [Security](#security)
- [License](#license)

## What Undoable Is

Undoable is an agent runtime for people who want real execution power without losing control.

Core loop:

```text
PLAN -> EXECUTE -> REVIEW -> APPLY -> UNDO
```

Undoable includes:

- A daemon API and tool runtime
- A web UI for chat, history, undo/redo, skills, channels, and SWARM/canvas
- A CLI (`nrn`, alias `undoable`) for onboarding, operations, and diagnostics
- Persistent local state in `~/.undoable`

## Core Guarantees

`Undo Guarantee` (strict mode) is on by default.

- Every tool call is recorded
- Undoable mutations are restorable via undo/redo
- Non-undoable mutate/exec actions are blocked in strict mode
- You can switch to power mode (allow irreversible actions) when needed

Important scope boundary:

- File edits and supported tool mutations can be undone
- External side effects (for example third-party APIs, sent messages, remote systems) may not be fully reversible
- Use `undo(action:"list")` / `nrn undo list` to inspect `recordedCount`, `undoable`, `redoable`, and `nonUndoableRecent`

## Requirements

- Node.js `>=22.0.0`
- pnpm `>=10`
- PostgreSQL `16+` (native mode)
- Docker + Docker Compose (docker mode)

`pnpm build` enforces the Node minimum and exits early with a clear message if your version is too old.

## Install

### Native Install

```bash
curl -fsSL https://undoable.xyz/install.sh | bash
```

This installer:

- Installs prerequisites when needed (Node, pnpm, Git, PostgreSQL)
- Clones/updates the repository
- Builds project artifacts
- Bootstraps built-in skills into `~/.undoable/skills`
- Creates CLI wrappers: `undoable`, `nrn`, `undoable-daemon`, `undoable-dev`
- Applies DB schema unless `--skip-db`

### Docker Install

```bash
curl -fsSL https://undoable.xyz/install.sh | bash -s -- --docker
```

This installer:

- Clones/updates the repository
- Builds and starts Docker services
- Applies DB schema in daemon container
- Persists Undoable home (including skills) in Docker volume `undoable-home`

### Installer Options

```bash
curl -fsSL https://undoable.xyz/install.sh | bash -s -- --help
```

Common options:

- `--docker`
- `--git-dir <path>` (or `--dir <path>`)
- `--no-git-update`
- `--skip-db`
- `--dry-run`
- `--verbose`

## First Run

### Start App (daemon + UI)

```bash
undoable start
# or
nrn start
```

### Start in Economy Mode

```bash
undoable start --economy
```

### Daemon Only

```bash
undoable start --no-ui
# or
undoable-daemon
```

## 24/7 Operation

For long-running production usage, use one of these modes:

- Docker mode (`restart: unless-stopped`) for server deployments
- Native daemon supervisor mode (`nrn daemon start`) for local/VM installs

Native daemon lifecycle:

```bash
nrn daemon start
nrn daemon status
nrn daemon mode
nrn daemon stop
```

Notes:

- `nrn daemon start` now runs in supervised mode by default and auto-restarts after crashes
- Use `nrn daemon start --no-supervise` only if you explicitly want direct unmanaged mode
- `nrn daemon mode normal|drain|paused` lets you temporarily block new runs without stopping the daemon
- Daemon logs are written to `~/.undoable/logs/daemon.log`
- Health endpoint remains `http://127.0.0.1:7433/health` (or your configured port)

OS service lifecycle (recommended for native 24/7):

```bash
nrn daemon service install --port 7433
nrn daemon service status
nrn daemon service restart
nrn daemon service uninstall
```

- macOS: uses `launchd` user agent
- Linux: uses `systemd --user` unit
- Service install expects built artifacts (`pnpm build`) so it can run `dist/daemon/index.mjs`
- On Linux, enable linger for true logout-proof 24/7 operation:

```bash
sudo loginctl enable-linger "$USER"
```

### Development Hot Reload

```bash
undoable-dev
```

### Onboarding

```bash
undoable onboard
# or
nrn onboard

# one-command guided defaults
nrn quickstart
```

## UI and API Endpoints

- UI: `http://localhost:5173`
- API: `http://localhost:7433`
- Health: `http://localhost:7433/health`

## CLI Overview

Show all commands:

```bash
nrn --help
```

Main command groups:

- `setup`, `quickstart`, `onboard`, `start`, `status`, `doctor`, `daemon`
- `chat`, `agent`, `swarm`, `run`, `undo`
- `plan`, `shadow`, `apply`, `verify`, `receipt`, `stream`, `settings`
- `channels`, `pairing`, `config`, `plugin`

Useful daemon lifecycle commands:

```bash
nrn daemon start
nrn daemon status
nrn daemon mode paused --reason "maintenance"
nrn daemon mode normal
nrn daemon stop
```

Interactive terminal chat:

```bash
nrn chat --economy
```

Inside chat:

- `/help`
- `/status`
- `/sessions`
- `/economy on|off|status`
- `/thinking on|off`
- `/abort`

## Settings Console (UI + CLI)

Undoable now has a standalone settings console at:

- UI route: `http://localhost:5173/settings`
- Sidebar: click `Settings` to open the full page (not modal)

Sections include Runtime, Advanced, Gateway, Config Console, Models, API Keys, Undo, Voice, and Browser.

Gateway section supports editing daemon profile values:

- bind mode (`loopback|all|custom`)
- host
- port
- auth mode (`open|token`) + token rotate
- security policy (`strict|balanced|permissive`)

When a gateway change needs restart, UI shows `restart required`.

CLI parity:

```bash
nrn settings status
nrn settings set --preset economy

nrn settings daemon status
nrn settings daemon set --bind loopback --auth token --rotate-token
nrn settings daemon set --port 7433 --security strict
```

## Undo and Redo

CLI:

```bash
nrn undo list
nrn undo last 2
nrn undo one <action-id>
nrn undo all
```

Tool API (`undo` tool) supports:

- `list`
- `one`
- `last`
- `all`
- `redo_one`
- `redo_last`
- `redo_all`

`redo_one` can run without an `id` and auto-select the most recent redoable action.

## SWARM Workflows

Undoable supports multi-node SWARM workflows with editable nodes and edges.

CLI examples:

```bash
nrn swarm list
nrn swarm create --name "sdr-automation"
nrn swarm add-node <workflowId> --name source --prompt "Collect new leads"
nrn swarm add-node <workflowId> --name outreach --prompt "Send welcome email"
nrn swarm link <workflowId> --from <sourceNodeId> --to <outreachNodeId>
```

Canvas and SWARM views in UI are for visual design, run tracing, and node-level edits.

## Skills

Built-in skills are bootstrapped by installer/startup:

- `github`
- `web-search`

Skill sources discovered by daemon include:

- `~/.undoable/skills`
- `~/.codex/skills`
- `~/.claude/skills`
- `~/.cursor/skills`
- `~/.cursor/skills-cursor`
- `~/.windsurf/skills`
- `~/.codeium/windsurf/skills`
- `~/.opencode/skills`

If CLI-detected installed skills do not show as cards yet, use Skills `Refresh` and check local skill directories.

## Channels and Pairing

Current channel adapters:

- `telegram`
- `discord`
- `slack`
- `whatsapp`

Status/probe/capabilities/logs/resolve surfaces:

```bash
nrn channels status --details
nrn channels probe --channel telegram
nrn channels capabilities
nrn channels logs --channel slack --limit 100
nrn channels resolve --channel discord "#sales" "@owner"
```

Pairing approval lifecycle:

```bash
nrn pairing list
nrn pairing approve --channel telegram --code ABC123
nrn pairing reject --request-id <id>
nrn pairing revoke --channel telegram --user-id <user-id>
```

## Economy Mode and Spend Controls

Economy mode is optional and off by default.

When enabled, Undoable reduces token usage by tightening runtime budgets and context policies while preserving core functionality.

Runtime controls:

- UI header toggle (`Economy`)
- `nrn start --economy`
- `nrn chat --economy`
- `/economy on|off|status` in chat

Budget guardrails (rolling 24h):

- `UNDOABLE_DAILY_BUDGET_USD`
- `UNDOABLE_DAILY_BUDGET_AUTO_PAUSE`

## Media Reliability (Images and Audio)

Defaults:

- Request body limit: `32MB` (`UNDOABLE_BODY_LIMIT_MB`)
- Attachment limit: `10MB` (`UNDOABLE_ATTACHMENT_MAX_MB`)
- STT audio limit: `20MB` (`UNDOABLE_STT_MAX_AUDIO_MB`)

If uploads fail with `413`:

1. Increase `UNDOABLE_BODY_LIMIT_MB`
2. Optionally increase `UNDOABLE_ATTACHMENT_MAX_MB` and `UNDOABLE_STT_MAX_AUDIO_MB`
3. Restart daemon

## Configuration

Copy and edit:

```bash
cp .env.example .env
```

Minimal required:

```bash
# macOS local default
DATABASE_URL=postgresql://localhost:5432/undoable
# Linux bootstrap default
# DATABASE_URL=postgresql://undoable:undoable_dev@localhost:5432/undoable
OPENAI_API_KEY=sk-...
```

`DATABASE_URL` should include an explicit username (`postgresql://user[:password]@host:port/db`).
If username is omitted, the Postgres driver can fall back to your OS user and fail authentication.

Common server/runtime:

```bash
NRN_PORT=7433
NODE_ENV=development
UNDOABLE_ALLOW_IRREVERSIBLE_ACTIONS=0
```

Provider keys (any one is enough to start):

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `DEEPSEEK_API_KEY`
- `GROQ_API_KEY`

Voice keys (optional):

- `ELEVENLABS_API_KEY`
- `DEEPGRAM_API_KEY`

Channel keys (optional):

- `WHATSAPP_PHONE_ID`
- `WHATSAPP_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `DISCORD_BOT_TOKEN`
- `SLACK_BOT_TOKEN`

## Manual Setup from Source

```bash
git clone https://github.com/neurana/undoable.git
cd undoable
pnpm install
cp .env.example .env
```

Apply schema and run:

```bash
pnpm db:push
pnpm dev
```

Build production artifacts:

```bash
pnpm build
pnpm start
```

## Docker Operations

From repository root:

```bash
cd docker
./start.sh --build
```

Other operations:

```bash
./start.sh --check
./start.sh --logs
./start.sh --down
./start.sh --dev
./start.sh --help
```

## Troubleshooting

### 1) Skills installed but not visible in Installed tab

- Click Skills `Refresh`
- Confirm entries with Skills CLI panel (`list`)
- Check skill folders under supported directories listed in [Skills](#skills)

### 2) `413 Request body is too large`

- Increase `UNDOABLE_BODY_LIMIT_MB`
- For voice/images also verify `UNDOABLE_STT_MAX_AUDIO_MB` and `UNDOABLE_ATTACHMENT_MAX_MB`
- Restart daemon

### 3) Tool call blocked by Undo Guarantee mode

- Keep strict mode for safest behavior
- If you intentionally need irreversible actions, enable them in run settings or set:

```bash
UNDOABLE_ALLOW_IRREVERSIBLE_ACTIONS=1
```

### 4) Persistence issues

- Validate `DATABASE_URL`
- Run `pnpm db:push`
- Check daemon logs for DB initialization warnings

### 5) Docker services up but UI cannot call API

```bash
cd docker
./start.sh --check
./start.sh --down
./start.sh --build
```

### 6) `pnpm build` fails immediately with Node version error

- Run `node -v`
- Install/activate Node `22+`
- Retry `pnpm build`

### 7) `nrn daemon start` reports process running but unhealthy

- Run `nrn daemon status`
- Inspect `~/.undoable/logs/daemon.log`
- Restart cleanly:

```bash
nrn daemon stop
nrn daemon start
```

## Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

Database helpers:

```bash
pnpm db:push
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Project Layout

```text
packages/
  core/      # runtime engine, scheduler, undo primitives
  daemon/    # API routes, services, tool runtime
  cli/       # terminal command surface
  shared/    # shared types/utilities
ui/          # web UI (Lit + Vite)
docker/      # compose files and launcher
install.sh   # one-line installer
```

## Security

Undoable can execute commands, read/write files, and call external systems. Use least privilege and approvals for sensitive workflows.

Recommended posture:

- Keep `Undo Guarantee` strict by default
- Keep approvals on for mutation-heavy workflows
- Use sandboxing/isolation where possible
- Review third-party skills before enabling

## Follow

Find me on X/Twitter: [@BrunoHenri52285](https://x.com/BrunoHenri52285)

## License

MIT

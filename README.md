<p align="center">
  <img src="ui/assets/logo.svg" alt="Undoable Logo" width="120" height="120">
</p>

<h1 align="center">Undoable</h1>

<p align="center">
  <strong>Security-first, local-first AI runtime with undoable actions and swarm workflows.</strong>
</p>

<p align="center">
  <em>Undo anything. Ship with confidence.</em>
</p>

## What It Is

Undoable is an AI runtime built around safe execution:

- Every action is recorded
- Risky actions can be gated by approval
- Runs can be undone and replayed
- Workflows can be orchestrated via SWARM nodes

Core loop:

```text
PLAN -> EXECUTE -> REVIEW -> APPLY -> UNDO
```

## Requirements

- Node.js `22+`
- pnpm `10+`
- PostgreSQL `16+` (native mode)
- Docker + Docker Compose (docker mode)

## Install

### Native (recommended for local development)

```bash
curl -fsSL https://undoable.xyz/install.sh | bash
```

What this does:

- Installs prerequisites (if missing)
- Clones/updates Undoable
- Builds the project
- Bootstraps built-in skills (`github`, `web-search`) into `~/.undoable/skills`
- Creates CLI wrappers (`undoable`, `nrn`, `undoable-daemon`, `undoable-dev`)
- Applies DB schema (unless `--skip-db`)

### Docker

```bash
curl -fsSL https://undoable.xyz/install.sh | bash -s -- --docker
```

What this does:

- Clones/updates Undoable
- Builds and starts Docker services
- Applies DB schema in the daemon container
- Persists daemon skill state in a Docker volume (`undoable-home`)

Built-in skills are bootstrapped automatically on daemon startup (first run).

### Installer options

```bash
curl -fsSL https://undoable.xyz/install.sh | bash -s -- --help
```

Useful options:

- `--docker`
- `--git-dir <path>`
- `--no-git-update`
- `--skip-db`
- `--dry-run`

## First Run

### Native

```bash
undoable start
# or
nrn start
```

For development hot reload:

```bash
undoable-dev
```

Daemon only:

```bash
undoable-daemon
```

Start directly in economy mode:

```bash
undoable start --economy
```

### Docker

```bash
cd docker
./start.sh --build
```

Other Docker commands:

```bash
./start.sh --logs
./start.sh --down
./start.sh --dev
./start.sh --help
```

## Access Points

- UI: `http://localhost:5173`
- API: `http://localhost:7433`
- Health: `http://localhost:7433/health`

## Onboarding and CLI

Open onboarding wizard:

```bash
undoable onboard
# alias
nrn onboard
```

Show all CLI commands:

```bash
undoable --help
```

Interactive terminal chat economy controls:

```bash
undoable chat --economy
# inside chat:
/economy on
/economy off
/economy status
```

Main command groups:

- `setup`, `quickstart`, `onboard`, `start`, `status`, `doctor`
- `chat`, `agent`, `swarm`, `run`, `undo`
- `plan`, `shadow`, `apply`, `verify`, `receipt`, `stream`
- `config`, `plugin`

## Environment Variables

Minimal:

```bash
DATABASE_URL=postgresql://undoable:undoable_dev@localhost:5432/undoable
OPENAI_API_KEY=sk-...
```

Optional provider keys:

- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `DEEPSEEK_API_KEY`
- `GROQ_API_KEY`

Server:

```bash
NRN_PORT=7433
NODE_ENV=development
```

Economy mode controls (optional):

```bash
UNDOABLE_ECONOMY_MODE=1
UNDOABLE_ECONOMY_MAX_ITERATIONS=6
UNDOABLE_ECONOMY_TOOL_RESULT_CHARS=8000
UNDOABLE_ECONOMY_CONTEXT_MAX_TOKENS=64000
UNDOABLE_ECONOMY_CONTEXT_THRESHOLD=0.55
```

Media upload limit (fixes 413 for large files):

```bash
UNDOABLE_BODY_LIMIT_MB=64
# or
UNDOABLE_BODY_LIMIT_BYTES=67108864
```

## Manual Setup (from source)

```bash
git clone https://github.com/neurana/undoable.git
cd undoable
pnpm install

# create .env (edit keys)
cat > .env << 'ENVEOF'
DATABASE_URL=postgresql://undoable:undoable_dev@localhost:5432/undoable
OPENAI_API_KEY=sk-your-key-here
ENVEOF

# create/update DB schema
pnpm db:push

# run
pnpm dev
# or
./dev.sh
```

## Reliability Notes

- If image/audio uploads fail with `413 Request body is too large`, increase `UNDOABLE_BODY_LIMIT_MB` and restart daemon.
- If chat history or jobs do not persist, check `DATABASE_URL` and run `pnpm db:push`.
- If Docker services are up but UI cannot talk to API, restart with `./start.sh --down && ./start.sh --build`.

## Economy Mode

Economy mode is optional and off by default. Full-power behavior remains the default.

When enabled, Undoable reduces token burn by:

- Capping effective iterations per request
- Tightening tool-result context size
- Compacting context earlier
- Disabling thinking output/costly reasoning paths
- Using a shorter runtime system prompt profile

## Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

Database commands:

```bash
pnpm db:push
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Project Layout

```text
packages/
  core/      # engine, scheduler, undo primitives
  daemon/    # API routes, services, tool runtime
  cli/       # terminal commands
  shared/    # shared types/utilities
ui/          # web UI (Lit + Vite)
docker/      # compose files and launcher
install.sh   # one-line installer entrypoint
```

## Security

Undoable can execute commands and modify files. Run with least privilege and review approval/sandbox settings before enabling broad tool access.

## License

MIT

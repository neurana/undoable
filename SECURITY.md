# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly by emailing the maintainers directly. Do not open a public issue.

## Security Model

Undoable is designed with security as a first-class concern:

- **Default-deny capabilities** — every tool action requires an explicit grant
- **Docker isolation** — all execution runs inside containers, never directly on the host
- **Network isolation** — containers default to `--network=none`; network access is opt-in per capability
- **No direct LLM access to OS** — LLMs propose plans; the engine validates and executes through policy
- **Cryptographic fingerprints** — SHA-256 of canonical run data for tamper detection
- **Multi-user RBAC** — admin/operator/viewer roles with per-user audit trails
- **Timing-safe auth** — prevents timing attacks on token comparison
- **Resource limits** — CPU, memory, disk, and timeout caps on sandbox containers
- **Audit trail** — every event is persisted with user attribution

---
name: github
description: Interact with GitHub using the gh CLI for issues, PRs, CI runs, and API queries.
metadata: {"undoable": {"emoji": "🐙", "requires": {"bins": ["gh"]}}}
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub. Always specify `--repo owner/repo` when not in a git directory.

## Pull Requests

```bash
gh pr list --repo owner/repo --limit 10
gh pr checks 55 --repo owner/repo
gh pr view 55 --repo owner/repo
```

## Issues

```bash
gh issue list --repo owner/repo --limit 10
gh issue create --repo owner/repo --title "Bug" --body "Description"
```

## CI / Workflow Runs

```bash
gh run list --repo owner/repo --limit 10
gh run view <run-id> --repo owner/repo
gh run view <run-id> --repo owner/repo --log-failed
```

## API for Advanced Queries

```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

## JSON Output

Most commands support `--json` for structured output with `--jq` filtering:

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```

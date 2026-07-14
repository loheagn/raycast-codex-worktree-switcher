# Changelog

## Unreleased

- Sort sessions globally by Codex's recent activity timestamp instead of grouping them by repository.
- Read Codex Desktop metadata databases directly in read-only mode so current Desktop sessions are discoverable.
- Include valid main Git checkouts instead of filtering them out.
- Label checkouts by their branch name, falling back to `Detached · <commit>` for detached HEADs.

## 0.1.0 - 2026-07-14

- Add a Raycast command for switching Zed to active Codex-linked Git worktrees.

<!--
SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
SPDX-License-Identifier: MIT
-->

# Contributing

Thanks for considering a contribution to Codex Worktree Switcher.

## Development setup

You need macOS, Raycast, Zed, Codex Desktop, Git, SQLite, Node.js 22.22.2 or newer, and npm.

```bash
git clone https://github.com/loheagn/raycast-codex-worktree-switcher.git
cd raycast-codex-worktree-switcher
npm ci
npm run dev
```

The development command imports the extension into Raycast. Stop it with `Ctrl-C` after the initial import if you do not need hot reload.

## Before opening a pull request

Run the full validation suite:

```bash
npm run check
```

Use Conventional Commits such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`. Keep changes focused and update `CHANGELOG.md` for user-visible behavior.

## Privacy

Never commit or attach any of the following:

- files from `~/.codex`, including SQLite databases and JSONL conversation logs;
- real conversation content or generated session titles;
- private repository names, absolute paths, internal hostnames, or access tokens;
- screenshots that have not been checked for sensitive information.

Use synthetic fixtures in tests and documentation.

## Licensing

Contributions are accepted under the repository's MIT License. Add SPDX headers to new handwritten source files, using the copyright holder that applies to your contribution.

<!--
SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
SPDX-License-Identifier: MIT
-->

# Codex Worktree Switcher

[![CI](https://github.com/loheagn/raycast-codex-worktree-switcher/actions/workflows/ci.yml/badge.svg)](https://github.com/loheagn/raycast-codex-worktree-switcher/actions/workflows/ci.yml)

English | [简体中文](README.zh-CN.md)

A local-first macOS Raycast extension that finds Codex Desktop sessions and opens their Git checkouts in Zed.

![Codex Worktree Switcher showing synthetic session data](media/screenshot.jpg)

> [!NOTE]
> This is an unofficial community project. It is not affiliated with or endorsed by OpenAI, Raycast, or Zed Industries.

## Features

- Lists unarchived local Codex Desktop sessions by recent activity.
- Displays the session title and `repository › branch`; detached checkouts use `Detached · <commit>`.
- Searches session titles, repositories, branches, commit identifiers, and paths.
- Opens a checkout in the existing Zed window by default, or in a new window.
- Copies checkout paths, reveals them in Finder, and refreshes metadata on demand.
- Keeps separate Codex sessions as separate items even when they share a checkout.

## Requirements

- macOS
- [Raycast](https://www.raycast.com/)
- Codex Desktop
- [Zed](https://zed.dev/)
- Git and the system SQLite CLI
- Node.js 22.22.2 or newer and npm for installation from source

## Install from source

This extension is not currently distributed through the Raycast Store. Clone and import it locally:

```bash
git clone https://github.com/loheagn/raycast-codex-worktree-switcher.git
cd raycast-codex-worktree-switcher
npm ci
npm run dev
```

When Raycast reports that the extension is ready, open Raycast and run **Switch Codex Worktree**. You can stop the development process with `Ctrl-C` after the initial import; keep it running only when you want hot reload while editing the extension.

## Usage

Items are sorted globally by Codex's latest activity timestamp rather than grouped by repository. The subtitle identifies the checkout:

- attached HEAD: `repository › feature/branch-name`
- detached HEAD: `repository › Detached · 398aecb5`

The default action runs `zed --existing <checkout>`. Additional actions open a new Zed window, copy the checkout path, reveal it in Finder, refresh the list, or open extension preferences.

## Preferences

| Preference | Default       | Purpose                                         |
| ---------- | ------------- | ----------------------------------------------- |
| Codex Home | `~/.codex`    | Directory containing Codex Desktop metadata     |
| Zed App    | `dev.zed.Zed` | Zed application used to resolve the bundled CLI |

## Privacy and security

The extension is local-only and makes no network requests. It reads only lifecycle and display metadata:

- session ID and display title;
- working directory and source type;
- archive state and activity timestamps;
- Git checkout root, common directory, branch, or detached commit.

Codex SQLite databases are opened through `/usr/bin/sqlite3` with both `-readonly` and `PRAGMA query_only`. The extension deliberately does not query `preview`, `first_user_message`, rollout paths, JSONL files, or conversation bodies. It does not start Codex App Server, upload data, or create caches and conversation history.

Every checkout is validated with `/usr/bin/git` before display and again before Zed is opened. All external commands use argument arrays with shell execution disabled.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Filtering behavior

The list includes only sessions that are:

- unarchived and owned by the current local user;
- backed by a still-existing local Git checkout;
- associated with a supported top-level Codex source;
- verifiable against a compatible Codex state database.

Main checkouts and linked worktrees are supported. Remote, SSH, container, deleted, and non-Git directories are hidden. Catalog-only records are hidden until their archive state can be verified.

## Troubleshooting

If the list is empty:

1. Start Codex Desktop at least once and confirm that it has local sessions.
2. Check the **Codex Home** preference.
3. Confirm that the session is unarchived and its directory still exists.
4. Verify the checkout:

   ```bash
   /usr/bin/git -C /path/to/repository worktree list
   ```

The extension prefers the highest state database version with a compatible candidate. Within that version, a readable root-layout database is authoritative; a compatible legacy-layout database is used only when no root candidate for that version can be read. If no candidate can be validated, loading stops with an error. If Zed cannot be opened, select the Zed application again in extension preferences.

## Known limitations

- Codex Desktop metadata tables are a private schema and may change without notice.
- A legacy metadata fallback can be older than a root database; it is used only when the selected schema version has no readable root candidate.
- Active/idle state is not stored in the Desktop metadata databases, so the extension cannot accurately show a “working” indicator.
- The extension does not create, repair, restore, archive, or delete worktrees or Codex sessions.
- This is a Raycast overlay command, not a persistent sidebar inside Zed.

## Development

```bash
npm ci
npm run check
npm run dev
```

`npm run check` runs unit tests, TypeScript, Raycast linting, formatting checks, and a production build. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

The initial release was validated with macOS 26.6, Raycast 1.104.22, Codex Desktop 26.707.71524, Zed 1.10.3, and Node.js 22.22.2 in CI.

## Releases

GitHub releases contain source code; Raycast imports and builds the extension locally. Release notes are maintained in [CHANGELOG.md](CHANGELOG.md).

## Maintainer

loheagn <loheagn@icloud.com>

## License

[MIT](LICENSE) © 2026 loheagn

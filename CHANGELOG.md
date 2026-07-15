# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open Codex Git checkouts in Visual Studio Code or Visual Studio Code Insiders.
- Choose the default editor used by the existing-window and new-window actions.
- Request Codex Desktop to open the selected session when opening its Git checkout in the configured editor.

## [0.1.0] - 2026-07-14

### Added

- Browse unarchived Codex Desktop sessions in a globally recency-sorted Raycast list.
- Read local Codex metadata databases in SQLite read-only mode without starting App Server.
- Validate main Git checkouts and linked worktrees before opening them in Zed.
- Label checkouts by branch name or `Detached · <commit>` when HEAD is detached.
- Open a checkout in the existing Zed window or a new window, copy its path, or reveal it in Finder.

[Unreleased]: https://github.com/loheagn/raycast-codex-worktree-switcher/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/loheagn/raycast-codex-worktree-switcher/releases/tag/v0.1.0

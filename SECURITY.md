<!--
SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
SPDX-License-Identifier: MIT
-->

# Security Policy

## Supported versions

Security fixes are provided for the latest tagged release and the current `main` branch.

## Reporting a vulnerability

Do not report security or privacy vulnerabilities in a public issue. Use GitHub's private vulnerability reporting at:

https://github.com/loheagn/raycast-codex-worktree-switcher/security/advisories/new

If private reporting is unavailable, email `loheagn@icloud.com` with a minimal description. Do not attach Codex databases, JSONL files, conversation content, private repository data, credentials, or other sensitive files. You will receive an acknowledgement as soon as practical, followed by status updates while the report is investigated.

## Security model

The extension reads a small set of local Codex Desktop metadata fields with SQLite read-only mode, validates local Git checkouts, invokes the configured editor with an argument array, and passes a validated local `codex:` deep link to `/usr/bin/open`. It does not directly make network requests, start Codex App Server, or persist conversation data.

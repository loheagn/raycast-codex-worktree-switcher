<!--
SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
SPDX-License-Identifier: MIT
-->

# Codex Worktree Switcher

一个仅适用于 macOS 的 Raycast 扩展，用于浏览本地 Codex 会话，并在 Zed 中打开会话对应的 Git linked worktree。

## 本地安装

需要 Raycast、Zed、Codex CLI、Git，以及 Node.js 22.22.2 或更高版本。在项目目录中执行：

```bash
npm install
npm run dev
```

随后打开 Raycast，搜索并运行 **Switch Codex Worktree**。本地开发安装需要保持 `npm run dev` 运行。

## 使用

列表按最后更新时间展示仍然有效的 Codex 会话，并支持按会话名、仓库名、worktree 名和路径搜索。每个会话提供：

- **在现有 Zed 窗口打开**：默认 Action，按 `Enter` 执行，使用 `zed --existing`。
- **在新 Zed 窗口打开**：使用 `zed --new`。
- **复制 Worktree 路径**。
- **在 Finder 中显示**。
- **刷新列表**。
- **打开扩展偏好**。

## 偏好设置

| 偏好       | 默认值                    | 说明                          |
| ---------- | ------------------------- | ----------------------------- |
| Codex CLI  | `/opt/homebrew/bin/codex` | Codex CLI 可执行文件          |
| Codex Home | `~/.codex`                | Codex 会话与状态目录          |
| Zed App    | `dev.zed.Zed`             | 用于打开 worktree 的 Zed 应用 |

## 筛选规则与隐私

扩展只显示未归档、`cwd` 仍存在且属于 Git linked worktree 的会话。主 checkout、非 Git 目录和已删除的 worktree 不会显示。同一 worktree 上的多个 Codex 会话仍分别展示。

会话元数据通过本地 `codex app-server` 获取，worktree 通过系统 Git 验证。扩展不读取或输出会话正文，不上传数据，也不创建数据库、缓存或会话历史；每次打开命令都会重新同步，保持打开时不会自动轮询。

## 排障

列表为空时，请检查 Codex CLI 和 Codex Home 偏好、会话是否未归档，以及目标目录是否仍是 linked worktree。可用以下命令检查仓库：

```bash
/usr/bin/git -C /path/to/repository worktree list
```

Codex 启动失败时，确认偏好中的 CLI 路径可执行且其版本支持 `app-server`。Zed 打开失败时，在扩展偏好中重新选择 Zed App，并确认 Zed CLI 已安装。

开发检查命令：

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 限制

- 仅支持本机 macOS 当前用户。
- 不创建、恢复、删除或修复 worktree。
- 不管理、继续、归档或恢复 Codex 会话。
- 远程、SSH 和容器内 worktree 不在 v1 支持范围内。
- 这是 Raycast 浮层命令，不是 Zed 内部常驻侧边栏。

## 维护者

loheagn <loheagn@icloud.com>

## License

MIT

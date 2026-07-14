<!--
SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
SPDX-License-Identifier: MIT
-->

# Codex Worktree Switcher

一个仅适用于 macOS 的 Raycast 扩展，用于浏览本地 Codex 会话，并在 Zed 中打开会话对应的 Git checkout（主 checkout 或 linked worktree）。

## 本地安装

需要 Raycast、Zed、Codex Desktop、Git，以及 Node.js 22.22.2 或更高版本。在项目目录中执行：

```bash
npm install
npm run dev
```

随后打开 Raycast，搜索并运行 **Switch Codex Worktree**。本地开发安装需要保持 `npm run dev` 运行。

## 使用

列表不按仓库分段，而是按 Codex 的最近活跃时间全局展示仍然有效的会话；仓库与 checkout 标识显示在副标题中：有分支时使用完整分支名，detached checkout 显示为 `Detached · <8 位提交>`。列表支持按会话名、仓库名、分支、提交标识和路径搜索。每个会话提供：

- **在现有 Zed 窗口打开**：默认 Action，按 `Enter` 执行，使用 `zed --existing`。
- **在新 Zed 窗口打开**：使用 `zed --new`。
- **复制 Checkout 路径**。
- **在 Finder 中显示**。
- **刷新列表**。
- **打开扩展偏好**。

## 偏好设置

| 偏好       | 默认值        | 说明                          |
| ---------- | ------------- | ----------------------------- |
| Codex Home | `~/.codex`    | Codex Desktop 元数据目录      |
| Zed App    | `dev.zed.Zed` | 用于打开 worktree 的 Zed 应用 |

## 筛选规则与隐私

扩展只显示未归档、`cwd` 仍存在且属于本机 Git checkout 的会话。主 checkout 和 linked worktree 都会显示；非 Git 目录、远程目录及已删除的 worktree 不会显示。同一 checkout 上的多个 Codex 会话仍分别展示。

会话元数据直接来自 Codex Desktop 的本地目录库与状态库，只查询会话 ID、显示标题、cwd、来源、归档状态和活跃时间。显示标题可能由 Codex 根据首条提示自动生成，但扩展不会查询 `preview`、`first_user_message`、rollout、JSONL 或会话正文。SQLite 通过系统 `/usr/bin/sqlite3` 以 `-readonly` 和 `PRAGMA query_only` 双重只读方式访问；扩展不会启动 App Server，不上传数据，也不创建数据库、缓存和会话历史。每次打开命令都会重新同步，保持打开时不会自动轮询；所有目录仍会通过系统 Git 再次验证。

## 排障

列表为空时，请检查 Codex Home 偏好、Codex Desktop 是否至少同步过一次会话、会话是否未归档，以及目标目录是否仍是有效 Git checkout。可用以下命令检查仓库：

```bash
/usr/bin/git -C /path/to/repository worktree list
```

元数据读取失败时，请先启动一次 Codex Desktop，并确认 Codex Home 指向它正在使用的目录。为避免旧状态快照重新显示后来已归档的会话，当前状态库存在但不可读时，扩展会停止加载而不会回退旧库。Zed 打开失败时，在扩展偏好中重新选择 Zed App，并确认 Zed CLI 已安装。

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
- 当前不显示“工作中”状态：Desktop 元数据库没有 active/idle 字段，准确状态只存在于承载该会话的 App Server 进程内存中。
- Codex Desktop 元数据表属于私有 schema；目录投影尚未完成或 schema 发生变化时，少量 Desktop 会话可能暂时不显示，并会给出降级提示。
- 远程、SSH 和容器内 worktree 不在 v1 支持范围内。
- 这是 Raycast 浮层命令，不是 Zed 内部常驻侧边栏。

## 维护者

loheagn <loheagn@icloud.com>

## License

MIT

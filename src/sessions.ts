// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import type { ThreadSummary } from "./codex-app-server";
import type { LinkedWorktree } from "./worktrees";

export interface WorktreeSession {
  id: string;
  title: string;
  preview: string;
  sourceCwd: string;
  updatedAt: number;
  worktree: LinkedWorktree;
}

export function sessionDisplayName(thread: Pick<ThreadSummary, "name" | "preview">): string {
  return thread.name?.trim() || thread.preview.trim() || "Untitled Codex Session";
}

export function buildWorktreeSessions(
  threads: readonly ThreadSummary[],
  worktreesByCwd: ReadonlyMap<string, LinkedWorktree | null>,
): WorktreeSession[] {
  return threads
    .flatMap((thread) => {
      const worktree = worktreesByCwd.get(thread.cwd);
      if (!worktree) {
        return [];
      }

      return [
        {
          id: thread.id,
          preview: thread.preview,
          sourceCwd: thread.cwd,
          title: sessionDisplayName(thread),
          updatedAt: thread.updatedAt,
          worktree,
        },
      ];
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function threadUpdatedAtDate(updatedAt: number): Date {
  return new Date(updatedAt < 10_000_000_000 ? updatedAt * 1_000 : updatedAt);
}

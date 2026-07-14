// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import path from "node:path";

import type { ThreadSummary } from "./codex-desktop";
import type { GitWorktree } from "./worktrees";

export interface WorktreeSession {
  id: string;
  lastActiveAt: number;
  title: string;
  sourceCwd: string;
  worktree: GitWorktree;
}

export function sessionDisplayName(thread: Pick<ThreadSummary, "name">): string {
  return thread.name?.trim() || "Untitled Codex Session";
}

export function buildWorktreeSessions(
  threads: readonly ThreadSummary[],
  worktreesByCwd: ReadonlyMap<string, GitWorktree | null>,
): WorktreeSession[] {
  return threads
    .flatMap((thread) => {
      const match = threadCwdCandidates(thread)
        .map((cwd) => ({ cwd, worktree: worktreesByCwd.get(cwd) }))
        .find((candidate): candidate is { cwd: string; worktree: GitWorktree } => Boolean(candidate.worktree));
      if (!match) {
        return [];
      }

      return [
        {
          id: thread.id,
          lastActiveAt: thread.recencyAt ?? thread.updatedAt,
          sourceCwd: match.cwd,
          title: sessionDisplayName(thread),
          worktree: match.worktree,
        },
      ];
    })
    .sort((left, right) => right.lastActiveAt - left.lastActiveAt);
}

export function threadCwdCandidates(thread: Pick<ThreadSummary, "cwd" | "cwdCandidates">): string[] {
  return [
    ...new Set(
      [...(thread.cwdCandidates ?? []), thread.cwd]
        .filter((cwd) => cwd.trim().length > 0)
        .filter((cwd) => path.isAbsolute(cwd) && path.normalize(cwd) !== path.parse(cwd).root),
    ),
  ];
}

export function threadActivityDate(lastActiveAt: number): Date {
  return new Date(lastActiveAt < 10_000_000_000 ? lastActiveAt * 1_000 : lastActiveAt);
}

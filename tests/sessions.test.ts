// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import type { ThreadSummary } from "../src/codex-desktop";
import { buildWorktreeSessions, sessionDisplayName, threadActivityDate } from "../src/sessions";
import type { GitWorktree } from "../src/worktrees";

const worktree: GitWorktree = {
  branchName: "feature/one",
  commonDir: "/repo/.git",
  gitDir: "/repo/.git/worktrees/feature",
  headCommit: null,
  kind: "linked",
  repositoryName: "repo",
  repositoryRoot: "/repo",
  worktreeName: "feature/one",
  worktreeRoot: "/worktrees/feature",
};

const otherRepositoryWorktree: GitWorktree = {
  branchName: "feature/two",
  commonDir: "/other-repo/.git",
  gitDir: "/other-repo/.git/worktrees/new-feature",
  headCommit: null,
  kind: "linked",
  repositoryName: "other-repo",
  repositoryRoot: "/other-repo",
  worktreeName: "feature/two",
  worktreeRoot: "/worktrees/new-feature",
};

function thread(overrides: Partial<ThreadSummary>): ThreadSummary {
  return {
    cwd: "/worktrees/feature",
    id: "thread",
    name: "Session",
    recencyAt: null,
    updatedAt: 100,
    ...overrides,
  };
}

describe("sessionDisplayName", () => {
  it("uses a non-empty name first", () => {
    expect(sessionDisplayName(thread({ name: "  Named session  " }))).toBe("Named session");
  });

  it("falls back to an untitled label", () => {
    expect(sessionDisplayName(thread({ name: " " }))).toBe("Untitled Codex Session");
    expect(sessionDisplayName(thread({ name: null }))).toBe("Untitled Codex Session");
  });
});

describe("buildWorktreeSessions", () => {
  it("sorts globally across repositories, hides invalid worktrees, and preserves duplicate-worktree sessions", () => {
    const result = buildWorktreeSessions(
      [
        thread({ id: "older", recencyAt: 10, updatedAt: 30 }),
        thread({ id: "same-worktree", recencyAt: 20 }),
        thread({
          cwd: "/worktrees/new-feature",
          id: "newer-other-repository",
          name: null,
          recencyAt: 30,
          updatedAt: 5,
        }),
        thread({ cwd: "/missing", id: "hidden", updatedAt: 30 }),
      ],
      new Map([
        ["/worktrees/feature", worktree],
        ["/worktrees/new-feature", otherRepositoryWorktree],
        ["/missing", null],
      ]),
    );

    expect(result.map(({ id }) => id)).toEqual(["newer-other-repository", "same-worktree", "older"]);
    expect(result[0]?.title).toBe("Untitled Codex Session");
    expect(result[0]?.worktree).toBe(otherRepositoryWorktree);
    expect(result.filter(({ worktree: sessionWorktree }) => sessionWorktree === worktree)).toHaveLength(2);
  });

  it("uses the first valid cwd candidate when Desktop metadata is stale", () => {
    const result = buildWorktreeSessions(
      [thread({ cwd: "/stale-desktop-path", cwdCandidates: ["/stale-desktop-path", "/worktrees/feature"] })],
      new Map([
        ["/stale-desktop-path", null],
        ["/worktrees/feature", worktree],
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceCwd).toBe("/worktrees/feature");
    expect(result[0]?.worktree).toBe(worktree);
  });

  it("ignores root and relative cwd placeholders before Git validation", () => {
    const result = buildWorktreeSessions(
      [thread({ cwd: "/", cwdCandidates: ["/", "relative/path", "/worktrees/feature"] })],
      new Map([["/worktrees/feature", worktree]]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceCwd).toBe("/worktrees/feature");
  });

  it("preserves legal trailing spaces in cwd paths", () => {
    const spacedPath = "/worktrees/feature ";
    const spacedWorktree = { ...worktree, worktreeRoot: spacedPath };
    const result = buildWorktreeSessions([thread({ cwd: spacedPath })], new Map([[spacedPath, spacedWorktree]]));

    expect(result[0]?.sourceCwd).toBe(spacedPath);
    expect(result[0]?.worktree.worktreeRoot).toBe(spacedPath);
  });
});

describe("threadActivityDate", () => {
  it("supports both seconds and milliseconds", () => {
    expect(threadActivityDate(1_700_000_000).getTime()).toBe(1_700_000_000_000);
    expect(threadActivityDate(1_700_000_000_000).getTime()).toBe(1_700_000_000_000);
  });
});

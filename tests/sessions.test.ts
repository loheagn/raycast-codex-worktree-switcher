// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import type { ThreadSummary } from "../src/codex-app-server";
import { buildWorktreeSessions, sessionDisplayName, threadUpdatedAtDate } from "../src/sessions";
import type { LinkedWorktree } from "../src/worktrees";

const worktree: LinkedWorktree = {
  commonDir: "/repo/.git",
  gitDir: "/repo/.git/worktrees/feature",
  repositoryName: "repo",
  repositoryRoot: "/repo",
  worktreeName: "feature",
  worktreeRoot: "/worktrees/feature",
};

function thread(overrides: Partial<ThreadSummary>): ThreadSummary {
  return {
    cwd: "/worktrees/feature",
    id: "thread",
    name: "Session",
    preview: "Preview",
    updatedAt: 100,
    ...overrides,
  };
}

describe("sessionDisplayName", () => {
  it("uses a non-empty name first", () => {
    expect(sessionDisplayName(thread({ name: "  Named session  ", preview: "Fallback" }))).toBe("Named session");
  });

  it("falls back to the preview and then an untitled label", () => {
    expect(sessionDisplayName(thread({ name: " ", preview: "  Preview title  " }))).toBe("Preview title");
    expect(sessionDisplayName(thread({ name: null, preview: " " }))).toBe("Untitled Codex Session");
  });
});

describe("buildWorktreeSessions", () => {
  it("sorts descending, hides invalid worktrees, and preserves duplicate-worktree sessions", () => {
    const result = buildWorktreeSessions(
      [
        thread({ id: "older", updatedAt: 10 }),
        thread({ id: "newer", name: null, preview: "Newer", updatedAt: 20 }),
        thread({ cwd: "/missing", id: "hidden", updatedAt: 30 }),
      ],
      new Map([
        ["/worktrees/feature", worktree],
        ["/missing", null],
      ]),
    );

    expect(result.map(({ id }) => id)).toEqual(["newer", "older"]);
    expect(result[0]?.title).toBe("Newer");
    expect(result[0]?.worktree).toBe(worktree);
  });
});

describe("threadUpdatedAtDate", () => {
  it("supports both seconds and milliseconds", () => {
    expect(threadUpdatedAtDate(1_700_000_000).getTime()).toBe(1_700_000_000_000);
    expect(threadUpdatedAtDate(1_700_000_000_000).getTime()).toBe(1_700_000_000_000);
  });
});

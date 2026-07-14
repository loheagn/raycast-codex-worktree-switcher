// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";

import type { ProcessRunner } from "../src/process";
import { openWorktreeInZed, resolveZedCli, zedCliCandidates } from "../src/zed";

describe("openWorktreeInZed", () => {
  it.each([
    ["existing", "--existing"],
    ["new", "--new"],
  ] as const)("passes the %s mode and worktree as separate arguments", async (mode, flag) => {
    const run = vi.fn<ProcessRunner>().mockResolvedValue({ stdout: "", stderr: "" });
    const worktreePath = "/tmp/worktree with spaces; $(touch nope)";

    await openWorktreeInZed("/Applications/Zed.app/Contents/MacOS/cli", worktreePath, mode, { run });

    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith("/Applications/Zed.app/Contents/MacOS/cli", [flag, worktreePath], {
      timeoutMs: 15_000,
    });
  });
});

describe("resolveZedCli", () => {
  it("prefers the CLI inside the selected application", async () => {
    const canExecute = vi.fn(async (file: string) => file === "/Custom/Zed.app/Contents/MacOS/cli");

    await expect(resolveZedCli("/Custom/Zed.app", { canExecute })).resolves.toBe("/Custom/Zed.app/Contents/MacOS/cli");
    expect(canExecute).toHaveBeenCalledTimes(1);
  });

  it("falls back to the first executable configured path", async () => {
    const canExecute = vi.fn(async (file: string) => file === "/fallback/zed");

    await expect(
      resolveZedCli(undefined, { canExecute, fallbackPaths: ["/missing/zed", "/fallback/zed"] }),
    ).resolves.toBe("/fallback/zed");
  });

  it("reports a helpful error when no CLI is executable", async () => {
    await expect(
      resolveZedCli("/Missing/Zed.app", { canExecute: async () => false, fallbackPaths: [] }),
    ).rejects.toThrow("找不到可执行的 Zed CLI");
  });

  it("does not repeat duplicate CLI candidates", () => {
    expect(zedCliCandidates("/Applications/Zed.app", ["/Applications/Zed.app/Contents/MacOS/cli"])).toEqual([
      "/Applications/Zed.app/Contents/MacOS/cli",
    ]);
  });
});

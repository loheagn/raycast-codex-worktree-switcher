// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";

import { openSessionTargets } from "../src/session-opener";

describe("openSessionTargets", () => {
  it("opens Codex before the editor when both targets succeed", async () => {
    const callOrder: string[] = [];
    const openCodex = vi.fn(async () => {
      callOrder.push("codex");
    });
    const openEditor = vi.fn(async () => {
      callOrder.push("editor");
    });

    await expect(openSessionTargets({ openCodex, openEditor })).resolves.toEqual({ status: "success" });
    expect(callOrder).toEqual(["codex", "editor"]);
  });

  it("still opens the editor when Codex fails", async () => {
    const error = new Error("Codex failed");
    const openEditor = vi.fn(async () => undefined);

    await expect(
      openSessionTargets({
        openCodex: vi.fn(async () => Promise.reject(error)),
        openEditor,
      }),
    ).resolves.toEqual({ status: "codex-failed", error });
    expect(openEditor).toHaveBeenCalledOnce();
  });

  it("reports an editor failure after Codex succeeds", async () => {
    const error = new Error("Editor failed");

    await expect(
      openSessionTargets({
        openCodex: vi.fn(async () => undefined),
        openEditor: vi.fn(async () => Promise.reject(error)),
      }),
    ).resolves.toEqual({ status: "editor-failed", error });
  });

  it("preserves both errors when both targets fail", async () => {
    const codexError = new Error("Codex failed");
    const editorError = new Error("Editor failed");

    await expect(
      openSessionTargets({
        openCodex: vi.fn(async () => Promise.reject(codexError)),
        openEditor: vi.fn(async () => Promise.reject(editorError)),
      }),
    ).resolves.toEqual({ status: "both-failed", codexError, editorError });
  });
});

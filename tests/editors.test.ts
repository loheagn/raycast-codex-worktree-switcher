// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";

import { editorCliCandidates, editorName, type EditorId, openWorktreeInEditor, resolveEditorCli } from "../src/editors";
import type { ProcessRunner } from "../src/process";

describe("openWorktreeInEditor", () => {
  it.each([
    ["zed", "existing", "--existing"],
    ["zed", "new", "--new"],
    ["vscode", "existing", "--reuse-window"],
    ["vscode", "new", "--new-window"],
    ["vscode-insiders", "existing", "--reuse-window"],
    ["vscode-insiders", "new", "--new-window"],
  ] as const)("opens %s in an %s window", async (editor, mode, flag) => {
    const run = vi.fn<ProcessRunner>().mockResolvedValue({ stdout: "", stderr: "" });
    const worktreePath = "/tmp/worktree with spaces; $(touch nope)";

    await openWorktreeInEditor(editor, "/path/to/editor-cli", worktreePath, mode, { run });

    expect(run).toHaveBeenCalledWith("/path/to/editor-cli", [flag, worktreePath], { timeoutMs: 15_000 });
  });
});

describe("editor CLI resolution", () => {
  it.each([
    ["zed", "/Custom/Zed.app", "/Custom/Zed.app/Contents/MacOS/cli"],
    ["vscode", "/Custom/Code.app", "/Custom/Code.app/Contents/Resources/app/bin/code"],
    ["vscode-insiders", "/Custom/Code.app", "/Custom/Code.app/Contents/Resources/app/bin/code"],
  ] as const)("prefers the CLI inside the selected %s application", async (editor, applicationPath, expected) => {
    const canExecute = vi.fn(async (file: string) => file === expected);

    await expect(resolveEditorCli(editor, applicationPath, { canExecute })).resolves.toBe(expected);
    expect(canExecute).toHaveBeenCalledTimes(1);
  });

  it.each(["vscode", "vscode-insiders"] as const)("falls back to the first executable path for %s", async (editor) => {
    const canExecute = vi.fn(async (file: string) => file === "/fallback/code");

    await expect(
      resolveEditorCli(editor, undefined, { canExecute, fallbackPaths: ["/missing/code", "/fallback/code"] }),
    ).resolves.toBe("/fallback/code");
  });

  it.each([
    ["vscode", "VS Code"],
    ["vscode-insiders", "VS Code Insiders"],
  ] as const)("reports a targeted error when the %s CLI cannot be found", async (editor, name) => {
    await expect(
      resolveEditorCli(editor, "/Missing/Code.app", { canExecute: async () => false, fallbackPaths: [] }),
    ).rejects.toThrow(`找不到可执行的 ${name} CLI`);
  });

  it("uses distinct Stable and Insiders candidates", () => {
    expect(editorCliCandidates("vscode")).toContain("/opt/homebrew/bin/code");
    expect(editorCliCandidates("vscode-insiders")).toContain("/opt/homebrew/bin/code-insiders");
    expect(editorCliCandidates("vscode-insiders")).toContain(
      "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
    );
  });

  it.each(["zed", "vscode", "vscode-insiders"] as const)("does not repeat duplicate %s candidates", (editor) => {
    const applicationPath = "/Applications/Editor.app";
    const applicationCandidate = editorCliCandidates(editor, applicationPath, [])[0];

    expect(editorCliCandidates(editor, applicationPath, [applicationCandidate])).toEqual([applicationCandidate]);
  });
});

describe("editorName", () => {
  it.each([
    ["zed", "Zed"],
    ["vscode", "VS Code"],
    ["vscode-insiders", "VS Code Insiders"],
  ] satisfies [EditorId, string][])('labels %s as "%s"', (editor, name) => {
    expect(editorName(editor)).toBe(name);
  });
});

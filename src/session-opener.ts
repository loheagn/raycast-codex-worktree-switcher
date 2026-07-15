// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

export type OpenSessionTargetsResult =
  | { status: "success" }
  | { status: "codex-failed"; error: unknown }
  | { status: "editor-failed"; error: unknown }
  | { status: "both-failed"; codexError: unknown; editorError: unknown };

export interface OpenSessionTargetsOptions {
  openCodex: () => Promise<void>;
  openEditor: () => Promise<void>;
}

type SettledResult = { status: "fulfilled" } | { status: "rejected"; error: unknown };

async function settle(operation: () => Promise<void>): Promise<SettledResult> {
  try {
    await operation();
    return { status: "fulfilled" };
  } catch (error) {
    return { status: "rejected", error };
  }
}

export async function openSessionTargets(options: OpenSessionTargetsOptions): Promise<OpenSessionTargetsResult> {
  const codexResult = await settle(options.openCodex);
  const editorResult = await settle(options.openEditor);

  if (codexResult.status === "rejected" && editorResult.status === "rejected") {
    return { status: "both-failed", codexError: codexResult.error, editorError: editorResult.error };
  }
  if (codexResult.status === "rejected") {
    return { status: "codex-failed", error: codexResult.error };
  }
  if (editorResult.status === "rejected") {
    return { status: "editor-failed", error: editorResult.error };
  }
  return { status: "success" };
}

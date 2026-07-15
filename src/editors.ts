// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import { type ProcessRunner, runProcess } from "./process";

export type EditorId = "zed" | "vscode" | "vscode-insiders";
export type EditorOpenMode = "existing" | "new";

export interface ResolveEditorOptions {
  canExecute?: (file: string) => Promise<boolean>;
  fallbackPaths?: readonly string[];
}

export interface OpenEditorOptions {
  run?: ProcessRunner;
  timeoutMs?: number;
}

interface EditorDefinition {
  applicationCliPath: readonly string[];
  existingWindowFlag: string;
  fallbackPaths: readonly string[];
  name: string;
  newWindowFlag: string;
}

const EDITORS: Record<EditorId, EditorDefinition> = {
  zed: {
    applicationCliPath: ["Contents", "MacOS", "cli"],
    existingWindowFlag: "--existing",
    fallbackPaths: ["/opt/homebrew/bin/zed", "/usr/local/bin/zed", "/Applications/Zed.app/Contents/MacOS/cli"],
    name: "Zed",
    newWindowFlag: "--new",
  },
  vscode: {
    applicationCliPath: ["Contents", "Resources", "app", "bin", "code"],
    existingWindowFlag: "--reuse-window",
    fallbackPaths: [
      "/opt/homebrew/bin/code",
      "/usr/local/bin/code",
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    ],
    name: "VS Code",
    newWindowFlag: "--new-window",
  },
  "vscode-insiders": {
    applicationCliPath: ["Contents", "Resources", "app", "bin", "code"],
    existingWindowFlag: "--reuse-window",
    fallbackPaths: [
      "/opt/homebrew/bin/code-insiders",
      "/usr/local/bin/code-insiders",
      "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
    ],
    name: "VS Code Insiders",
    newWindowFlag: "--new-window",
  },
};

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function editorName(editor: EditorId): string {
  return EDITORS[editor].name;
}

export function editorCliCandidates(
  editor: EditorId,
  applicationPath?: string,
  fallbackPaths: readonly string[] = EDITORS[editor].fallbackPaths,
): string[] {
  const applicationCli = applicationPath
    ? path.join(applicationPath, ...EDITORS[editor].applicationCliPath)
    : undefined;
  return [...new Set([...(applicationCli ? [applicationCli] : []), ...fallbackPaths])];
}

export async function resolveEditorCli(
  editor: EditorId,
  applicationPath?: string,
  options: ResolveEditorOptions = {},
): Promise<string> {
  const canExecute = options.canExecute ?? isExecutable;
  for (const candidate of editorCliCandidates(editor, applicationPath, options.fallbackPaths)) {
    if (await canExecute(candidate)) {
      return candidate;
    }
  }

  throw new Error(`找不到可执行的 ${editorName(editor)} CLI。请在扩展偏好中重新选择 ${editorName(editor)} App。`);
}

export async function openWorktreeInEditor(
  editor: EditorId,
  editorCli: string,
  worktreePath: string,
  mode: EditorOpenMode,
  options: OpenEditorOptions = {},
): Promise<void> {
  const definition = EDITORS[editor];
  await (options.run ?? runProcess)(
    editorCli,
    [mode === "existing" ? definition.existingWindowFlag : definition.newWindowFlag, worktreePath],
    { timeoutMs: options.timeoutMs ?? 15_000 },
  );
}

// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import {
  editorCliCandidates,
  type EditorOpenMode,
  type OpenEditorOptions,
  openWorktreeInEditor,
  type ResolveEditorOptions,
  resolveEditorCli,
} from "./editors";

export type ZedOpenMode = EditorOpenMode;

export type ResolveZedOptions = ResolveEditorOptions;

export type OpenZedOptions = OpenEditorOptions;

const DEFAULT_FALLBACK_PATHS = [
  "/opt/homebrew/bin/zed",
  "/usr/local/bin/zed",
  "/Applications/Zed.app/Contents/MacOS/cli",
] as const;

export function zedCliCandidates(
  applicationPath?: string,
  fallbackPaths: readonly string[] = DEFAULT_FALLBACK_PATHS,
): string[] {
  return editorCliCandidates("zed", applicationPath, fallbackPaths);
}

export async function resolveZedCli(applicationPath?: string, options: ResolveZedOptions = {}): Promise<string> {
  return resolveEditorCli("zed", applicationPath, {
    ...options,
    fallbackPaths: options.fallbackPaths ?? DEFAULT_FALLBACK_PATHS,
  });
}

export async function openWorktreeInZed(
  zedCli: string,
  worktreePath: string,
  mode: ZedOpenMode,
  options: OpenZedOptions = {},
): Promise<void> {
  await openWorktreeInEditor("zed", zedCli, worktreePath, mode, options);
}

// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import { type ProcessRunner, runProcess } from "./process";

export type ZedOpenMode = "existing" | "new";

export interface ResolveZedOptions {
  canExecute?: (file: string) => Promise<boolean>;
  fallbackPaths?: readonly string[];
}

export interface OpenZedOptions {
  run?: ProcessRunner;
  timeoutMs?: number;
}

const DEFAULT_FALLBACK_PATHS = [
  "/opt/homebrew/bin/zed",
  "/usr/local/bin/zed",
  "/Applications/Zed.app/Contents/MacOS/cli",
] as const;

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function zedCliCandidates(
  applicationPath?: string,
  fallbackPaths: readonly string[] = DEFAULT_FALLBACK_PATHS,
): string[] {
  const candidates = applicationPath
    ? [path.join(applicationPath, "Contents", "MacOS", "cli"), ...fallbackPaths]
    : [...fallbackPaths];
  return [...new Set(candidates)];
}

export async function resolveZedCli(applicationPath?: string, options: ResolveZedOptions = {}): Promise<string> {
  const canExecute = options.canExecute ?? isExecutable;
  for (const candidate of zedCliCandidates(applicationPath, options.fallbackPaths ?? DEFAULT_FALLBACK_PATHS)) {
    if (await canExecute(candidate)) {
      return candidate;
    }
  }

  throw new Error("找不到可执行的 Zed CLI。请在扩展偏好中重新选择 Zed App。");
}

export async function openWorktreeInZed(
  zedCli: string,
  worktreePath: string,
  mode: ZedOpenMode,
  options: OpenZedOptions = {},
): Promise<void> {
  await (options.run ?? runProcess)(zedCli, [mode === "existing" ? "--existing" : "--new", worktreePath], {
    timeoutMs: options.timeoutMs ?? 15_000,
  });
}

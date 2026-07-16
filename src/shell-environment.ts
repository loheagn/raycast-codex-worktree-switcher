// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { userInfo } from "node:os";

import { type ProcessRunner, runProcess } from "./process";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_LOGIN_SHELL = "/bin/zsh";
const PRINT_PATH_COMMAND = "/usr/bin/printf '\\0'; /usr/bin/printenv PATH; /usr/bin/printf '\\0'";

export interface ResolveLoginShellPathOptions {
  run?: ProcessRunner;
  shell?: string;
  timeoutMs?: number;
}

export interface CreateLoginShellPathEnvironmentOptions extends ResolveLoginShellPathOptions {
  baseEnvironment?: NodeJS.ProcessEnv;
}

function detectedLoginShell(): string | undefined {
  try {
    const shell = userInfo().shell?.trim();
    if (shell) {
      return shell;
    }
  } catch {
    // Fall back to SHELL when the operating system user record is unavailable.
  }

  const shell = process.env.SHELL?.trim();
  if (shell) {
    return shell;
  }
}

function allowlistedLoginShell(candidate: string | undefined): string {
  // Return fixed literals so an untrusted candidate can never become the executable passed to execFile.
  switch (candidate) {
    case "/bin/bash":
      return "/bin/bash";
    case "/bin/zsh":
      return "/bin/zsh";
    case "/opt/homebrew/bin/fish":
      return "/opt/homebrew/bin/fish";
    case "/usr/local/bin/fish":
      return "/usr/local/bin/fish";
    default:
      return DEFAULT_LOGIN_SHELL;
  }
}

export function parseLoginShellPath(output: string): string {
  const start = output.indexOf("\0");
  const end = output.indexOf("\0", start + 1);
  if (start >= 0 && end > start) {
    const shellPath = output.slice(start + 1, end).replace(/\r?\n$/, "");
    if (shellPath) {
      return shellPath;
    }
  }

  throw new Error("登录 Shell 未返回有效的 PATH");
}

export async function resolveLoginShellPath(options: ResolveLoginShellPathOptions = {}): Promise<string> {
  const shell = allowlistedLoginShell(options.shell?.trim() || detectedLoginShell());

  try {
    const { stdout } = await (options.run ?? runProcess)(shell, ["-ilc", PRINT_PATH_COMMAND], {
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    return parseLoginShellPath(stdout);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    throw new Error(`无法从用户登录 Shell（${shell}）读取 PATH：${detail}`, { cause: error });
  }
}

export async function createLoginShellPathEnvironment(
  options: CreateLoginShellPathEnvironmentOptions = {},
): Promise<NodeJS.ProcessEnv> {
  const { baseEnvironment = process.env, ...resolveOptions } = options;
  const shellPath = await resolveLoginShellPath(resolveOptions);
  return { ...baseEnvironment, PATH: shellPath };
}

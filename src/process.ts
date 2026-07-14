// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { execFile } from "node:child_process";

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBuffer?: number;
}

export type ProcessRunner = (
  executable: string,
  args: readonly string[],
  options?: ProcessOptions,
) => Promise<ProcessResult>;

export class ProcessExecutionError extends Error {
  readonly code: string | number | null;
  readonly stderr: string;

  constructor(message: string, code: string | number | null, stderr: string) {
    super(message);
    this.name = "ProcessExecutionError";
    this.code = code;
    this.stderr = stderr;
  }
}

export const runProcess: ProcessRunner = (executable, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      [...args],
      {
        cwd: options.cwd,
        encoding: "utf8",
        env: options.env,
        maxBuffer: options.maxBuffer ?? 1024 * 1024,
        shell: false,
        timeout: options.timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = typeof error.code === "string" || typeof error.code === "number" ? error.code : null;
          const detail = stderr.trim() || error.message;
          reject(new ProcessExecutionError(detail, code, stderr));
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });

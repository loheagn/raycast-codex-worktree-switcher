// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { type ProcessRunner, runProcess } from "./process";

const GIT_EXECUTABLE = "/usr/bin/git";
const GIT_TIMEOUT_MS = 3_000;

export interface LinkedWorktree {
  worktreeRoot: string;
  gitDir: string;
  commonDir: string;
  repositoryRoot: string;
  repositoryName: string;
  worktreeName: string;
}

export interface WorktreeValidationOptions {
  run?: ProcessRunner;
  timeoutMs?: number;
}

export interface WorktreeBatchOptions extends WorktreeValidationOptions {
  concurrency?: number;
  validate?: (cwd: string) => Promise<LinkedWorktree | null>;
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function repositoryRootFor(commonDir: string): string {
  return path.basename(commonDir) === ".git" ? path.dirname(commonDir) : commonDir;
}

export async function validateLinkedWorktree(
  cwd: string,
  options: WorktreeValidationOptions = {},
): Promise<LinkedWorktree | null> {
  if (!cwd || !(await isDirectory(cwd))) {
    return null;
  }

  try {
    const { stdout } = await (options.run ?? runProcess)(
      GIT_EXECUTABLE,
      ["-C", cwd, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"],
      { timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS },
    );
    const [rawRoot, rawGitDir, rawCommonDir, ...extra] = stdout.split(/\r?\n/).filter(Boolean);
    if (!rawRoot || !rawGitDir || !rawCommonDir || extra.length > 0) {
      return null;
    }

    const [worktreeRoot, gitDir, commonDir] = await Promise.all([
      realpath(rawRoot),
      realpath(rawGitDir),
      realpath(rawCommonDir),
    ]);
    if (gitDir === commonDir || !(await isDirectory(worktreeRoot))) {
      return null;
    }

    const repositoryRoot = repositoryRootFor(commonDir);
    return {
      worktreeRoot,
      gitDir,
      commonDir,
      repositoryRoot,
      repositoryName: path.basename(repositoryRoot),
      worktreeName: path.basename(worktreeRoot),
    };
  } catch {
    return null;
  }
}

export async function validateLinkedWorktrees(
  cwds: Iterable<string>,
  options: WorktreeBatchOptions = {},
): Promise<Map<string, LinkedWorktree | null>> {
  const uniqueCwds = [...new Set(cwds)];
  const results = new Map<string, LinkedWorktree | null>();
  const validate =
    options.validate ??
    ((cwd: string) => validateLinkedWorktree(cwd, { run: options.run, timeoutMs: options.timeoutMs }));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 8, uniqueCwds.length || 1));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < uniqueCwds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const cwd = uniqueCwds[index];
      results.set(cwd, await validate(cwd));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

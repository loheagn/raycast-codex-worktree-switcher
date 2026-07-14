// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { type ProcessRunner, runProcess } from "./process";

const GIT_EXECUTABLE = "/usr/bin/git";
const GIT_TIMEOUT_MS = 3_000;

export interface GitWorktree {
  worktreeRoot: string;
  gitDir: string;
  commonDir: string;
  repositoryRoot: string;
  repositoryName: string;
  worktreeName: string;
  branchName: string | null;
  headCommit: string | null;
  kind: "main" | "linked";
}

export interface WorktreeValidationOptions {
  run?: ProcessRunner;
  timeoutMs?: number;
}

export interface WorktreeBatchOptions extends WorktreeValidationOptions {
  concurrency?: number;
  validate?: (cwd: string) => Promise<GitWorktree | null>;
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

async function readHeadIdentity(gitDir: string): Promise<{
  branchName: string | null;
  headCommit: string | null;
  label: string;
}> {
  const head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
  const symbolicPrefix = "ref: ";
  if (head.startsWith(symbolicPrefix)) {
    const ref = head.slice(symbolicPrefix.length);
    const branchPrefix = "refs/heads/";
    const branchName = ref.startsWith(branchPrefix) ? ref.slice(branchPrefix.length) : ref;
    if (branchName.length === 0) {
      throw new Error("Git HEAD points to an empty ref");
    }
    return { branchName, headCommit: null, label: branchName };
  }

  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(head)) {
    throw new Error("Git HEAD is neither a branch nor a commit");
  }
  return { branchName: null, headCommit: head, label: `Detached · ${head.slice(0, 8)}` };
}

export async function validateGitWorktree(
  cwd: string,
  options: WorktreeValidationOptions = {},
): Promise<GitWorktree | null> {
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
    if (!(await isDirectory(worktreeRoot))) {
      return null;
    }

    const kind = gitDir === commonDir ? "main" : "linked";
    const repositoryRoot = kind === "main" ? worktreeRoot : repositoryRootFor(commonDir);
    const head = await readHeadIdentity(gitDir);
    return {
      worktreeRoot,
      gitDir,
      commonDir,
      repositoryRoot,
      repositoryName: path.basename(repositoryRoot),
      worktreeName: head.label,
      branchName: head.branchName,
      headCommit: head.headCommit,
      kind,
    };
  } catch {
    return null;
  }
}

export async function validateGitWorktrees(
  cwds: Iterable<string>,
  options: WorktreeBatchOptions = {},
): Promise<Map<string, GitWorktree | null>> {
  const uniqueCwds = [...new Set(cwds)];
  const results = new Map<string, GitWorktree | null>();
  const validate =
    options.validate ?? ((cwd: string) => validateGitWorktree(cwd, { run: options.run, timeoutMs: options.timeoutMs }));
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

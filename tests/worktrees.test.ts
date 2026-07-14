// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runProcess } from "../src/process";
import { validateGitWorktree, validateGitWorktrees } from "../src/worktrees";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { force: true, maxRetries: 3, recursive: true, retryDelay: 50 });
  }
});

async function createRepositoryWithLinkedWorktree(): Promise<{
  linkedWorktree: string;
  mainCheckout: string;
  root: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-switcher-test-"));
  temporaryDirectories.push(root);
  const mainCheckout = path.join(root, "main repo");
  const linkedWorktree = path.join(root, "linked ; $() worktree");
  await mkdir(mainCheckout);
  await runProcess("/usr/bin/git", ["init", mainCheckout]);
  await runProcess("/usr/bin/git", ["-C", mainCheckout, "config", "user.name", "Test"]);
  await runProcess("/usr/bin/git", ["-C", mainCheckout, "config", "user.email", "test@example.com"]);
  await runProcess("/usr/bin/git", ["-C", mainCheckout, "commit", "--allow-empty", "-m", "initial"]);
  await runProcess("/usr/bin/git", ["-C", mainCheckout, "worktree", "add", "--detach", linkedWorktree]);
  return { linkedWorktree, mainCheckout, root };
}

describe("validateGitWorktree", () => {
  it("keeps the main checkout and normalizes a linked worktree subdirectory", async () => {
    const { linkedWorktree, mainCheckout } = await createRepositoryWithLinkedWorktree();
    const nestedDirectory = path.join(linkedWorktree, "nested", "source");
    await mkdir(nestedDirectory, { recursive: true });

    const main = await validateGitWorktree(mainCheckout);
    expect(main).not.toBeNull();
    expect(main?.worktreeRoot).toBe(await realpath(mainCheckout));
    expect(main?.repositoryRoot).toBe(await realpath(mainCheckout));
    expect(main?.worktreeName).toBe("Local");
    expect(main?.kind).toBe("main");
    expect(main?.gitDir).toBe(main?.commonDir);

    const linked = await validateGitWorktree(nestedDirectory);
    expect(linked).not.toBeNull();
    expect(linked?.worktreeRoot).toBe(await realpath(linkedWorktree));
    expect(linked?.repositoryRoot).toBe(await realpath(mainCheckout));
    expect(linked?.repositoryName).toBe("main repo");
    expect(linked?.worktreeName).toBe("linked ; $() worktree");
    expect(linked?.kind).toBe("linked");
    expect(linked?.gitDir).not.toBe(linked?.commonDir);
  });

  it("uses the checkout as the repository root when Git metadata is stored elsewhere", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-switcher-separate-git-dir-"));
    temporaryDirectories.push(root);
    const checkout = path.join(root, "checkout");
    const gitDirectory = path.join(root, "metadata", "repository.git");
    await Promise.all([mkdir(checkout), mkdir(path.dirname(gitDirectory))]);
    await runProcess("/usr/bin/git", ["init", "--separate-git-dir", gitDirectory, checkout]);

    const result = await validateGitWorktree(checkout);

    expect(result?.kind).toBe("main");
    expect(result?.repositoryRoot).toBe(await realpath(checkout));
    expect(result?.repositoryName).toBe("checkout");
    expect(result?.worktreeName).toBe("Local");
  });

  it("hides directories that no longer exist", async () => {
    const { linkedWorktree } = await createRepositoryWithLinkedWorktree();
    await rm(linkedWorktree, { recursive: true });

    await expect(validateGitWorktree(linkedWorktree)).resolves.toBeNull();
  });

  it("returns null for a non-Git directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-switcher-non-git-"));
    temporaryDirectories.push(root);

    await expect(validateGitWorktree(root)).resolves.toBeNull();
  });
});

describe("validateGitWorktrees", () => {
  it("validates every unique cwd without merging sessions at the caller", async () => {
    const validate = vi.fn(async () => null);

    const results = await validateGitWorktrees(["one", "one", "two"], { concurrency: 2, validate });

    expect(results.size).toBe(2);
    expect(validate).toHaveBeenCalledTimes(2);
    expect([...results.keys()].sort()).toEqual(["one", "two"]);
  });
});

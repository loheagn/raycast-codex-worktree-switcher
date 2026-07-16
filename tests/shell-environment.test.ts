// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";

import type { ProcessRunner } from "../src/process";
import { createLoginShellPathEnvironment, parseLoginShellPath, resolveLoginShellPath } from "../src/shell-environment";

describe("parseLoginShellPath", () => {
  it("extracts PATH between null delimiters", () => {
    expect(parseLoginShellPath("\0/opt/homebrew/bin:/usr/bin\n\0")).toBe("/opt/homebrew/bin:/usr/bin");
  });

  it("ignores output emitted by interactive shell startup and shutdown files", () => {
    expect(parseLoginShellPath("startup message\n\0/Users/test/bin:/usr/bin\n\0shutdown message\n")).toBe(
      "/Users/test/bin:/usr/bin",
    );
  });

  it("rejects output without a non-empty PATH", () => {
    expect(() => parseLoginShellPath("startup message\n\0\n\0")).toThrow("登录 Shell 未返回有效的 PATH");
  });
});

describe("resolveLoginShellPath", () => {
  it("reads the environment from an interactive login shell", async () => {
    const run = vi.fn<ProcessRunner>().mockResolvedValue({
      stdout: "\0/opt/homebrew/bin:/usr/bin\n\0",
      stderr: "",
    });

    await expect(resolveLoginShellPath({ run, shell: "/bin/zsh" })).resolves.toBe("/opt/homebrew/bin:/usr/bin");
    expect(run).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-ilc", "/usr/bin/printf '\\0'; /usr/bin/printenv PATH; /usr/bin/printf '\\0'"],
      { timeoutMs: 10_000 },
    );
  });

  it("allows the Homebrew Fish login shell", async () => {
    const run = vi.fn<ProcessRunner>().mockResolvedValue({
      stdout: "\0/Users/test/go/bin:/opt/homebrew/bin:/usr/bin\n\0",
      stderr: "",
    });

    await resolveLoginShellPath({ run, shell: "/opt/homebrew/bin/fish" });

    expect(run).toHaveBeenCalledWith(
      "/opt/homebrew/bin/fish",
      ["-ilc", "/usr/bin/printf '\\0'; /usr/bin/printenv PATH; /usr/bin/printf '\\0'"],
      { timeoutMs: 10_000 },
    );
  });

  it("does not execute an unrecognized login shell path", async () => {
    const run = vi.fn<ProcessRunner>().mockResolvedValue({
      stdout: "\0/usr/bin:/bin\n\0",
      stderr: "",
    });

    await resolveLoginShellPath({ run, shell: "/tmp/untrusted-shell" });

    expect(run).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-ilc", "/usr/bin/printf '\\0'; /usr/bin/printenv PATH; /usr/bin/printf '\\0'"],
      { timeoutMs: 10_000 },
    );
  });

  it("reports the selected shell when environment loading fails", async () => {
    const run = vi.fn<ProcessRunner>().mockRejectedValue(new Error("startup failed"));

    await expect(resolveLoginShellPath({ run, shell: "/opt/homebrew/bin/fish" })).rejects.toThrow(
      "无法从用户登录 Shell（/opt/homebrew/bin/fish）读取 PATH：startup failed",
    );
  });
});

describe("createLoginShellPathEnvironment", () => {
  it("preserves the current environment and replaces only PATH", async () => {
    const run = vi.fn<ProcessRunner>().mockResolvedValue({
      stdout: "\0/Users/test/go/bin:/opt/homebrew/bin:/usr/bin\n\0",
      stderr: "",
    });

    await expect(
      createLoginShellPathEnvironment({
        baseEnvironment: { HOME: "/Users/test", PATH: "/usr/bin" },
        run,
        shell: "/bin/zsh",
      }),
    ).resolves.toEqual({
      HOME: "/Users/test",
      PATH: "/Users/test/go/bin:/opt/homebrew/bin:/usr/bin",
    });
  });
});

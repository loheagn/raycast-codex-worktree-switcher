// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { listCodexThreads } from "../src/codex-app-server";

type ClientMessage = {
  id?: number;
  method: string;
  params: Record<string, unknown>;
};

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly received: ClientMessage[] = [];
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  readonly kill = vi.fn((signal: NodeJS.Signals = "SIGTERM") => {
    this.killed = true;
    if (signal === "SIGTERM" && this.ignoreSigterm) {
      return true;
    }
    queueMicrotask(() => this.finishExit(null, signal));
    return true;
  });

  private inputBuffer = "";

  constructor(
    private readonly onMessage: (message: ClientMessage, child: FakeCodexProcess) => void,
    private readonly ignoreSigterm = false,
  ) {
    super();
    this.stdin.setEncoding("utf8");
    this.stdin.on("data", (chunk: string) => {
      this.inputBuffer += chunk;
      let newlineIndex = this.inputBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = this.inputBuffer.slice(0, newlineIndex);
        this.inputBuffer = this.inputBuffer.slice(newlineIndex + 1);
        if (line.trim().length > 0) {
          const message = JSON.parse(line) as ClientMessage;
          this.received.push(message);
          this.onMessage(message, this);
        }
        newlineIndex = this.inputBuffer.indexOf("\n");
      }
    });
  }

  sendJson(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  sendFragmentedJson(message: unknown): void {
    const data = `${JSON.stringify(message)}\n`;
    const splitAt = Math.max(1, Math.floor(data.length / 2));
    this.stdout.write(data.slice(0, splitAt));
    this.stdout.write(data.slice(splitAt));
  }

  sendJsonLines(messages: unknown[]): void {
    this.stdout.write(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`);
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.finishExit(code, signal);
  }

  emitExitBeforeStdoutDrain(code: number, trailingMessage: unknown): void {
    this.exitCode = code;
    this.emit("exit", code, null);
    queueMicrotask(() => {
      this.sendJson(trailingMessage);
      this.stdout.end();
      this.emit("close", code, null);
    });
  }

  private finishExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exitCode !== null || this.signalCode !== null) {
      return;
    }
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
    this.stdout.end();
    this.emit("close", code, signal);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("listCodexThreads", () => {
  it("initializes app-server and collects every paginated thread-list response", async () => {
    const child = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.sendFragmentedJson({ id: message.id, result: { platformFamily: "unix" } });
        return;
      }
      if (message.method !== "thread/list") {
        return;
      }

      if (message.params.cursor === null) {
        child.sendJsonLines([
          { method: "thread/status/changed", params: { threadId: "ignored", status: { type: "idle" } } },
          {
            id: message.id,
            result: {
              data: [
                {
                  id: "thread-new",
                  cwd: "/tmp/project-new",
                  name: "New session",
                  preview: "Preview one",
                  updatedAt: 100,
                  turns: [{ private: "not exposed" }],
                },
              ],
              nextCursor: "page-two",
            },
          },
        ]);
        return;
      }

      child.sendJson({
        id: message.id,
        result: {
          data: [
            {
              id: "thread-old",
              cwd: "/tmp/project-old",
              preview: "Preview two",
              updatedAt: 200,
            },
          ],
          nextCursor: null,
        },
      });
    });
    const spawnFn = vi.fn(() => child as never);

    await expect(
      listCodexThreads({
        codexExecutable: "/custom/bin/codex",
        codexHome: "/custom/codex-home",
        spawnFn,
      }),
    ).resolves.toEqual([
      {
        id: "thread-old",
        cwd: "/tmp/project-old",
        name: null,
        preview: "Preview two",
        updatedAt: 200,
      },
      {
        id: "thread-new",
        cwd: "/tmp/project-new",
        name: "New session",
        preview: "Preview one",
        updatedAt: 100,
      },
    ]);

    expect(spawnFn).toHaveBeenCalledWith(
      "/custom/bin/codex",
      ["app-server", "--stdio"],
      expect.objectContaining({
        env: expect.objectContaining({
          CODEX_HOME: "/custom/codex-home",
          PATH: expect.stringMatching(new RegExp(`^/custom/bin${path.delimiter}`)),
        }),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
    );

    expect(child.received.map(({ method }) => method)).toEqual([
      "initialize",
      "initialized",
      "thread/list",
      "thread/list",
    ]);
    const listRequests = child.received.filter(({ method }) => method === "thread/list");
    expect(listRequests[0]?.params).toEqual({
      archived: false,
      cursor: null,
      limit: 100,
      sortDirection: "desc",
      sortKey: "updated_at",
      sourceKinds: ["cli", "vscode", "exec", "appServer", "unknown"],
    });
    expect(listRequests[1]?.params.cursor).toBe("page-two");
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("rejects a repeated pagination cursor and always closes the process", async () => {
    const child = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.sendJson({ id: message.id, result: {} });
      } else if (message.method === "thread/list") {
        child.sendJson({ id: message.id, result: { data: [], nextCursor: "repeated" } });
      }
    });

    await expect(listCodexThreads({ codexExecutable: "codex", spawnFn: vi.fn(() => child as never) })).rejects.toThrow(
      "repeated pagination cursor",
    );
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("surfaces JSON-RPC errors without logging response payloads", async () => {
    const child = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.sendJson({ id: message.id, result: {} });
      } else if (message.method === "thread/list") {
        child.sendJson({ id: message.id, error: { code: -32603, message: "database unavailable" } });
      }
    });

    await expect(listCodexThreads({ codexExecutable: "codex", spawnFn: vi.fn(() => child as never) })).rejects.toThrow(
      "thread/list (-32603): database unavailable",
    );
  });

  it("rejects when app-server exits before responding", async () => {
    const child = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.exit(7);
      }
    });

    await expect(listCodexThreads({ codexExecutable: "codex", spawnFn: vi.fn(() => child as never) })).rejects.toThrow(
      "exit code 7",
    );
  });

  it("accepts a final response that drains from stdout after process exit", async () => {
    const child = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.sendJson({ id: message.id, result: {} });
      } else if (message.method === "thread/list") {
        child.emitExitBeforeStdoutDrain(0, {
          id: message.id,
          result: {
            data: [{ id: "thread", cwd: "/tmp/project", name: null, preview: "Preview", updatedAt: 1 }],
            nextCursor: null,
          },
        });
      }
    });

    await expect(
      listCodexThreads({ codexExecutable: "codex", spawnFn: vi.fn(() => child as never) }),
    ).resolves.toHaveLength(1);
  });

  it("enforces a timeout for each request", async () => {
    vi.useFakeTimers();
    const child = new FakeCodexProcess(() => undefined);
    const result = listCodexThreads({
      codexExecutable: "codex",
      processTimeoutMs: 1_000,
      requestTimeoutMs: 20,
      spawnFn: vi.fn(() => child as never),
    });
    const rejection = expect(result).rejects.toThrow("request timed out: initialize");

    await vi.advanceTimersByTimeAsync(21);
    await rejection;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("enforces an overall process timeout", async () => {
    vi.useFakeTimers();
    const child = new FakeCodexProcess(() => undefined);
    const result = listCodexThreads({
      codexExecutable: "codex",
      processTimeoutMs: 20,
      requestTimeoutMs: 1_000,
      spawnFn: vi.fn(() => child as never),
    });
    const rejection = expect(result).rejects.toThrow("process timed out while listing threads");

    await vi.advanceTimersByTimeAsync(21);
    await rejection;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("escalates to SIGKILL when app-server ignores graceful shutdown", async () => {
    vi.useFakeTimers();
    const child = new FakeCodexProcess((message, child) => {
      if (message.method === "initialize") {
        child.sendJson({ id: message.id, result: {} });
      } else if (message.method === "thread/list") {
        child.sendJson({ id: message.id, result: { data: [], nextCursor: null } });
      }
    }, true);
    const result = listCodexThreads({ codexExecutable: "codex", spawnFn: vi.fn(() => child as never) });
    const resolved = expect(result).resolves.toEqual([]);

    await vi.advanceTimersByTimeAsync(251);
    await resolved;
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });
});

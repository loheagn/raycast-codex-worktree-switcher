// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export type ThreadSummary = {
  id: string;
  cwd: string;
  name: string | null;
  preview: string;
  updatedAt: number;
};

type SpawnFn = (
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
    stdio: ["pipe", "pipe", "pipe"];
    windowsHide: boolean;
  },
) => ChildProcessWithoutNullStreams;

type ListCodexThreadsOptions = {
  codexExecutable: string;
  codexHome?: string;
  requestTimeoutMs?: number;
  processTimeoutMs?: number;
  spawnFn?: SpawnFn;
};

type JsonObject = Record<string, unknown>;

type PendingRequest = {
  method: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_PROCESS_TIMEOUT_MS = 60_000;
const PROCESS_SHUTDOWN_TIMEOUT_MS = 250;
const THREAD_PAGE_SIZE = 100;
const THREAD_SOURCE_KINDS = ["cli", "vscode", "exec", "appServer", "unknown"] as const;

class AppServerConnection {
  private buffer = "";
  private closedError: Error | null = null;
  private exitError: Error | null = null;
  private stdoutEnded = false;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly requestTimeoutMs: number,
  ) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleStdoutChunk(chunk));
    child.stdout.on("end", () => this.handleStdoutEnd());
    child.stdout.on("error", () => this.fail(new Error("Codex app-server stdout failed")));

    // Drain stderr so a noisy subprocess cannot block. Its contents may contain
    // user data, so they are deliberately neither retained nor logged.
    child.stderr.on("data", () => undefined);
    child.stderr.on("error", () => undefined);
    child.stderr.resume();

    child.stdin.on("error", () => this.fail(new Error("Codex app-server stdin failed")));
    child.once("error", () => this.fail(new Error("Codex app-server process failed to start")));
    child.once("exit", (code, signal) => {
      const detail = code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
      this.exitError = new Error(`Codex app-server exited before completing the request (${detail})`);
      if (this.stdoutEnded) {
        this.fail(this.exitError);
      }
    });
  }

  request(method: string, params: JsonObject): Promise<unknown> {
    if (this.closedError) {
      return Promise.reject(this.closedError);
    }

    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, { method, resolve, reject, timeout });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.rejectRequest(id, asError(error, `Failed to write Codex app-server request: ${method}`));
      }
    });
  }

  notify(method: string, params: JsonObject): void {
    if (this.closedError) {
      throw this.closedError;
    }
    this.write({ method, params });
  }

  async dispose(): Promise<void> {
    this.fail(new Error("Codex app-server connection closed"));

    if (!this.child.stdin.destroyed) {
      this.child.stdin.end();
    }
    if (hasProcessExited(this.child)) {
      return;
    }

    const gracefulClose = waitForProcessClose(this.child, PROCESS_SHUTDOWN_TIMEOUT_MS);
    this.child.kill("SIGTERM");
    if (await gracefulClose) {
      return;
    }

    const forcedClose = waitForProcessClose(this.child, PROCESS_SHUTDOWN_TIMEOUT_MS);
    this.child.kill("SIGKILL");
    await forcedClose;
  }

  private write(message: JsonObject): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleStdoutChunk(chunk: string): void {
    this.buffer += chunk;

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.handleLine(line);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleStdoutEnd(): void {
    this.stdoutEnded = true;
    const trailingLine = this.buffer.replace(/\r$/, "");
    this.buffer = "";
    if (trailingLine.trim().length > 0) {
      this.handleLine(trailingLine);
    }
    if (this.exitError) {
      this.fail(this.exitError);
    }
  }

  private handleLine(line: string): void {
    if (line.trim().length === 0 || this.closedError) {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.fail(new Error("Codex app-server returned invalid JSON"));
      return;
    }

    if (!isJsonObject(message)) {
      this.fail(new Error("Codex app-server returned an invalid message"));
      return;
    }

    const id = message.id;
    if (typeof id !== "number") {
      // Notifications and server-initiated requests are unrelated to the
      // read-only thread listing operation.
      return;
    }

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }

    if ("error" in message && message.error != null) {
      this.rejectRequest(id, jsonRpcError(pending.method, message.error));
      return;
    }
    if (!("result" in message)) {
      this.rejectRequest(id, new Error(`Codex app-server returned a malformed response: ${pending.method}`));
      return;
    }

    this.pendingRequests.delete(id);
    clearTimeout(pending.timeout);
    pending.resolve(message.result);
  }

  private rejectRequest(id: number, error: Error): void {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(id);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  private fail(error: Error): void {
    if (this.closedError) {
      return;
    }
    this.closedError = error;

    for (const [id, pending] of this.pendingRequests) {
      this.pendingRequests.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }
}

export async function listCodexThreads(options: ListCodexThreadsOptions): Promise<ThreadSummary[]> {
  const executable = expandTilde(options.codexExecutable.trim());
  if (executable.length === 0) {
    throw new Error("A Codex executable is required");
  }

  const requestTimeoutMs = positiveTimeout(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, "requestTimeoutMs");
  const processTimeoutMs = positiveTimeout(options.processTimeoutMs, DEFAULT_PROCESS_TIMEOUT_MS, "processTimeoutMs");
  const spawnFn: SpawnFn = options.spawnFn ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
  const env = { ...process.env };
  env.PATH = executableSearchPath(executable, env.PATH);
  if (options.codexHome) {
    env.CODEX_HOME = expandTilde(options.codexHome);
  }

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnFn(executable, ["app-server", "--stdio"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw asError(error, "Failed to start Codex app-server");
  }

  const connection = new AppServerConnection(child, requestTimeoutMs);
  let processTimeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    processTimeout = setTimeout(
      () => reject(new Error("Codex app-server process timed out while listing threads")),
      processTimeoutMs,
    );
  });

  try {
    return await Promise.race([listAllThreads(connection), timedOut]);
  } finally {
    if (processTimeout) {
      clearTimeout(processTimeout);
    }
    await connection.dispose();
  }
}

async function listAllThreads(connection: AppServerConnection): Promise<ThreadSummary[]> {
  await connection.request("initialize", {
    clientInfo: {
      name: "codex_worktree_switcher",
      title: "Codex Worktree Switcher",
      version: "0.1.0",
    },
  });
  connection.notify("initialized", {});

  const threads: ThreadSummary[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let hasMorePages = true;

  while (hasMorePages) {
    const result = parseThreadListResponse(
      await connection.request("thread/list", {
        archived: false,
        cursor,
        limit: THREAD_PAGE_SIZE,
        sortDirection: "desc",
        sortKey: "updated_at",
        sourceKinds: [...THREAD_SOURCE_KINDS],
      }),
    );
    threads.push(...result.data);

    if (result.nextCursor === null) {
      hasMorePages = false;
      continue;
    }
    if (seenCursors.has(result.nextCursor)) {
      throw new Error("Codex app-server returned a repeated pagination cursor");
    }
    seenCursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }

  return threads.sort((left, right) => right.updatedAt - left.updatedAt);
}

function parseThreadListResponse(value: unknown): { data: ThreadSummary[]; nextCursor: string | null } {
  if (!isJsonObject(value) || !Array.isArray(value.data)) {
    throw new Error("Codex app-server returned an invalid thread list");
  }

  const nextCursor = value.nextCursor;
  if (nextCursor !== null && nextCursor !== undefined && typeof nextCursor !== "string") {
    throw new Error("Codex app-server returned an invalid pagination cursor");
  }

  return {
    data: value.data.map(parseThreadSummary),
    nextCursor: nextCursor ?? null,
  };
}

function parseThreadSummary(value: unknown): ThreadSummary {
  if (
    !isJsonObject(value) ||
    typeof value.id !== "string" ||
    typeof value.cwd !== "string" ||
    typeof value.preview !== "string" ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt) ||
    (value.name !== null && value.name !== undefined && typeof value.name !== "string")
  ) {
    throw new Error("Codex app-server returned invalid thread metadata");
  }

  return {
    id: value.id,
    cwd: value.cwd,
    name: value.name ?? null,
    preview: value.preview,
    updatedAt: value.updatedAt,
  };
}

function jsonRpcError(method: string, value: unknown): Error {
  if (!isJsonObject(value)) {
    return new Error(`Codex app-server request failed: ${method}`);
  }

  const code = typeof value.code === "number" || typeof value.code === "string" ? ` (${value.code})` : "";
  const message = typeof value.message === "string" && value.message.trim().length > 0 ? `: ${value.message}` : "";
  return new Error(`Codex app-server request failed: ${method}${code}${message}`);
}

function positiveTimeout(value: number | undefined, fallback: number, name: string): number {
  const timeout = value ?? fallback;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return timeout;
}

function expandTilde(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? new Error(fallbackMessage, { cause: value }) : new Error(fallbackMessage);
}

function executableSearchPath(executable: string, inheritedPath: string | undefined): string {
  const entries = [
    ...(path.isAbsolute(executable) ? [path.dirname(executable)] : []),
    path.dirname(process.execPath),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...(inheritedPath?.split(path.delimiter) ?? []),
  ].filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

function hasProcessExited(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForProcessClose(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (hasProcessExited(child)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    function finish(closed: boolean): void {
      clearTimeout(timeout);
      child.off("close", onClose);
      resolve(closed);
    }

    function onClose(): void {
      finish(true);
    }

    child.once("close", onClose);
    const timeout = setTimeout(() => finish(false), timeoutMs);
  });
}

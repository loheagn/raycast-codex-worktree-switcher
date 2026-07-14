// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { listCodexThreadMetadata } from "../src/codex-desktop";
import type { ProcessRunner } from "../src/process";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

function catalogRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hostId: "local",
    id: "current",
    name: "Current Desktop session",
    cwd: "/repo/current",
    createdAt: 1_784_025_639,
    updatedAt: 1_784_025_639,
    ...overrides,
  };
}

function stateRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "current",
    cwd: "",
    name: "",
    source: "unknown",
    recencyAt: 1_784_031_863,
    updatedAt: 1_784_032_731,
    archived: 0,
    ...overrides,
  };
}

describe("listCodexThreadMetadata", () => {
  it("reads only metadata, enriches sparse Desktop state, and filters archived and subagent rows", async () => {
    const catalogPath = "/Codex Home ; $()/sqlite/codex-dev.db";
    const statePath = "/Codex Home ; $()/state_5.sqlite";
    const run = vi.fn<ProcessRunner>(async (_executable, args) => {
      const databasePath = args[4];
      if (databasePath === catalogPath) {
        return {
          stdout: JSON.stringify([
            catalogRow(),
            catalogRow({ id: "archived", name: "Archived", cwd: "/repo/archived" }),
            catalogRow({ id: "subagent", name: "Subagent", cwd: "/repo/subagent" }),
            catalogRow({ name: "Stale duplicate", cwd: "/repo/stale", updatedAt: 1_700_000_000 }),
          ]),
          stderr: "",
        };
      }
      if (databasePath === statePath) {
        return {
          stdout: JSON.stringify([
            stateRow({ name: "State-generated title" }),
            stateRow({
              id: "state-only",
              cwd: "/repo/state-only",
              name: "State-only session",
              source: "cli",
              recencyAt: 1_784_030_000,
            }),
            stateRow({
              id: "untitled",
              cwd: "/repo/untitled",
              name: "",
              source: "exec",
              recencyAt: 1_784_029_000,
            }),
            stateRow({ id: "archived", cwd: "/repo/archived", name: "Archived", archived: 1 }),
            stateRow({
              id: "subagent",
              cwd: "/repo/subagent",
              name: "Subagent",
              source: '{"subagent":"review"}',
            }),
          ]),
          stderr: "",
        };
      }
      throw new Error("unexpected database");
    });

    const result = await listCodexThreadMetadata({
      codexHome: "/unused",
      catalogDatabasePath: catalogPath,
      stateDatabasePath: statePath,
      run,
    });

    expect(result.map(({ id }) => id)).toEqual(["current", "state-only", "untitled"]);
    expect(result[2]?.name).toBe("");
    expect(result[0]).toEqual({
      id: "current",
      cwd: "/repo/current",
      cwdCandidates: ["/repo/current"],
      name: "Current Desktop session",
      recencyAt: 1_784_031_863_000,
      updatedAt: 1_784_032_731_000,
    });

    expect(run).toHaveBeenCalledTimes(2);
    for (const [executable, args, options] of run.mock.calls) {
      expect(executable).toBe("/usr/bin/sqlite3");
      expect(args.slice(0, 4)).toEqual(["-readonly", "-json", "-cmd", ".timeout 5000"]);
      expect([catalogPath, statePath]).toContain(args[4]);
      expect(options).toEqual({ maxBuffer: 8 * 1024 * 1024, timeoutMs: 5_000 });
    }
    const queries = run.mock.calls.map(([, args]) => args[5]);
    expect(queries.join("\n")).not.toMatch(/\b(?:body|messages?)\b|preview|first_user_message|rollout_path/);
    expect(queries.every((query) => query?.includes("PRAGMA query_only = ON"))).toBe(true);
    expect(queries.join("\n")).toContain("WHERE archived = 0");
    expect(queries.join("\n")).toContain("source IN ('cli', 'vscode', 'exec', 'appServer', 'unknown')");
  });

  it("uses a nonblank catalog display title but preserves a valid state title when the catalog title is blank", async () => {
    const catalogPath = "/catalog.db";
    const statePath = "/state.db";
    const run: ProcessRunner = async (_executable, args) => {
      if (args[4] === catalogPath) {
        return {
          stdout: JSON.stringify([
            catalogRow({ id: "renamed", name: "Desktop rename" }),
            catalogRow({ id: "catalog-blank", name: "" }),
          ]),
          stderr: "",
        };
      }
      return {
        stdout: JSON.stringify([
          stateRow({ id: "renamed", name: "Generated state title" }),
          stateRow({ id: "catalog-blank", name: "State title", recencyAt: 1_784_031_000 }),
        ]),
        stderr: "",
      };
    };

    const result = await listCodexThreadMetadata({
      codexHome: "/unused",
      catalogDatabasePath: catalogPath,
      stateDatabasePath: statePath,
      run,
    });

    expect(result.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "renamed", name: "Desktop rename" },
      { id: "catalog-blank", name: "State title" },
    ]);
  });

  it("selects the highest compatible state database version without using catalog coverage", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "codex-metadata-freshness-"));
    temporaryDirectories.push(codexHome);
    const legacyDirectory = path.join(codexHome, "sqlite");
    const staleState = path.join(codexHome, "state_5.sqlite");
    const freshState = path.join(codexHome, "state_6.sqlite");
    await mkdir(legacyDirectory);
    await Promise.all([writeFile(staleState, "fixture"), writeFile(freshState, "fixture")]);

    const run: ProcessRunner = async (_executable, args) => {
      const databasePath = args[4] ?? "";
      if (databasePath.endsWith("codex-dev.db")) {
        return {
          stdout: JSON.stringify([
            catalogRow({ cwd: "/catalog/stale" }),
            catalogRow({ id: "older-only", name: "Older only", cwd: "/catalog/older" }),
          ]),
          stderr: "",
        };
      }
      if (databasePath === staleState) {
        return {
          stdout: JSON.stringify([
            stateRow({ cwd: "/state/stale", name: "Stale state", recencyAt: 1_700_000_000, updatedAt: 1_700_000_000 }),
            stateRow({
              id: "older-only",
              cwd: "/state/older",
              name: "Older only",
              recencyAt: 1_700_000_000,
              updatedAt: 1_700_000_000,
            }),
          ]),
          stderr: "",
        };
      }
      if (databasePath === freshState) {
        return {
          stdout: JSON.stringify([
            stateRow({ cwd: "/state/fresh", name: "Fresh state", recencyAt: 1_780_000_000, updatedAt: 1_780_000_000 }),
          ]),
          stderr: "",
        };
      }
      throw new Error("unexpected database");
    };

    await expect(listCodexThreadMetadata({ codexHome, run })).resolves.toEqual([
      {
        id: "current",
        cwd: "/state/fresh",
        cwdCandidates: ["/state/fresh", "/catalog/stale"],
        name: "Current Desktop session",
        recencyAt: 1_780_000_000_000,
        updatedAt: 1_784_025_639_000,
      },
    ]);
  });

  it("keeps a readable root database authoritative over a fresher legacy snapshot", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "codex-metadata-same-version-"));
    temporaryDirectories.push(codexHome);
    const legacyDirectory = path.join(codexHome, "sqlite");
    const rootState = path.join(codexHome, "state_5.sqlite");
    const legacyState = path.join(legacyDirectory, "state_5.sqlite");
    await mkdir(legacyDirectory);
    await Promise.all([writeFile(rootState, "fixture"), writeFile(legacyState, "fixture")]);

    const run: ProcessRunner = async (_executable, args) => {
      const databasePath = args[4] ?? "";
      if (databasePath.endsWith("codex-dev.db")) {
        return {
          stdout: JSON.stringify([
            catalogRow(),
            catalogRow({ id: "catalog-match", name: "Catalog match", cwd: "/catalog-match" }),
          ]),
          stderr: "",
        };
      }
      if (databasePath === rootState) {
        return {
          stdout: JSON.stringify([
            stateRow({ cwd: "/root/stale", updatedAt: 1_700_000_000 }),
            stateRow({ id: "catalog-match", cwd: "/root/catalog-match", updatedAt: 1_700_000_001 }),
          ]),
          stderr: "",
        };
      }
      if (databasePath === legacyState) {
        return {
          stdout: JSON.stringify([stateRow({ cwd: "/legacy/fresh", updatedAt: 1_780_000_000 })]),
          stderr: "",
        };
      }
      throw new Error("unexpected database");
    };

    await expect(listCodexThreadMetadata({ codexHome, run })).resolves.toEqual([
      {
        id: "catalog-match",
        cwd: "/root/catalog-match",
        cwdCandidates: ["/root/catalog-match", "/catalog-match"],
        name: "Catalog match",
        recencyAt: 1_784_031_863_000,
        updatedAt: 1_784_025_639_000,
      },
      {
        id: "current",
        cwd: "/root/stale",
        cwdCandidates: ["/root/stale", "/repo/current"],
        name: "Current Desktop session",
        recencyAt: 1_784_031_863_000,
        updatedAt: 1_784_025_639_000,
      },
    ]);
  });

  it("prefers the root layout when same-version databases have equal freshness", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "codex-metadata-root-tie-"));
    temporaryDirectories.push(codexHome);
    const legacyDirectory = path.join(codexHome, "sqlite");
    const rootState = path.join(codexHome, "state_5.sqlite");
    const legacyState = path.join(legacyDirectory, "state_5.sqlite");
    await mkdir(legacyDirectory);
    await Promise.all([writeFile(rootState, "fixture"), writeFile(legacyState, "fixture")]);

    const run: ProcessRunner = async (_executable, args) => {
      const databasePath = args[4] ?? "";
      if (databasePath.endsWith("codex-dev.db")) {
        return { stdout: "[]", stderr: "" };
      }
      if (databasePath === rootState) {
        return { stdout: JSON.stringify([stateRow({ cwd: "/root" })]), stderr: "" };
      }
      if (databasePath === legacyState) {
        return { stdout: JSON.stringify([stateRow({ cwd: "/legacy" })]), stderr: "" };
      }
      throw new Error("unexpected database");
    };

    const result = await listCodexThreadMetadata({ codexHome, run });

    expect(result[0]?.cwd).toBe("/root");
  });

  it("probes the legacy layout when no state database can be discovered", async () => {
    const warnings: string[] = [];
    const run = vi.fn<ProcessRunner>(async (_executable, args) => {
      const databasePath = args[4] ?? "";
      if (databasePath.endsWith("codex-dev.db")) {
        return { stdout: JSON.stringify([catalogRow()]), stderr: "" };
      }
      if (databasePath === "/codex/sqlite/state_5.sqlite") {
        if (args[5]?.includes("recency_at")) {
          throw new Error("no such column: recency_at");
        }
        return { stdout: JSON.stringify([stateRow()]), stderr: "" };
      }
      throw new Error("state database unavailable");
    });

    await expect(
      listCodexThreadMetadata({
        codexHome: "/codex",
        run,
        onMetadataWarning: (warning) => warnings.push(warning),
      }),
    ).resolves.toHaveLength(1);
    expect(run.mock.calls.some(([, args]) => args[5]?.includes('updated_at AS "recencyAt"'))).toBe(true);
    const legacyQueries = run.mock.calls
      .filter(([, args]) => args[4] === "/codex/sqlite/state_5.sqlite")
      .map(([, args]) => args[5]);
    expect(legacyQueries).toHaveLength(3);
    expect(
      legacyQueries.every(
        (query) =>
          query?.includes("WHERE archived = 0") &&
          query.includes("source IN ('cli', 'vscode', 'exec', 'appServer', 'unknown')"),
      ),
    ).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("falls back to a compatible legacy database when discovered root databases cannot be read", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "codex-metadata-layout-"));
    temporaryDirectories.push(codexHome);
    const legacyDirectory = path.join(codexHome, "sqlite");
    const rootState = path.join(codexHome, "state_6.sqlite");
    const lowerRootState = path.join(codexHome, "state_5.sqlite");
    const legacyState = path.join(legacyDirectory, "state_5.sqlite");
    await mkdir(legacyDirectory);
    await Promise.all([
      writeFile(rootState, "fixture"),
      writeFile(lowerRootState, "fixture"),
      writeFile(legacyState, "fixture"),
    ]);

    const warnings: string[] = [];
    const run: ProcessRunner = async (_executable, args) => {
      const databasePath = args[4] ?? "";
      if (databasePath.endsWith("codex-dev.db")) {
        return { stdout: JSON.stringify([catalogRow()]), stderr: "" };
      }
      if (databasePath === rootState) {
        throw new Error("root database unreadable");
      }
      if (databasePath === lowerRootState) {
        throw new Error("root database schema incompatible");
      }
      if (databasePath === legacyState) {
        return { stdout: JSON.stringify([stateRow()]), stderr: "" };
      }
      throw new Error("unexpected database");
    };

    await expect(
      listCodexThreadMetadata({
        codexHome,
        run,
        onMetadataWarning: (warning) => warnings.push(warning),
      }),
    ).resolves.toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("treats a discovered legacy-only layout as authoritative without a warning", async () => {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "codex-metadata-legacy-"));
    temporaryDirectories.push(codexHome);
    const legacyDirectory = path.join(codexHome, "sqlite");
    const legacyState = path.join(legacyDirectory, "state_5.sqlite");
    await mkdir(legacyDirectory);
    await writeFile(legacyState, "fixture");

    const warnings: string[] = [];
    const run: ProcessRunner = async (_executable, args) => {
      const databasePath = args[4] ?? "";
      if (databasePath.endsWith("codex-dev.db")) {
        return { stdout: JSON.stringify([catalogRow()]), stderr: "" };
      }
      if (databasePath === legacyState) {
        return { stdout: JSON.stringify([stateRow()]), stderr: "" };
      }
      throw new Error("unexpected database");
    };

    await expect(
      listCodexThreadMetadata({
        codexHome,
        run,
        onMetadataWarning: (warning) => warnings.push(warning),
      }),
    ).resolves.toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("skips catalog rows whose archive state cannot be verified", async () => {
    const warnings: string[] = [];
    const run: ProcessRunner = async (_executable, args) => {
      if (args[4]?.endsWith("codex-dev.db")) {
        return { stdout: JSON.stringify([catalogRow()]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    };

    await expect(
      listCodexThreadMetadata({
        codexHome: "/codex",
        run,
        onMetadataWarning: (warning) => warnings.push(warning),
      }),
    ).resolves.toEqual([]);
    expect(warnings).toEqual(["Codex Desktop 会话目录尚未同步完成；部分新会话暂时无法验证。"]);
  });

  it("falls back to state metadata when the private catalog schema is unavailable", async () => {
    const warnings: string[] = [];
    const run: ProcessRunner = async (_executable, args) => {
      if (args[4]?.endsWith("codex-dev.db")) {
        return { stdout: "not-json", stderr: "" };
      }
      return {
        stdout: JSON.stringify([stateRow({ id: "state-only", cwd: "/repo", name: "State-only", source: "cli" })]),
        stderr: "",
      };
    };

    await expect(
      listCodexThreadMetadata({
        codexHome: "/codex",
        run,
        onMetadataWarning: (warning) => warnings.push(warning),
      }),
    ).resolves.toHaveLength(1);
    expect(warnings).toEqual(["Codex Desktop 会话目录不可用；尚未写入核心状态库的新会话可能缺失。"]);
  });

  it("rejects malformed state output without exposing its contents", async () => {
    const catalogPath = "/catalog.db";
    const statePath = "/state.db";
    const run: ProcessRunner = async (_executable, args) => {
      if (args[4] === catalogPath) {
        return { stdout: "[]", stderr: "" };
      }
      return { stdout: "not-json", stderr: "" };
    };

    await expect(
      listCodexThreadMetadata({
        codexHome: "/unused",
        catalogDatabasePath: catalogPath,
        stateDatabasePath: statePath,
        run,
      }),
    ).rejects.toThrow("Could not read Codex Desktop thread metadata");
  });

  it("normalizes mixed second and millisecond timestamps before sorting", async () => {
    const catalogPath = "/catalog.db";
    const statePath = "/state.db";
    const run: ProcessRunner = async (_executable, args) => {
      if (args[4] === catalogPath) {
        return {
          stdout: JSON.stringify([
            catalogRow({ id: "seconds", name: "Seconds", cwd: "/seconds" }),
            catalogRow({ id: "milliseconds", name: "Milliseconds", cwd: "/milliseconds" }),
          ]),
          stderr: "",
        };
      }
      return {
        stdout: JSON.stringify([
          stateRow({ id: "seconds", cwd: "/seconds", name: "Seconds", recencyAt: 1_780_000_000 }),
          stateRow({
            id: "milliseconds",
            cwd: "/milliseconds",
            name: "Milliseconds",
            recencyAt: 1_700_000_000_000,
          }),
        ]),
        stderr: "",
      };
    };

    const result = await listCodexThreadMetadata({
      codexHome: "/unused",
      catalogDatabasePath: catalogPath,
      stateDatabasePath: statePath,
      run,
    });

    expect(result.map(({ id }) => id)).toEqual(["seconds", "milliseconds"]);
  });
});

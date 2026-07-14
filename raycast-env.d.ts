/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Codex CLI - Absolute path to the Codex CLI executable. */
  "codexExecutable": string,
  /** Codex Home - Directory containing Codex sessions and state. */
  "codexHome": string,
  /** Zed App - Zed application to use when opening a worktree. */
  "zedApp"?: import("@raycast/api").Application
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `switch-codex-worktree` command */
  export type SwitchCodexWorktree = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `switch-codex-worktree` command */
  export type SwitchCodexWorktree = {}
}


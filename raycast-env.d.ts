/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Codex Home - Directory containing Codex Desktop metadata. */
  "codexHome": string,
  /** Default Editor - Editor used by the open actions. */
  "defaultEditor": "zed" | "vscode" | "vscode-insiders",
  /** Zed App - Zed application to use when opening a worktree. */
  "zedApp"?: import("@raycast/api").Application,
  /** VS Code App - Visual Studio Code application to use when opening a worktree. */
  "vscodeApp"?: import("@raycast/api").Application,
  /** VS Code Insiders App - Visual Studio Code Insiders application to use when opening a worktree. */
  "vscodeInsidersApp"?: import("@raycast/api").Application
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


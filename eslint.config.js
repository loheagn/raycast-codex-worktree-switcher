// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");

module.exports = defineConfig([
  ...raycastConfig,
  {
    rules: {
      "@raycast/prefer-title-case": [
        "warn",
        {
          extraFixedCaseWords: ["API", "CLI", "Codex", "Git", "Zed"],
        },
      ],
    },
  },
]);

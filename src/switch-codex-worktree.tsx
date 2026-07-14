// SPDX-FileCopyrightText: 2026 loheagn <loheagn@icloud.com>
// SPDX-License-Identifier: MIT

import {
  Action,
  ActionPanel,
  type Application,
  closeMainWindow,
  getPreferenceValues,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";

import { listCodexThreadMetadata } from "./codex-desktop";
import { buildWorktreeSessions, type WorktreeSession, threadActivityDate, threadCwdCandidates } from "./sessions";
import { validateGitWorktree, validateGitWorktrees } from "./worktrees";
import { openWorktreeInZed, resolveZedCli, type ZedOpenMode } from "./zed";

interface Preferences {
  codexHome: string;
  zedApp?: Application;
}

async function loadWorktreeSessions(codexHome: string): Promise<WorktreeSession[]> {
  const warnings: string[] = [];
  const threads = await listCodexThreadMetadata({
    codexHome,
    onMetadataWarning: (warning) => warnings.push(warning),
  });
  const worktreesByCwd = await validateGitWorktrees(threads.flatMap(threadCwdCandidates));
  if (warnings.length > 0) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Codex 会话列表已降级加载",
      message: [...new Set(warnings)].join(" "),
    });
  }
  return buildWorktreeSessions(threads, worktreesByCwd);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误";
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const { data, error, isLoading, revalidate } = usePromise(loadWorktreeSessions, [preferences.codexHome]);
  const sessions = data ?? [];

  async function refresh(): Promise<void> {
    try {
      await revalidate();
    } catch (refreshError) {
      await showToast({
        message: errorMessage(refreshError),
        style: Toast.Style.Failure,
        title: "刷新 Codex 会话失败",
      });
    }
  }

  async function openSession(session: WorktreeSession, mode: ZedOpenMode): Promise<void> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: mode === "existing" ? "正在切换 Zed Git Checkout" : "正在新窗口打开 Git Checkout",
    });

    try {
      const currentWorktree = await validateGitWorktree(session.worktree.worktreeRoot);
      if (!currentWorktree || currentWorktree.worktreeRoot !== session.worktree.worktreeRoot) {
        throw new Error("目录已删除、失效或不再是 Git checkout");
      }

      const zedCli = await resolveZedCli(preferences.zedApp?.path);
      await openWorktreeInZed(zedCli, currentWorktree.worktreeRoot, mode);
      toast.style = Toast.Style.Success;
      toast.title = mode === "existing" ? "已在 Zed 中切换 Git Checkout" : "已在新 Zed 窗口打开 Git Checkout";
      toast.message = currentWorktree.worktreeRoot;
      await closeMainWindow();
    } catch (openError) {
      toast.style = Toast.Style.Failure;
      toast.title = "无法打开 Git Checkout";
      toast.message = errorMessage(openError);
      await refresh();
    }
  }

  const sharedActions = (
    <ActionPanel.Section>
      <Action
        title="Refresh Sessions"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </ActionPanel.Section>
  );

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search sessions, repositories, and paths…">
      {sessions.map((session) => (
        <List.Item
          key={session.id}
          id={session.id}
          icon={Icon.Code}
          title={session.title}
          subtitle={{
            value: `${session.worktree.repositoryName} › ${session.worktree.worktreeName}`,
            tooltip: session.worktree.worktreeRoot,
          }}
          keywords={[
            session.worktree.repositoryName,
            session.worktree.repositoryRoot,
            session.worktree.worktreeName,
            session.worktree.worktreeRoot,
            session.sourceCwd,
          ]}
          accessories={[{ date: threadActivityDate(session.lastActiveAt), tooltip: "Last active" }]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action
                  title="Open in Existing Zed Window"
                  icon={Icon.AppWindow}
                  onAction={() => openSession(session, "existing")}
                />
                <Action
                  title="Open in New Zed Window"
                  icon={Icon.NewFolder}
                  onAction={() => openSession(session, "new")}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action.CopyToClipboard
                  title="Copy Checkout Path"
                  content={session.worktree.worktreeRoot}
                  shortcut={Keyboard.Shortcut.Common.CopyPath}
                />
                <Action.ShowInFinder path={session.worktree.worktreeRoot} />
              </ActionPanel.Section>
              {sharedActions}
            </ActionPanel>
          }
        />
      ))}
      {!isLoading && sessions.length === 0 ? (
        <List.EmptyView
          icon={error ? Icon.ExclamationMark : Icon.Code}
          title={error ? "Could Not Load Codex Sessions" : "No Local Git Sessions"}
          description={
            error
              ? errorMessage(error)
              : "Only unarchived Codex sessions whose directories are valid local Git checkouts are shown."
          }
          actions={<ActionPanel>{sharedActions}</ActionPanel>}
        />
      ) : null}
    </List>
  );
}

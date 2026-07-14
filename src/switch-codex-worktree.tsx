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

import { listCodexThreads } from "./codex-app-server";
import { buildWorktreeSessions, type WorktreeSession, threadUpdatedAtDate } from "./sessions";
import { validateLinkedWorktree, validateLinkedWorktrees } from "./worktrees";
import { openWorktreeInZed, resolveZedCli, type ZedOpenMode } from "./zed";

interface Preferences {
  codexExecutable: string;
  codexHome: string;
  zedApp?: Application;
}

interface RepositoryGroup {
  repositoryRoot: string;
  repositoryName: string;
  sessions: WorktreeSession[];
}

async function loadWorktreeSessions(codexExecutable: string, codexHome: string): Promise<WorktreeSession[]> {
  const threads = await listCodexThreads({ codexExecutable, codexHome });
  const worktreesByCwd = await validateLinkedWorktrees(threads.map(({ cwd }) => cwd));
  return buildWorktreeSessions(threads, worktreesByCwd);
}

function groupByRepository(sessions: readonly WorktreeSession[]): RepositoryGroup[] {
  const groups = new Map<string, RepositoryGroup>();
  for (const session of sessions) {
    const key = session.worktree.repositoryRoot;
    const group = groups.get(key) ?? {
      repositoryName: session.worktree.repositoryName,
      repositoryRoot: key,
      sessions: [],
    };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误";
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const { data, error, isLoading, revalidate } = usePromise(loadWorktreeSessions, [
    preferences.codexExecutable,
    preferences.codexHome,
  ]);
  const sessions = data ?? [];
  const groups = groupByRepository(sessions);

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
      title: mode === "existing" ? "正在切换 Zed Worktree" : "正在新窗口打开 Worktree",
    });

    try {
      const currentWorktree = await validateLinkedWorktree(session.worktree.worktreeRoot);
      if (!currentWorktree || currentWorktree.worktreeRoot !== session.worktree.worktreeRoot) {
        throw new Error("Worktree 已删除、失效或不再是 linked worktree");
      }

      const zedCli = await resolveZedCli(preferences.zedApp?.path);
      await openWorktreeInZed(zedCli, currentWorktree.worktreeRoot, mode);
      toast.style = Toast.Style.Success;
      toast.title = mode === "existing" ? "已在 Zed 中切换 Worktree" : "已在新 Zed 窗口打开 Worktree";
      toast.message = currentWorktree.worktreeRoot;
      await closeMainWindow();
    } catch (openError) {
      toast.style = Toast.Style.Failure;
      toast.title = "无法打开 Worktree";
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
      {groups.map((group) => (
        <List.Section
          key={group.repositoryRoot}
          title={group.repositoryName}
          subtitle={`${group.sessions.length} ${group.sessions.length === 1 ? "session" : "sessions"}`}
        >
          {group.sessions.map((session) => (
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
                session.preview,
                session.worktree.repositoryName,
                session.worktree.repositoryRoot,
                session.worktree.worktreeName,
                session.worktree.worktreeRoot,
                session.sourceCwd,
              ]}
              accessories={[{ date: threadUpdatedAtDate(session.updatedAt), tooltip: "Last updated" }]}
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
                      title="Copy Worktree Path"
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
        </List.Section>
      ))}
      {!isLoading && groups.length === 0 ? (
        <List.EmptyView
          icon={error ? Icon.ExclamationMark : Icon.Code}
          title={error ? "Could Not Load Codex Sessions" : "No Linked Worktree Sessions"}
          description={
            error
              ? errorMessage(error)
              : "Only unarchived Codex sessions whose directories are active linked Git worktrees are shown."
          }
          actions={<ActionPanel>{sharedActions}</ActionPanel>}
        />
      ) : null}
    </List>
  );
}

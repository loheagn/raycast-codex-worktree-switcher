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
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";

import { listCodexThreadMetadata, openCodexThread } from "./codex-desktop";
import { editorName, type EditorId, type EditorOpenMode, openWorktreeInEditor, resolveEditorCli } from "./editors";
import { openSessionTargets } from "./session-opener";
import { buildWorktreeSessions, type WorktreeSession, threadActivityDate, threadCwdCandidates } from "./sessions";
import { validateGitWorktree, validateGitWorktrees } from "./worktrees";

interface Preferences {
  codexHome: string;
  defaultEditor?: EditorId;
  zedApp?: Application;
  vscodeApp?: Application;
  vscodeInsidersApp?: Application;
}

function editorApplicationPath(preferences: Preferences, editor: EditorId): string | undefined {
  switch (editor) {
    case "zed":
      return preferences.zedApp?.path;
    case "vscode":
      return preferences.vscodeApp?.path;
    case "vscode-insiders":
      return preferences.vscodeInsidersApp?.path;
  }
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
  const defaultEditor = preferences.defaultEditor ?? "zed";
  const defaultEditorName = editorName(defaultEditor);
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

  async function openSession(session: WorktreeSession, mode: EditorOpenMode): Promise<void> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title:
        mode === "existing"
          ? `正在切换 ${defaultEditorName} 与 Codex 会话`
          : `正在打开新的 ${defaultEditorName} 窗口并切换 Codex 会话`,
    });

    try {
      const currentWorktree = await validateGitWorktree(session.worktree.worktreeRoot);
      if (!currentWorktree || currentWorktree.worktreeRoot !== session.worktree.worktreeRoot) {
        throw new Error("目录已删除、失效或不再是 Git checkout");
      }

      const editorCli = await resolveEditorCli(defaultEditor, editorApplicationPath(preferences, defaultEditor));
      const openResult = await openSessionTargets({
        openCodex: () => openCodexThread(session.id),
        openEditor: () => openWorktreeInEditor(defaultEditor, editorCli, currentWorktree.worktreeRoot, mode),
      });

      if (openResult.status !== "success") {
        switch (openResult.status) {
          case "codex-failed":
            await toast.hide();
            await showHUD(`已打开 ${defaultEditorName}，但 Codex 会话切换失败：${errorMessage(openResult.error)}`);
            return;
          case "editor-failed":
            toast.style = Toast.Style.Failure;
            toast.title = `已请求切换 Codex 会话，但无法在 ${defaultEditorName} 中打开 Git Checkout`;
            toast.message = errorMessage(openResult.error);
            break;
          case "both-failed":
            toast.style = Toast.Style.Failure;
            toast.title = `无法打开 ${defaultEditorName} 或请求切换 Codex 会话`;
            toast.message = `Codex：${errorMessage(openResult.codexError)}；${defaultEditorName}：${errorMessage(openResult.editorError)}`;
            break;
        }
        await refresh();
        return;
      }

      toast.style = Toast.Style.Success;
      toast.title =
        mode === "existing"
          ? `已打开 ${defaultEditorName} 并请求切换 Codex 会话`
          : `已打开新的 ${defaultEditorName} 窗口并请求切换 Codex 会话`;
      toast.message = currentWorktree.worktreeRoot;
      await closeMainWindow();
    } catch (openError) {
      toast.style = Toast.Style.Failure;
      toast.title = `无法打开 ${defaultEditorName} 或请求切换 Codex 会话`;
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
                  title={`Open in Existing ${defaultEditorName} Window`}
                  icon={Icon.AppWindow}
                  onAction={() => openSession(session, "existing")}
                />
                <Action
                  title={`Open in New ${defaultEditorName} Window`}
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

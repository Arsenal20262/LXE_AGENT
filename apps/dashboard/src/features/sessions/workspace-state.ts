import type { WorkspaceSummaryPayload } from "@lxe/desktop-protocol";

export const WORKSPACE_EXPANDED_STORAGE_KEY = "lxe.window.main.workspaces.expanded.v1";
export type SessionWorkspace = WorkspaceSummaryPayload;
export const directoryName = (directory: string) => directory.replaceAll("\\", "/").replace(/\/+$/, "").split("/").at(-1) || directory;
export const emptyWorkspace = (directory: string): SessionWorkspace => ({
  directory, display_name: null, created_at: 0, session_count: 0, last_active_at: 0,
});

export function workspaceGroups(items: SessionWorkspace[], defaultDirectory: string): SessionWorkspace[] {
  const groups = new Map(items.map(item => [item.directory, item]));
  if (defaultDirectory && !groups.has(defaultDirectory)) groups.set(defaultDirectory, emptyWorkspace(defaultDirectory));
  return [...groups.values()].sort((a, b) => Number(b.directory === defaultDirectory) - Number(a.directory === defaultDirectory)
    || (b.last_active_at || b.created_at) - (a.last_active_at || a.created_at) || a.directory.localeCompare(b.directory));
}

export function workspaceName(directory: string, items: SessionWorkspace[], defaultDirectory: string, defaultName: string): string {
  return items.find(item => item.directory === directory)?.display_name
    || (directory === defaultDirectory ? defaultName : directoryName(directory));
}

export function workspaceLabel(directory: string, items: SessionWorkspace[], defaultDirectory: string, defaultName: string): string {
  const name = workspaceName(directory, items, defaultDirectory, defaultName);
  return items.some(item => item.directory !== directory
    && workspaceName(item.directory, items, defaultDirectory, defaultName) === name) ? `${name} · ${directory}` : name;
}

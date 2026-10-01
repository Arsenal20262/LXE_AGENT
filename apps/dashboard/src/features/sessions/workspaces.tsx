import { useEffect, useState, type ComponentProps } from "react";
import { ChevronRight, Folder, FolderOpen, FolderPlus, Plus } from "lucide-react";
import type { DashboardRpcResult } from "@lxe/desktop-protocol";
import { flattenSessionPages, queryError, useSessionsInfiniteQuery, useSessionStatus } from "../../api/queries";
import { useUiText } from "../../shared/i18n";
import { SessionsIndex } from "./view";
import type { ConversationDisplaySnapshot } from "./display-controller";
import "./workspaces.css";

export type SessionWorkspace = DashboardRpcResult<"sessions.workspaces">["items"][number];
export const directoryName = (directory: string) => directory.replaceAll("\\", "/").replace(/\/+$/, "").split("/").at(-1) || directory;

export function workspaceGroups(items: SessionWorkspace[], defaultDirectory: string): SessionWorkspace[] {
  const groups = new Map(items.map(item => [item.directory, item]));
  if (defaultDirectory && !groups.has(defaultDirectory)) groups.set(defaultDirectory, {
    directory: defaultDirectory, session_count: 0, last_active_at: 0,
  });
  return [...groups.values()].sort((a, b) => Number(b.directory === defaultDirectory) - Number(a.directory === defaultDirectory)
    || b.last_active_at - a.last_active_at || a.directory.localeCompare(b.directory));
}

function workspaceLabel(directory: string, items: SessionWorkspace[], defaultDirectory: string, defaultName: string): string {
  if (directory === defaultDirectory) return defaultName;
  const name = directoryName(directory);
  return items.some(item => item.directory !== directory && directoryName(item.directory) === name) ? directory : name;
}

type IndexProps = ComponentProps<typeof SessionsIndex>;
type WorkspaceIndexProps = Omit<IndexProps, "onNew"> & {
  display: ConversationDisplaySnapshot;
  workspaces: SessionWorkspace[];
  defaultDirectory: string;
  activeDirectory: string;
  enabled: boolean;
  workspaceError: string;
  workspacesLoading: boolean;
  onRetryWorkspaces: () => void;
  onNew: (directory?: string) => void;
  onChoose: () => void;
};

function WorkspaceGroup({ workspace, label, active, props }: {
  workspace: SessionWorkspace; label: string; active: boolean; props: WorkspaceIndexProps;
}) {
  const t = useUiText();
  const [expanded, setExpanded] = useState(active || workspace.directory === props.defaultDirectory);
  useEffect(() => { if (active) setExpanded(true); }, [active, props.selectedSessionId]);
  const query = useSessionsInfiniteQuery("", props.enabled && expanded, workspace.directory);
  const sessions = flattenSessionPages(query.data?.pages);
  const statuses = useSessionStatus(sessions.items.map(item => item.session_id), props.enabled && expanded, props.display, false);
  const [openError, setOpenError] = useState("");
  const open = async () => {
    setOpenError("");
    try { await window.lxe!.desktop.openWorkspace(workspace.directory); }
    catch (error) { setOpenError(queryError(error)); }
  };
  return <section data-workspace-directory={workspace.directory} className={active ? "workspace-group is-active" : "workspace-group"}>
    <div className="workspace-group-header">
      <button type="button" className="workspace-group-toggle" aria-expanded={expanded} title={workspace.directory} onClick={() => setExpanded(value => !value)}>
        <ChevronRight size={13} className={expanded ? "expanded" : ""} />
        {expanded ? <FolderOpen size={17} /> : <Folder size={17} />}
        <span>{label}</span>
      </button>
      <button type="button" className="workspace-icon-button" title={t.workspaces.open} aria-label={`${t.workspaces.open}: ${label}`} onClick={() => void open()}><FolderOpen size={14} /></button>
      <button type="button" className="workspace-icon-button" title={t.workspaces.newIn(label)} aria-label={t.workspaces.newIn(label)} onClick={() => props.onNew(workspace.directory)}><Plus size={16} /></button>
    </div>
    {openError ? <div className="workspace-error" role="alert">{openError}</div> : null}
    {expanded ? <div className="workspace-group-sessions">
      <SessionsIndex {...props} embedded searchOpen={false} query="" sessions={sessions.items}
        statuses={statuses.items} statusUnavailable={!statuses.ready} statusError={statuses.error}
        initialLoading={props.enabled && query.isPending} loadingMore={query.isFetchingNextPage}
        error={queryError(query.error)} loadMoreError={query.isFetchNextPageError ? queryError(query.error) : ""}
        hasMore={Boolean(query.hasNextPage)} onLoadMore={() => void query.fetchNextPage()}
        onNew={() => props.onNew(workspace.directory)} />
      {query.isError && !sessions.items.length ? <button className="workspace-load-more" type="button" onClick={() => void query.refetch()}>{t.workspaces.retry}</button> : null}
    </div> : null}
  </section>;
}

export function WorkspacesIndex(props: WorkspaceIndexProps) {
  const t = useUiText();
  const groups = workspaceGroups(props.workspaces, props.defaultDirectory);
  return <div className="workspace-index">
    <button className="session-new-button" type="button" onClick={() => props.onNew()} aria-label={t.sessions.newConversationAria}><Plus size={16} />{t.sessions.newConversation}</button>
    <div className="workspace-index-heading"><span>{t.workspaces.title}</span>
      <button type="button" className="workspace-icon-button" disabled={!props.enabled} title={t.workspaces.choose} aria-label={t.workspaces.choose} onClick={props.onChoose}><FolderPlus size={18} /></button>
    </div>
    {props.searchOpen ? <SessionsIndex {...props} embedded onNew={() => props.onNew()} /> : <div className="workspace-index-scroll">
      {props.workspaceError ? <div className="workspace-error" role="alert">{props.workspaceError}<button type="button" onClick={props.onRetryWorkspaces}>{t.workspaces.retry}</button></div> : null}
      {props.workspacesLoading ? <div className="workspace-loading" role="status">{t.sessions.loading}</div> : null}
      {groups.map(group => <WorkspaceGroup key={group.directory} workspace={group}
        label={workspaceLabel(group.directory, groups, props.defaultDirectory, t.workspaces.defaultName)}
        active={group.directory === props.activeDirectory} props={props} />)}
    </div>}
  </div>;
}

export function WorkspaceControl({ directory, workspaces, defaultDirectory, editable, disabled, onChange, onChoose }: {
  directory: string; workspaces: SessionWorkspace[]; defaultDirectory: string; editable: boolean; disabled: boolean;
  onChange: (directory: string) => void; onChoose: () => Promise<void>;
}) {
  const t = useUiText();
  const [error, setError] = useState("");
  useEffect(() => setError(""), [directory]);
  const groups = workspaceGroups(workspaces, defaultDirectory);
  if (directory && !groups.some(item => item.directory === directory)) groups.push({ directory, session_count: 0, last_active_at: 0 });
  const invoke = async (action: () => Promise<void>) => {
    setError("");
    try { await action(); } catch (cause) { setError(queryError(cause)); }
  };
  return <div className="conversation-workspace">
    <div className="conversation-workspace-row">
      <FolderOpen size={15} aria-hidden="true" />
      {editable ? <select aria-label={t.workspaces.choose} title={directory} value={directory} disabled={disabled} onChange={event => onChange(event.target.value)}>
        {!directory ? <option value="">{t.workspaces.choose}</option> : null}
        {groups.map(item => <option key={item.directory} value={item.directory}>{workspaceLabel(item.directory, groups, defaultDirectory, t.workspaces.defaultName)}</option>)}
      </select> : <span className="conversation-workspace-name" title={directory}>{directoryName(directory)}</span>}
      <span className="conversation-workspace-path" title={directory}>{directory}</span>
      {editable ? <button type="button" disabled={disabled} title={t.workspaces.choose} aria-label={t.workspaces.choose} onClick={() => void invoke(onChoose)}><FolderPlus size={16} /></button> : null}
      <button type="button" disabled={!directory} title={t.workspaces.open} aria-label={t.workspaces.open} onClick={() => void invoke(() => window.lxe!.desktop.openWorkspace(directory))}><FolderOpen size={16} /></button>
    </div>
    {error ? <div className="workspace-error" role="alert">{error}</div> : null}
  </div>;
}

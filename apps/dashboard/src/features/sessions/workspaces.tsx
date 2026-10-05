import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { Folder, FolderOpen, FolderPlus, MoreHorizontal, Plus } from "lucide-react";
import { flattenSessionPages, queryError, useSessionsInfiniteQuery, useSessionStatus } from "../../api/queries";
import { useUiText } from "../../shared/i18n";
import { SessionsIndex } from "./view";
import type { ConversationDisplaySnapshot } from "./display-controller";
import "./workspaces.css";
import { WorkspaceOpenButton } from "../workspace-apps/WorkspaceOpenButton";

import { emptyWorkspace, workspaceGroups, workspaceLabel, workspaceName, type SessionWorkspace } from "./workspace-state";
import { WorkspaceActionsMenu, WorkspaceRenameDialog } from "./workspace-actions";

type IndexProps = ComponentProps<typeof SessionsIndex>;
type WorkspaceIndexProps = Omit<IndexProps, "onNew"> & {
  currentBlank?: import("@lxe/desktop-protocol").SessionPayload | null;
  expanded: Record<string, boolean>;
  onExpandedChange: (directory: string, expanded: boolean) => void;
  onRename: (directory: string, name: string) => Promise<void>;
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

function WorkspaceGroup({ workspace, label, active, props, onActions }: {
  workspace: SessionWorkspace; label: string; active: boolean; props: WorkspaceIndexProps;
  onActions: (workspace: SessionWorkspace, anchor: HTMLElement) => void;
}) {
  const t = useUiText();
  const expanded = props.expanded[workspace.directory] ?? (active || workspace.directory === props.defaultDirectory);
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
      <button type="button" className="workspace-group-toggle" aria-expanded={expanded} title={workspace.directory} onClick={() => props.onExpandedChange(workspace.directory, !expanded)}>
        {expanded ? <FolderOpen size={17} /> : <Folder size={17} />}
        <span>{label}</span>
        {workspace.directory === props.defaultDirectory ? <small className="workspace-default-badge">{t.workspaces.defaultBadge}</small> : null}
      </button>
      <button type="button" className="workspace-icon-button" title={t.workspaces.open} aria-label={`${t.workspaces.open}: ${label}`} onClick={() => void open()}><FolderOpen size={14} /></button>
      <button type="button" className="workspace-icon-button workspace-actions-trigger" disabled={!props.enabled}
        title={t.workspaces.actions} aria-label={`${t.workspaces.actions}: ${label}`} aria-haspopup="menu"
        onClick={event => onActions(workspace, event.currentTarget)}><MoreHorizontal size={16} /></button>
      <button type="button" className="workspace-icon-button" title={t.workspaces.newIn(label)} aria-label={t.workspaces.newIn(label)} onClick={() => props.onNew(workspace.directory)}><Plus size={16} /></button>
    </div>
    {openError ? <div className="workspace-error" role="alert">{openError}</div> : null}
    {expanded ? <div className="workspace-group-sessions">
      <SessionsIndex {...props} embedded searchOpen={false} query="" sessions={props.currentBlank?.workspace.directory === workspace.directory ? [{ ...props.currentBlank, title: t.conversation.newTitle }, ...sessions.items.filter(item => item.session_id !== props.currentBlank?.session_id)] : sessions.items}
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
  const [menu, setMenu] = useState<{ workspace: SessionWorkspace; anchor: HTMLElement } | null>(null);
  const [renaming, setRenaming] = useState<SessionWorkspace | null>(null);
  const closeMenu = useCallback((restoreFocus = true) => {
    if (restoreFocus) menu?.anchor.focus();
    setMenu(null);
  }, [menu]);
  useEffect(() => { if (!props.visible || props.searchOpen) setMenu(null); }, [props.visible, props.searchOpen]);
  useEffect(() => {
    if (!menu && !renaming) return;
    props.onTransientInteractionChange?.(true);
    return () => props.onTransientInteractionChange?.(false);
  }, [Boolean(menu || renaming), props.onTransientInteractionChange]);
  return <div className="workspace-index">
    <button className="session-new-button" type="button" onClick={() => props.onNew()} aria-label={t.sessions.newConversationAria}><Plus size={16} />{t.sessions.newConversation}</button>
    <div className="workspace-index-heading"><span>{t.workspaces.title}</span>
      <button type="button" className="workspace-icon-button" disabled={!props.enabled} title={t.workspaces.choose} aria-label={t.workspaces.choose} onClick={props.onChoose}><FolderPlus size={18} /></button>
    </div>
    {props.searchOpen ? <SessionsIndex {...props} embedded onNew={() => props.onNew()} /> : <div className="workspace-index-scroll" onScroll={() => setMenu(null)}>
      {props.workspaceError ? <div className="workspace-error" role="alert">{props.workspaceError}<button type="button" onClick={props.onRetryWorkspaces}>{t.workspaces.retry}</button></div> : null}
      {props.workspacesLoading ? <div className="workspace-loading" role="status">{t.sessions.loading}</div> : null}
      {groups.map(group => <WorkspaceGroup key={group.directory} workspace={group}
        label={workspaceLabel(group.directory, groups, props.defaultDirectory, t.workspaces.defaultName)}
        active={group.directory === props.activeDirectory} props={props}
        onActions={(workspace, anchor) => setMenu({ workspace, anchor })} />)}
    </div>}
    {menu ? <WorkspaceActionsMenu anchor={menu.anchor} onClose={closeMenu} onRename={() => {
      menu.anchor.focus(); setRenaming(menu.workspace); setMenu(null);
    }} /> : null}
    {renaming ? <WorkspaceRenameDialog workspace={renaming} onClose={() => setRenaming(null)} onRename={props.onRename} /> : null}
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
  if (directory && !groups.some(item => item.directory === directory)) groups.push(emptyWorkspace(directory));
  const invoke = async (action: () => Promise<void>) => {
    setError("");
    try { await action(); } catch (cause) { setError(queryError(cause)); }
  };
  if (!editable) {
    const name = workspaceName(directory, groups, defaultDirectory, t.workspaces.defaultName);
    return <div className="conversation-workspace is-readonly">
      <span className="conversation-workspace-label" title={`${name}\n${directory}`}>
        <FolderOpen size={15} aria-hidden="true" />
        <span className="conversation-workspace-name">{name}</span>
        {directory === defaultDirectory ? <small className="workspace-default-badge">{t.workspaces.defaultBadge}</small> : null}
      </span><WorkspaceOpenButton directory={directory} />
      {error ? <div className="workspace-error" role="alert">{error}</div> : null}
    </div>;
  }
  return <div className="conversation-workspace">
    <div className="conversation-workspace-row">
      <FolderOpen size={15} aria-hidden="true" />
      <select aria-label={t.workspaces.choose} title={directory} value={directory} disabled={disabled} onChange={event => onChange(event.target.value)}>
        {!directory ? <option value="">{t.workspaces.choose}</option> : null}
        {groups.map(item => <option key={item.directory} value={item.directory}>{workspaceLabel(item.directory, groups, defaultDirectory, t.workspaces.defaultName)}{item.directory === defaultDirectory ? ` (${t.workspaces.defaultBadge})` : ""}</option>)}
      </select>
      <span className="conversation-workspace-path" title={directory}>{directory}</span>
      <button type="button" disabled={disabled} title={t.workspaces.choose} aria-label={t.workspaces.choose} onClick={() => void invoke(onChoose)}><FolderPlus size={16} /></button>
      <WorkspaceOpenButton directory={directory} />
    </div>
    {error ? <div className="workspace-error" role="alert">{error}</div> : null}
  </div>;
}

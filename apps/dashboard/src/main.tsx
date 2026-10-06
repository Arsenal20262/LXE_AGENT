import { useModelActions } from "./api/model-actions";
import { useMcpActions } from "./api/mcp-actions";
import { useConversationEvents } from "./features/sessions/use-conversation-events";
import { forgetComposerEditor } from "./features/sessions/ReferenceComposer";
import { moveConversationAttachments, forgetConversationAttachments } from "./features/sessions/attachment-draft";
import { forgetPreviewSession } from "./features/file-preview/reading-state";
import { FilePreviewLayout } from "./features/file-preview/Sidebar";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useQueryClient } from "@tanstack/react-query";
import type {
  DashboardRpcResult,
  DesktopCloudState,
  DesktopConversationActivityPayload,
  DesktopConversationTurnPayload,
  DesktopHealth,
  DesktopInputAttachmentPayload,
} from "@lxe/desktop-protocol";
import {
  ChartColumn,
  BriefcaseBusiness,
  House,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
} from "lucide-react";

import "./styles.css";
import "./desktop/update-control.css";
import "./shared/navigation-rail.css";
import { SidebarStatus } from "./desktop/sidebar-status";
import { ConversationDisplayController, sendConversationMessage } from "./features/sessions/display-controller";
import { WorkspacesIndex, WorkspaceControl } from "./features/sessions/workspaces";
import { WORKSPACE_EXPANDED_STORAGE_KEY } from "./features/sessions/workspace-state";
import { useStoredExpanded } from "./shared/ui/use-stored-expanded";
import { useConversationEntry } from "./features/sessions/use-conversation-entry";
import { useSessionStatus } from "./api/queries";
import { acknowledgeConversationSend } from "./features/sessions/presentation";
import { callDashboard } from "./api/client";
import { dashboardQueryKeys } from "./api/query-keys";
import { DashboardQueryProvider } from "./api/query-client";
import {
  flattenSessionPages,
  queryError,
  useCommandsQuery,
  useCurrentModelQuery,
  useModelsQuery,
  useConversationActivityQuery,
  useSessionConversationQuery,
  useSessionsInfiniteQuery,
  useSessionWorkspacesQuery,
  useUserQuestionsQuery,
  useApprovalsQuery,
  useSkillsQuery,
  useToolsetsQuery,
} from "./api/queries";
import { EmptyState } from "./shared/components";
import { formatDate, formatNumber } from "./shared/format";
import {
  I18nContext,
  LANGUAGE_STORAGE_KEY,
  UI_TEXT,
  initialLanguage
} from "./shared/i18n";
import type { Language } from "./shared/i18n";
import {
  DARK_MEDIA_QUERY,
  FONT_SIZE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  initialDashboardFontSize,
  initialDashboardTheme,
  resolveTheme,
} from "./shared/appearance";
import type { SessionPayload } from "./api/payloads";
import type { DetailTarget } from "./shared/ui/detail-target";
import { DetailModal } from "./features/details/view";
import { McpServicesView } from "./features/integrations/view";
import { DashboardHome } from "./features/home/view";
import { ModelsView } from "./features/models/view";
import { RuntimeStatusPopover } from "./features/runtime-status/view";
import {
  SessionDetailView
} from "./features/sessions/view";
import { SkillsCatalogView, type SkillConversationAction } from "./features/skills/user-view";
import { AddSkillMenu } from "./features/skills/add-menu";
import { appendComposerDraftPrompt, prepareDraftMove } from "./features/sessions/composer-draft";
import type { SkillPayload } from "@lxe/desktop-protocol";
import { StatsView } from "./features/stats/view";
import { ToolsView } from "./features/tools/view";
import { SyntheticPerformerWorkbench } from "./features/workbench/view";
import { WorkbenchIndex } from "./features/workbench/index-view";
import { InputAssetsWorkbench, useInputAssetSlots } from "./features/workbench/input-assets-view";
import { DesktopShell } from "./desktop/shell";
import type { DesktopSettingsSection } from "./desktop/settings-model";
import { DashboardRootErrorBoundary } from "./root-error-boundary";
import {
  dashboardRouteFromHistory,
  type WorkbenchView,
  readStoredCapabilityView,
  storeCapabilityView,
} from "./shared/navigation";
import { useThreeStateSidebar } from "./shared/use-three-state-sidebar";
import { SidebarResizer } from "./shared/sidebar-resizer";
import { NavigationRail } from "./shared/navigation-rail";
import { WorkspaceView } from "./shared/workspace-view";
import type {
  ActivityView,
  CapabilityView,
  DashboardRouteSelection,
  DashboardSection,
} from "./shared/navigation";
const DOCS_HOME_PATH = "README.md";

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function routeStateFromLocation(): DashboardRouteSelection {
  const storedCapabilityView = readStoredCapabilityView(browserStorage());
  return dashboardRouteFromHistory(window.history.state, storedCapabilityView);
}

// Event handlers keep their latest closure without invalidating the sidebar on stream ticks.
function useLatestCallback<A extends unknown[], R>(callback: (...args: A) => R) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; });
  return useCallback((...args: A) => latest.current(...args), []);
}

function App({
  desktopCloud,
  desktopHealth,
  language,
  onLanguageChange,
  onOpenDesktopSettings,
  setupComplete,
}: {
  desktopCloud: DesktopCloudState;
  desktopHealth: DesktopHealth;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onOpenDesktopSettings?: (section?: DesktopSettingsSection) => void;
  setupComplete: boolean;
}) {
  const queryClient = useQueryClient();
  const [initialRoute] = useState(() => routeStateFromLocation());
  const t = UI_TEXT[language];
  const [activeSection, setActiveSection] = useState<DashboardSection>(initialRoute.section);
  const [capabilityView, setCapabilityView] = useState<CapabilityView>(initialRoute.capabilityView);
  const [activityView, setActivityView] = useState<ActivityView>(initialRoute.activityView);
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>(initialRoute.workbenchView);
  const assetSlots = useInputAssetSlots();
  const assetSlotStatus = assetSlots.slots
    ? t.inputAssets.slotSummary(
        assetSlots.slots.filter((slot) => slot.current !== null).length,
        assetSlots.slots.length,
      )
    : "";
  const [error, setError] = useState("");
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSessionId, updateSelectedSessionId] = useState("");
  const [conversationDisplay] = useState(() => new ConversationDisplayController());
  const setSelectedSessionId = (id: string) => { workspaceSelectionRevision.current++; conversationDisplay.select(id); updateSelectedSessionId(id); };
  const [newConversation, setNewConversation] = useState(false);
  const [blankSession, setBlankSession] = useState<SessionPayload | null>(null);
  useConversationEntry(conversationDisplay, selectedSessionId, activeSection === "sessions");
  const sidebar = useThreeStateSidebar(browserStorage());
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [sessionSearchFocusKey, setSessionSearchFocusKey] = useState(0);
  const dashboardRuntimeReady = desktopHealth.gateway === "ready"
    && desktopHealth.agent_cli === "ready";

  const sessionsQuery = useSessionsInfiniteQuery(debouncedQuery, dashboardRuntimeReady);
  const workspacesQuery = useSessionWorkspacesQuery(dashboardRuntimeReady);
  const [expandedWorkspaces, setWorkspaceExpanded] = useStoredExpanded(WORKSPACE_EXPANDED_STORAGE_KEY);
  const workspaceSelectionRevision = useRef(0);
  const creatingSession = useRef(0);
  const deferredNewDirectory = useRef<string | undefined>(undefined);
  useLayoutEffect(() => { workspaceSelectionRevision.current++; }, [activeSection]);
  const sessionDetailQuery = useSessionConversationQuery(
    selectedSessionId,
    dashboardRuntimeReady && activeSection === "sessions",
    conversationDisplay,
  );
  const conversationActivityQuery = useConversationActivityQuery(
    selectedSessionId,
    dashboardRuntimeReady && activeSection === "sessions",
  );
  const capabilitiesOpen = activeSection === "capabilities";
  const modelsQuery = useModelsQuery(
    dashboardRuntimeReady
      && (activeSection === "sessions" || (capabilitiesOpen && capabilityView === "models")),
  );
  const currentModelQuery = useCurrentModelQuery(dashboardRuntimeReady);
  const skillsQuery = useSkillsQuery(
    dashboardRuntimeReady && capabilitiesOpen && capabilityView === "skills",
  );
  const commandsQuery = useCommandsQuery(
    dashboardRuntimeReady && capabilitiesOpen && capabilityView === "skills",
  );
  const toolsetsQuery = useToolsetsQuery(
    dashboardRuntimeReady
      && capabilitiesOpen
      && (capabilityView === "tools" || capabilityView === "connections"),
  );
  const sessions = useMemo(() => flattenSessionPages(sessionsQuery.data?.pages), [sessionsQuery.data?.pages]);
  const questionsQuery = useUserQuestionsQuery(dashboardRuntimeReady, selectedSessionId);
  const pendingQuestions = dashboardRuntimeReady ? questionsQuery.data?.items ?? [] : [];
  const approvalsQuery = useApprovalsQuery(dashboardRuntimeReady, selectedSessionId);
  const pendingApprovals = dashboardRuntimeReady ? approvalsQuery.data?.items ?? [] : [];
  const waitingSessionIds = new Set([...pendingQuestions, ...pendingApprovals].map(q => q.session_id));
  const sessionStatuses=useSessionStatus(sessions.items.map(session=>session.session_id),dashboardRuntimeReady,sessionDetailQuery.display,activeSection==="sessions"&&!newConversation);

  useConversationEvents();

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = routeStateFromLocation();
      setActiveSection(nextRoute.section);
      setCapabilityView(nextRoute.capabilityView);
      setActivityView(nextRoute.activityView);
      setWorkbenchView(nextRoute.workbenchView);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const debounce = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(debounce);
  }, [query]);

  useEffect(() => {
    storeCapabilityView(capabilityView, browserStorage());
  }, [capabilityView]);

  useEffect(() => {
    if (!dashboardRuntimeReady) setDetailTarget(null);
  }, [dashboardRuntimeReady]);

  function loadMoreSessions() {
    if (dashboardRuntimeReady && !sessionsQuery.isFetchingNextPage && sessionsQuery.hasNextPage) {
      void sessionsQuery.fetchNextPage();
    }
  }

  function handleSessionSearchToggle() {
    sidebar.openForSearch();
    setSessionSearchOpen(true);
    setSessionSearchFocusKey((current) => current + 1);
  }

  // Keep the focused conversation populated by default.
  useEffect(() => {
    if (activeSection === "sessions" && !newConversation && !selectedSessionId && !creatingSession.current && sessions.items.length > 0) {
      setSelectedSessionId(sessions.items[0].session_id);
    }
  }, [activeSection, newConversation, selectedSessionId, sessions.items]);

  function pushDashboardRoute(
    section: DashboardSection,
    nextCapabilityView = capabilityView,
    nextActivityView = activityView,
    nextWorkbenchView = workbenchView,
  ) {
    const nextState = {
      section,
      capabilityView: nextCapabilityView,
      activityView: nextActivityView,
      workbenchView: nextWorkbenchView,
    };
    const currentState = window.history.state;
    const stateChanged = currentState?.section !== section
      || currentState?.capabilityView !== nextCapabilityView
      || currentState?.activityView !== nextActivityView
      || currentState?.workbenchView !== nextWorkbenchView;
    if (window.location.pathname !== "/" || stateChanged) {
      window.history.pushState(nextState, "", "/");
    }
  }

  function openDashboardSection(section: DashboardSection) {
    const nextActivityView = section === "activity" ? "stats" : activityView;
    // Re-entering the workbench from the sidebar always lands on the tool index.
    const nextWorkbenchView = section === "workbench" ? "index" : workbenchView;
    pushDashboardRoute(section, capabilityView, nextActivityView, nextWorkbenchView);
    setActiveSection(section);
    setActivityView(nextActivityView);
    setWorkbenchView(nextWorkbenchView);
  }

  function openWorkbenchView(view: WorkbenchView) {
    pushDashboardRoute("workbench", capabilityView, activityView, view);
    setActiveSection("workbench");
    setWorkbenchView(view);
  }

  function openCapabilityView(view: CapabilityView) {
    pushDashboardRoute("capabilities", view, activityView);
    setActiveSection("capabilities");
    setCapabilityView(view);
  }

  function openActivityView(view: ActivityView) {
    pushDashboardRoute("activity", capabilityView, view);
    setActiveSection("activity");
    setActivityView(view);
  }

  function openSession(session: SessionPayload) {
    setWorkspaceExpanded(session.workspace.directory, true);
    pushDashboardRoute("sessions");
    setActiveSection("sessions");
    setSelectedSessionId(session.session_id);
    setNewConversation(session.blank === true);
  }

  async function enterNewConversation(directory = desktopHealth.workspace_root, carry = false): Promise<SessionPayload | undefined> {
    const revision = ++workspaceSelectionRevision.current;
    const before = conversationDisplay.getSnapshot().viewKey;
    creatingSession.current++;
    let session: SessionPayload;
    try { session = await callDashboard({ operation: "sessions.create", input: { directory } }); }
    finally { creatingSession.current--; }
    if (revision !== workspaceSelectionRevision.current || before !== conversationDisplay.getSnapshot().viewKey) return;
    if (carry) {
      const move = prepareDraftMove(before, session.session_id);
      moveConversationAttachments(before, session.session_id);
      move();
    }
    setBlankSession(session);
    setWorkspaceExpanded(session.workspace.directory, true);
    pushDashboardRoute("sessions"); setActiveSection("sessions");
    setSelectedSessionId(session.session_id); setNewConversation(true);
    return session;
  }
  function startNewConversation(directory = desktopHealth.workspace_root): void {
    if (!dashboardRuntimeReady) {
      deferredNewDirectory.current = directory;
      pushDashboardRoute("sessions"); setActiveSection("sessions");
      setSelectedSessionId(""); setNewConversation(true);
      return;
    }
    void enterNewConversation(directory).catch(cause => setError(queryError(cause)));
  }
  useEffect(() => {
    if (!dashboardRuntimeReady || activeSection !== "sessions" || !newConversation || selectedSessionId || !deferredNewDirectory.current) return;
    const directory = deferredNewDirectory.current;
    deferredNewDirectory.current = undefined;
    void enterNewConversation(directory, true).catch(cause => setError(queryError(cause)));
  }, [dashboardRuntimeReady, activeSection, newConversation, selectedSessionId]);

  async function chooseWorkspace(newDraft: boolean): Promise<void> {
    const revision = ++workspaceSelectionRevision.current;
    const before = conversationDisplay.getSnapshot().viewKey;
    const stillCurrent = () => revision === workspaceSelectionRevision.current && conversationDisplay.getSnapshot().viewKey === before;
    const directory = await window.lxe!.desktop.selectWorkspace();
    if (!directory || !stillCurrent()) return;
    const workspace = await callDashboard({ operation: "workspaces.register", input: { directory } });
    queryClient.setQueryData<DashboardRpcResult<"sessions.workspaces">>(
      dashboardQueryKeys.sessions.workspaces,
      current => ({ items: [...(current?.items ?? []).filter(item => item.directory !== workspace.directory), workspace] }),
    );
    if (!stillCurrent()) return;
    await enterNewConversation(workspace.directory, !newDraft);
  }

  async function renameWorkspace(directory: string, display_name: string): Promise<void> {
    const workspace = await callDashboard({ operation: "workspaces.rename", input: { directory, display_name } });
    queryClient.setQueryData<DashboardRpcResult<"sessions.workspaces">>(
      dashboardQueryKeys.sessions.workspaces,
      current => ({ items: [...(current?.items ?? []).filter(item => item.directory !== directory), workspace] }),
    );
  }

  async function startSkillConversation(action: SkillConversationAction, skill?: SkillPayload) {
    const prompt = action === "create" ? t.userSkills.createPrompt : skill ? t.userSkills.usePrompt(skill.name) : "";
    if (!prompt) return;
    try {
      const session = await enterNewConversation();
      if (session) appendComposerDraftPrompt(window.sessionStorage, session.session_id, prompt);
    } catch (cause) { setError(queryError(cause)); }
  }

  async function sendConversation(text: string, attachments: DesktopInputAttachmentPayload[]): Promise<void> {
    const { result, ticket, selected } = await sendConversationMessage(conversationDisplay, text, attachments,
      input => callDashboard({ operation: "sessions.send", input }));
    queryClient.setQueryData<DesktopConversationActivityPayload>(
      dashboardQueryKeys.sessions.activity(result.session_id),
      current => acknowledgeConversationSend(current, result, ticket.message),
    );
    setBlankSession(current => current?.session_id === result.session_id ? null : current);
    if (selected) { setSelectedSessionId(result.session_id); setNewConversation(false); }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.sessions.lists }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.sessions.detailSession(result.session_id) }),
    ]);
  }

  async function stopConversation(): Promise<void> {
    if (!selectedSessionId) return;
    await callDashboard({ operation: "sessions.stop", input: { session_id: selectedSessionId } });
  }

  async function setSessionPinned(session: SessionPayload, pinned: boolean): Promise<void> {
    await callDashboard({
      operation: "sessions.pin",
      input: { session_id: session.session_id, pinned },
    });
    await queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.sessions.lists });
  }

  async function deleteSession(session: SessionPayload): Promise<void> {
    await callDashboard({
      operation: "sessions.delete",
      input: { session_id: session.session_id },
    });
    forgetPreviewSession(session.session_id); forgetComposerEditor(session.session_id);
    forgetConversationAttachments(session.session_id);
    queryClient.removeQueries({ queryKey: dashboardQueryKeys.sessions.detailSession(session.session_id) });
    queryClient.removeQueries({ queryKey: dashboardQueryKeys.sessions.activity(session.session_id) });
    if (selectedSessionId === session.session_id) startNewConversation();
    await queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.sessions.lists });
  }

  async function openConversationFile(artifactId: string): Promise<void> {
    if (!selectedSessionId) return;
    const result = await callDashboard({
      operation: "sessions.file.open",
      input: { session_id: selectedSessionId, artifact_id: artifactId },
    });
    // The operating system's own message is the only useful thing to show here.
    if (!result.opened) throw new Error(result.error);
  }

  async function revealConversationFile(artifactId: string): Promise<void> {
    if (!selectedSessionId) return;
    const result = await callDashboard({
      operation: "sessions.file.reveal",
      input: { session_id: selectedSessionId, artifact_id: artifactId },
    });
    // Only the filesystem's own text reaches here; a reveal past that point
    // has nothing to report either way.
    if (!result.revealed) throw new Error(result.error);
  }

  async function openConversationAttachment(attachmentId: string): Promise<void> {
    if (!selectedSessionId) return;
    const result = await callDashboard({
      operation: "sessions.attachment.open",
      input: { session_id: selectedSessionId, attachment_id: attachmentId },
    });
    if (!result.opened) throw new Error(result.error);
  }

  const { setCurrentModel, setCurrentThinkingLevel, modelSaving, thinkingSaving } = useModelActions({
    current: currentModelQuery.data, models: modelsQuery.data?.items ?? [], onError: setError,
  });
  const { toggleMcpServer, savingId: mcpSavingId } = useMcpActions(setError);

  const sessionDetail = sessionDetailQuery.data ?? null;

  const selectedSession = sessions.items.find((session) => session.session_id === selectedSessionId)
    || (sessionDetail?.session.session_id === selectedSessionId ? sessionDetail.session : null)
    || (blankSession?.session_id === selectedSessionId ? blankSession : null);
  const conversationActivity = selectedSessionId
    ? sessionDetailQuery.display.activity ?? conversationActivityQuery.data ?? null
    : null;

  const showDashboardHome = activeSection === "home";
  const hasEmbeddedPageHeader = activeSection === "capabilities"
    || activeSection === "activity"
    || activeSection === "workbench"
    || activeSection === "sessions";
  const mcpToolset = toolsetsQuery.data?.items.find((toolset) => toolset.name === "mcp");
  const activeQueries = activeSection === "sessions"
    ? [sessionDetailQuery, conversationActivityQuery, modelsQuery, currentModelQuery]
    : activeSection === "capabilities" && capabilityView === "models"
      ? [modelsQuery, currentModelQuery]
      : activeSection === "capabilities" && capabilityView === "tools"
        ? [toolsetsQuery]
        : activeSection === "capabilities" && capabilityView === "skills"
          ? [skillsQuery, commandsQuery]
          : activeSection === "capabilities" && capabilityView === "connections"
            ? [toolsetsQuery]
            : [];
  const activeRefreshing = dashboardRuntimeReady
    && activeQueries.some((current) => current.isFetching && !current.isPending);
  const backgroundError = dashboardRuntimeReady
    ? activeQueries.find((current) => current.isRefetchError)?.error
    : undefined;
  const visibleError = dashboardRuntimeReady ? error || queryError(backgroundError) : "";

  const tabs: Array<{ id: DashboardSection; label: string; icon: ReactNode }> = [
    { id: "home", label: t.nav.home, icon: <House size={16} /> },
    { id: "sessions", label: t.nav.sessions, icon: <MessageSquareText size={16} /> },
    { id: "workbench", label: t.nav.workbench, icon: <BriefcaseBusiness size={16} /> },
    { id: "capabilities", label: t.nav.capabilities, icon: <Sparkles size={16} /> },
    { id: "activity", label: t.nav.activity, icon: <ChartColumn size={16} /> },
  ];
  const capabilityItems: Array<{ id: CapabilityView; label: string }> = [
    { id: "skills", label: t.nav.skills },
    { id: "tools", label: t.nav.tools },
    { id: "connections", label: t.nav.connections },
    { id: "models", label: t.nav.models },
  ];
  const pageTitle = activeSection === "home"
    ? t.home.title
    : activeSection === "sessions"
      ? newConversation ? t.conversation.newTitle : selectedSession?.title || t.sessions.title
      : t.app.title;
  const pageSubtitle = activeSection === "home"
    ? ""
    : activeSection === "sessions"
      ? selectedSession
        ? `${formatDate(selectedSession.last_active_at)} · ${formatNumber(selectedSession.input_tokens + selectedSession.output_tokens)} ${t.sessions.tokenSuffix}`
        : ""
      : "";
  const runtimeStatusNavigationKey = `${activeSection}:${capabilityView}:${activityView}:${selectedSessionId}`;
  const runtimeStatusPopover = (
    <RuntimeStatusPopover
      currentModel={currentModelQuery.data ?? null}
      desktopCloud={desktopCloud}
      desktopHealth={desktopHealth}
      enabled={dashboardRuntimeReady}
      navigationKey={runtimeStatusNavigationKey}
      onOpenModels={() => openCapabilityView("models")}
      onOpenSettings={(section) => onOpenDesktopSettings?.(section)}
    />
  );
  const sessionSidebarExpanded = sidebar.expanded;
  const sidebarMode = sidebar.mode;
  const sidebarVisible = sidebar.visible;
  const shellClassName = [
    "app-shell",
    sidebar.collapsed ? "sidebar-collapsed" : "",
    sidebar.peekOpen ? "sidebar-peeking" : "",
    activeSection === "sessions" ? "sessions-focus" : "",
  ].filter(Boolean).join(" ");

  const sessionIndexActions = {
    onSearchClose: useLatestCallback(() => { setSessionSearchOpen(false); setQuery(""); }),
    onLoadMore: useLatestCallback(loadMoreSessions),
    onNew: useLatestCallback(startNewConversation),
    onOpen: useLatestCallback(openSession),
    onPin: useLatestCallback(setSessionPinned),
    onDelete: useLatestCallback(deleteSession),
  };
  const selectedBusy = Boolean(conversationActivity?.active || conversationActivity?.queued.length);
  const deleteBlockedSessionIds = useMemo(() => selectedBusy ? [selectedSessionId] : [], [selectedBusy, selectedSessionId]);

  return (
    <>
      <main className={shellClassName}>
        <NavigationRail
          items={tabs}
          activeSection={activeSection}
          label={t.nav.aria}
          onNavigate={openDashboardSection}
          footer={<SidebarStatus onOpen={() => onOpenDesktopSettings?.("status")} />}
        />
        <div
          className={sidebarVisible ? "sidebar-window-controls sidebar-visible" : "sidebar-window-controls"}
          {...sidebar.controlProps}
        >
          <button
            aria-controls="app-sidebar"
            aria-expanded={sidebarVisible}
            aria-label={sessionSidebarExpanded ? t.sidebar.collapse : t.sidebar.expand}
            className={
              sidebarVisible
                ? "sidebar-icon-button sidebar-toggle-button is-open"
                : "sidebar-icon-button sidebar-toggle-button"
            }
            onClick={sidebar.toggle}
            ref={sidebar.toggleRef}
            title={sessionSidebarExpanded ? t.sidebar.collapse : t.sidebar.expand}
            type="button"
          >
            {sessionSidebarExpanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
        </div>
        {sessionSidebarExpanded ? <button
          className="sidebar-dismiss"
          type="button"
          aria-label={t.sidebar.collapse}
          onClick={sidebar.toggle}
          tabIndex={-1}
        /> : null}
        <aside
          aria-hidden={!sidebarVisible}
          aria-label={t.workspaces.title}
          className={`app-sidebar is-${sidebarMode}`}
          id="app-sidebar"
          inert={!sidebarVisible}
          ref={sidebar.panelRef}
          {...sidebar.panelProps}
        >
          <div className="sidebar-list-header">
            <span>{t.app.title}</span>
            <button
              aria-label={t.sessions.searchAria}
              aria-pressed={sessionSearchOpen}
              className={
                sessionSearchOpen
                  ? "sidebar-icon-button sidebar-search-button is-selected"
                  : "sidebar-icon-button sidebar-search-button"
              }
              onClick={handleSessionSearchToggle}
              title={t.sessions.searchAria}
              type="button"
            >
              <Search size={17} />
            </button>
          </div>
          <div className="sidebar-session-section">
            <WorkspacesIndex
              expanded={expandedWorkspaces}
              onExpandedChange={setWorkspaceExpanded}
              onRename={renameWorkspace}
              display={sessionDetailQuery.display}
              currentBlank={newConversation ? blankSession : null}
              workspaces={workspacesQuery.data?.items ?? []}
              defaultDirectory={desktopHealth.workspace_root}
              activeDirectory={selectedSession?.workspace.directory ?? desktopHealth.workspace_root}
              enabled={dashboardRuntimeReady}
              workspaceError={dashboardRuntimeReady ? queryError(workspacesQuery.error) : ""}
              workspacesLoading={dashboardRuntimeReady && workspacesQuery.isPending}
              onRetryWorkspaces={() => void workspacesQuery.refetch()}
              onChoose={() => { void chooseWorkspace(true).catch(cause => setError(queryError(cause))); }}
              sessions={sessions.items}
              statuses={sessionStatuses.items}
              waitingSessionIds={waitingSessionIds}
              statusUnavailable={!sessionStatuses.ready}
              statusError={sessionStatuses.error}
              query={query}
              searchOpen={sessionSearchOpen}
              searchFocusKey={sessionSearchFocusKey}
              initialLoading={dashboardRuntimeReady
                && sessionsQuery.isPending
                && !sessions.items.length}
              loadingMore={dashboardRuntimeReady && sessionsQuery.isFetchingNextPage}
              error={dashboardRuntimeReady && !sessions.items.length ? queryError(sessionsQuery.error) : ""}
              hasMore={dashboardRuntimeReady && Boolean(sessionsQuery.hasNextPage)}
              loadMoreError={dashboardRuntimeReady && sessions.items.length && sessionsQuery.isFetchNextPageError
                ? queryError(sessionsQuery.error)
                : ""}
              selectedSessionId={activeSection === "sessions" ? selectedSessionId : ""}
              onQueryChange={setQuery}
              {...sessionIndexActions}
              onTransientInteractionChange={sidebar.onTransientInteractionChange}
              visible={sidebarVisible}
              deleteBlockedSessionIds={deleteBlockedSessionIds}
            />
          </div>
        </aside>

        <section className={showDashboardHome ? "main-panel dashboard-home-panel" : "main-panel"}>
          {!showDashboardHome && !hasEmbeddedPageHeader ? (
            <header className={`main-header tab-${activeSection}`}>
              <div className="main-title">
                <h2>{pageTitle}</h2>
                {pageSubtitle ? <p>{pageSubtitle}</p> : null}
              </div>
            </header>
          ) : null}
          <section className={activeSection === "sessions" ? "content-panel content-panel-fill" : "content-panel"}>
            {visibleError ? (
              <div className="dashboard-query-notice" role="status">
                {t.common.errorPrefix(t.errors.api, visibleError)}
              </div>
            ) : null}
            {activeRefreshing ? (
              <div className="dashboard-refresh-indicator" role="status">{t.common.updating}</div>
            ) : null}
            {activeSection === "sessions" ? (
              <section className="sessions-conversation-shell">
                <FilePreviewLayout sessionId={selectedSessionId ?? ""}>
                {selectedSessionId || newConversation ? (
                  <SessionDetailView
                    workspaceControl={<WorkspaceControl
                      directory={selectedSession?.workspace.directory ?? desktopHealth.workspace_root}
                      defaultDirectory={desktopHealth.workspace_root}
                      workspaces={workspacesQuery.data?.items ?? []}
                      editable={newConversation}
                      disabled={!dashboardRuntimeReady || sessionDetailQuery.display.pending.some(item => !item.error)}
                      onChange={directory => { void enterNewConversation(directory, true).catch(cause => setError(queryError(cause))); }}
                      onChoose={() => chooseWorkspace(false)}
                    />}
                    question={newConversation ? undefined : pendingQuestions.find(q => q.session_id === selectedSessionId)}
                    onQuestionAnswered={() => { void questionsQuery.refetch(); }}
                    approvals={pendingApprovals.filter(request => request.session_id === selectedSessionId)}
                    onApprovalChanged={() => { void approvalsQuery.refetch(); }}
                    fallbackSession={selectedSession}
                    detail={sessionDetail}
                    activity={conversationActivity}
                    currentModel={currentModelQuery.data ?? null}
                    models={modelsQuery.data?.items ?? []}
                    modelLoading={dashboardRuntimeReady
                      && (modelsQuery.isPending || currentModelQuery.isPending)}
                    modelSaving={modelSaving}
                    thinkingSaving={thinkingSaving}
                    newConversation={newConversation}
                    runtimeReady={dashboardRuntimeReady}
                    runtimeUnavailableMessage={setupComplete
                      ? t.conversation.unavailable
                      : t.conversation.modelUnavailable}
                    loading={dashboardRuntimeReady
                      && !newConversation
                      && sessionDetailQuery.isPending
                      && !conversationActivity}
                    error={dashboardRuntimeReady
                      && !newConversation
                      && !sessionDetail
                      && !conversationActivity
                      ? queryError(sessionDetailQuery.error)
                      : ""}
                    hasOlder={Boolean(sessionDetailQuery.hasPreviousPage)}
                    loadingOlder={sessionDetailQuery.isFetchingPreviousPage}
                    loadOlderError={sessionDetail && sessionDetailQuery.isFetchPreviousPageError
                      ? queryError(sessionDetailQuery.error)
                      : ""}
                    onLoadOlder={sessionDetailQuery.fetchPreviousPage}
                    hasNewer={sessionDetailQuery.hasNextPage}
                    onLoadNewer={sessionDetailQuery.fetchNextPage}
                    onVisibleGroups={sessionDetailQuery.setVisibleGroups}
                    onJumpToLatest={sessionDetailQuery.jumpToLatest}
                    onModelChange={setCurrentModel}
                    onThinkingLevelChange={setCurrentThinkingLevel}
                    onSend={sendConversation}
                    onStop={stopConversation}
                    onOpenFile={openConversationFile}
                    onRevealFile={revealConversationFile}
                    onOpenAttachment={openConversationAttachment}
                    pendingMessages={sessionDetailQuery.display.pending}
                    display={sessionDetailQuery.display}
                    onFollowingChange={sessionDetailQuery.setFollowing}
                  />
                ) : (
                  <EmptyState label={selectedSessionId ? t.sessionDetail.loading : t.sessions.selectPrompt} />
                )}
                </FilePreviewLayout>
              </section>
            ) : null}
            {activeSection === "home" ? (
              <DashboardHome
                enabled={dashboardRuntimeReady}
                onOpenSession={openSession}
                onOpenSessions={() => openDashboardSection("sessions")}
                onOpenStats={() => openActivityView("stats")}
              />
            ) : null}
            {activeSection === "workbench" && workbenchView === "index" ? (
              <WorkbenchIndex
                assetStatus={assetSlotStatus}
                onOpen={openWorkbenchView}
                syntheticPerformerStatus=""
              />
            ) : null}
            {activeSection === "workbench" && workbenchView === "synthetic-performer" ? (
              <SyntheticPerformerWorkbench onBack={() => openWorkbenchView("index")} />
            ) : null}
            {activeSection === "workbench" && workbenchView === "input-assets" ? (
              <InputAssetsWorkbench
                error={assetSlots.error}
                loading={assetSlots.loading}
                onBack={() => openWorkbenchView("index")}
                refresh={assetSlots.refresh}
                slots={assetSlots.slots}
              />
            ) : null}
            {activeSection === "capabilities" ? (
              <WorkspaceView
                activeView={capabilityView}
                items={capabilityItems}
                label={t.nav.capabilities}
                onSelect={openCapabilityView}
                actions={capabilityView === "skills" ? <AddSkillMenu disabled={!dashboardRuntimeReady}
                  onAdd={() => startSkillConversation("create")} /> : undefined}
              >
                {capabilityView === "models" ? (
                  !dashboardRuntimeReady ? <EmptyState label={t.conversation.unavailable} />
                    : modelsQuery.isPending || currentModelQuery.isPending ? <EmptyState label={t.common.loading} />
                    : !modelsQuery.data || !currentModelQuery.data
                      ? <EmptyState label={t.common.errorPrefix(t.errors.api, queryError(modelsQuery.error || currentModelQuery.error))} />
                      : <ModelsView
                          models={modelsQuery.data.items}
                          current={currentModelQuery.data}
                        />
                ) : null}
                {capabilityView === "skills" ? (
                  !dashboardRuntimeReady ? <EmptyState label={t.conversation.unavailable} />
                    : skillsQuery.isPending || commandsQuery.isPending ? <EmptyState label={t.common.loading} />
                    : skillsQuery.data && commandsQuery.data
                      ? <SkillsCatalogView
                          skills={skillsQuery.data.items}
                          commands={commandsQuery.data.items}
                          onOpen={setDetailTarget}
                          onConversation={startSkillConversation}
                        />
                      : <EmptyState label={t.common.errorPrefix(t.errors.api, queryError(skillsQuery.error || commandsQuery.error))} />
                ) : null}
                {capabilityView === "tools" ? (
                  !dashboardRuntimeReady ? <EmptyState label={t.conversation.unavailable} />
                    : toolsetsQuery.isPending ? <EmptyState label={t.common.loading} />
                    : toolsetsQuery.data
                      ? <ToolsView toolsets={toolsetsQuery.data.items} onOpen={setDetailTarget} />
                      : <EmptyState label={t.common.errorPrefix(t.errors.api, queryError(toolsetsQuery.error))} />
                ) : null}
                {capabilityView === "connections" ? (
                  !dashboardRuntimeReady ? <EmptyState label={t.conversation.unavailable} />
                    : toolsetsQuery.isPending ? <EmptyState label={t.common.loading} />
                    : <McpServicesView
                        mcpError={!toolsetsQuery.data ? queryError(toolsetsQuery.error) : ""}
                        mcpSavingId={mcpSavingId}
                        mcpToolset={mcpToolset}
                        onToggleMcpServer={toggleMcpServer}
                      />
                ) : null}
              </WorkspaceView>
            ) : null}
            {activeSection === "activity" ? (
              <section className="workspace-view">
                <header className="workspace-view-header">
                  <h2>{t.nav.activity}</h2>
                </header>
                <div className="workspace-view-content">
                  <StatsView enabled={dashboardRuntimeReady} />
                </div>
              </section>
            ) : null}
          </section>
        </section>

        <DetailModal
          enabled={dashboardRuntimeReady}
          target={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
        <SidebarResizer expanded={sidebar.expanded} storage={browserStorage()} />
      </main>
      <div className={activeSection === "sessions" ? "runtime-status-host sessions-focus" : "runtime-status-host"}>
        {runtimeStatusPopover}
      </div>
    </>
  );
}

function DashboardApplication() {
  const [language, setLanguage] = useState<Language>(() => initialLanguage());
  const [fontSize, setFontSize] = useState(() => initialDashboardFontSize());
  const [theme, setTheme] = useState(() => initialDashboardTheme());
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia?.(DARK_MEDIA_QUERY).matches ?? false,
  );
  const t = UI_TEXT[language];

  // "system" has to keep following the OS after the window is already open, so
  // the query stays subscribed rather than being read once at startup.
  useEffect(() => {
    const query = window.matchMedia?.(DARK_MEDIA_QUERY);
    if (!query) return;
    const listener = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  useLayoutEffect(() => {
    const resolved = resolveTheme(theme, prefersDark);
    document.documentElement.dataset.theme = resolved;
    // Native controls - scrollbars, selects, form widgets - follow this and
    // nothing else, so leaving it out gives light scrollbars on a dark page.
    document.documentElement.style.colorScheme = resolved;
    // The window frame is painted by the Main process and does not follow the
    // page: on Windows the caption strip keeps whatever colour it was built
    // with, so it has to be told.
    void window.lxe?.desktop?.applyAppearance(resolved);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme still applies when persistent storage is unavailable.
    }
  }, [theme, prefersDark]);

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    try {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize);
    } catch {
      // The selected font size still works when persistent storage is unavailable.
    }
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The active language still works when persistent storage is unavailable.
    }
  }, [language]);

  return (
    <I18nContext.Provider value={t}>
      <DesktopShell
        fontSize={fontSize}
        language={language}
        onFontSizeChange={setFontSize}
        onLanguageChange={setLanguage}
        onThemeChange={setTheme}
        theme={theme}
      >
        {({ cloud, health, openSettings, setupComplete }) => (
          <App
            desktopCloud={cloud}
            desktopHealth={health}
            language={language}
            onLanguageChange={setLanguage}
            onOpenDesktopSettings={window.lxe ? openSettings : undefined}
            setupComplete={setupComplete}
          />
        )}
      </DesktopShell>
    </I18nContext.Provider>
  );
}

// Reuse the root across vite HMR full-reloads of this entry module.
const rootContainer = document.getElementById("root")! as HTMLElement & {
  __appRoot?: ReturnType<typeof createRoot>;
};
const appRoot = rootContainer.__appRoot ?? createRoot(rootContainer);
rootContainer.__appRoot = appRoot;
appRoot.render(
  <DashboardRootErrorBoundary>
    <DashboardQueryProvider>
      <DashboardApplication />
    </DashboardQueryProvider>
  </DashboardRootErrorBoundary>
);

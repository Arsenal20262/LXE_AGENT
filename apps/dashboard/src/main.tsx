import { useDashboardNavigation, browserStorage } from "./shared/use-dashboard-navigation";
import { useSessionWorkspace } from "./features/sessions/use-session-workspace";
import { useModelActions } from "./api/model-actions";
import { useMcpActions } from "./api/mcp-actions";
import { useConversationEvents } from "./features/sessions/use-conversation-events";
import { FilePreviewLayout } from "./features/file-preview/Sidebar";
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type {
  DesktopCloudState,
  DesktopHealth,
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
import { WorkspacesIndex, WorkspaceControl } from "./features/sessions/workspaces";
import { DashboardQueryProvider } from "./api/query-client";
import {
  queryError,
  useCommandsQuery,
  useCurrentModelQuery,
  useModelsQuery,
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
import type { DetailTarget } from "./shared/ui/detail-target";
import { DetailModal } from "./features/details/view";
import { McpServicesView } from "./features/integrations/view";
import { DashboardHome } from "./features/home/view";
import { ModelsView } from "./features/models/view";
import { RuntimeStatusPopover } from "./features/runtime-status/view";
import {
  SessionDetailView
} from "./features/sessions/view";
import { SkillsCatalogView } from "./features/skills/user-view";
import { AddSkillMenu } from "./features/skills/add-menu";
import { StatsView } from "./features/stats/view";
import { ToolsView } from "./features/tools/view";
import { SyntheticPerformerWorkbench } from "./features/workbench/view";
import { WorkbenchIndex } from "./features/workbench/index-view";
import { InputAssetsWorkbench, useInputAssetSlots } from "./features/workbench/input-assets-view";
import { DesktopShell } from "./desktop/shell";
import type { DesktopSettingsSection } from "./desktop/settings-model";
import { DashboardRootErrorBoundary } from "./root-error-boundary";
import { useThreeStateSidebar } from "./shared/use-three-state-sidebar";
import { SidebarResizer } from "./shared/sidebar-resizer";
import { NavigationRail } from "./shared/navigation-rail";
import { WorkspaceView } from "./shared/workspace-view";
import type {
  ActivityView,
  CapabilityView,
  DashboardSection,
} from "./shared/navigation";
const DOCS_HOME_PATH = "README.md";

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
  const t = UI_TEXT[language];
  const { activeSection, capabilityView, activityView, workbenchView, openDashboardSection, openWorkbenchView, openCapabilityView, openActivityView } = useDashboardNavigation();
  const assetSlots = useInputAssetSlots();
  const assetSlotStatus = assetSlots.slots
    ? t.inputAssets.slotSummary(
        assetSlots.slots.filter((slot) => slot.current !== null).length,
        assetSlots.slots.length,
      )
    : "";
  const [error, setError] = useState("");
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const sidebar = useThreeStateSidebar(browserStorage());
  const dashboardRuntimeReady = desktopHealth.gateway === "ready"
    && desktopHealth.agent_cli === "ready";

  const workspace = useSessionWorkspace({
    activeSection, runtimeReady: dashboardRuntimeReady, defaultDirectory: desktopHealth.workspace_root,
    onEnterSessions: () => openDashboardSection("sessions"), onOpenSearch: sidebar.openForSearch, onError: setError,
  });
  const { selectedSessionId, newConversation, selectedSession } = workspace.selection;
  const { openSession, startSkillConversation } = workspace.actions;
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
  useConversationEvents();

  useEffect(() => {
    if (!dashboardRuntimeReady) setDetailTarget(null);
  }, [dashboardRuntimeReady]);

  const { setCurrentModel, setCurrentThinkingLevel, modelSaving, thinkingSaving } = useModelActions({
    current: currentModelQuery.data, models: modelsQuery.data?.items ?? [], onError: setError,
  });
  const { toggleMcpServer, savingId: mcpSavingId } = useMcpActions(setError);

  const showDashboardHome = activeSection === "home";
  const hasEmbeddedPageHeader = activeSection === "capabilities"
    || activeSection === "activity"
    || activeSection === "workbench"
    || activeSection === "sessions";
  const mcpToolset = toolsetsQuery.data?.items.find((toolset) => toolset.name === "mcp");
  const activeQueries = activeSection === "sessions"
    ? [...workspace.queryStatus, modelsQuery, currentModelQuery]
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
              aria-pressed={workspace.sidebar.searchOpen}
              className={
                workspace.sidebar.searchOpen
                  ? "sidebar-icon-button sidebar-search-button is-selected"
                  : "sidebar-icon-button sidebar-search-button"
              }
              onClick={workspace.actions.openSearch}
              title={t.sessions.searchAria}
              type="button"
            >
              <Search size={17} />
            </button>
          </div>
          <div className="sidebar-session-section">
            <WorkspacesIndex
              {...workspace.sidebar}
              onExpandedChange={workspace.actions.expandWorkspace}
              onRename={workspace.actions.renameWorkspace}
              onRetryWorkspaces={workspace.actions.retryWorkspaces}
              onChoose={workspace.actions.chooseNewWorkspace}
              onQueryChange={workspace.actions.changeSearch}
              {...workspace.actions.sessionIndex}
              onTransientInteractionChange={sidebar.onTransientInteractionChange}
              visible={sidebarVisible}
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
                      workspaces={workspace.sidebar.workspaces}
                      editable={newConversation}
                      disabled={!dashboardRuntimeReady || workspace.conversation.pendingMessages.some(item => !item.error)}
                      onChange={workspace.actions.switchConversationWorkspace}
                      onChoose={workspace.actions.chooseConversationWorkspace}
                    />}
                    {...workspace.conversation}
                    onQuestionAnswered={workspace.actions.questionAnswered}
                    onApprovalChanged={workspace.actions.approvalChanged}
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
                    onLoadOlder={workspace.actions.loadOlder}
                    onLoadNewer={workspace.actions.loadNewer}
                    onVisibleGroups={workspace.actions.visibleGroupsChanged}
                    onJumpToLatest={workspace.actions.jumpToLatest}
                    onModelChange={setCurrentModel}
                    onThinkingLevelChange={setCurrentThinkingLevel}
                    onSend={workspace.actions.sendConversation}
                    onStop={workspace.actions.stopConversation}
                    onOpenFile={workspace.actions.openConversationFile}
                    onRevealFile={workspace.actions.revealConversationFile}
                    onOpenAttachment={workspace.actions.openConversationAttachment}
                    onFollowingChange={workspace.actions.followingChanged}
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

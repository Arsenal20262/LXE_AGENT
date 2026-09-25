import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(testDir, "../../src");
const readSource = (relativePath) => readFileSync(path.join(sourceDir, relativePath), "utf8");

const main = readSource("main.tsx");
const status = readSource("desktop/sidebar-status.tsx");
const shell = readSource("desktop/shell.tsx");
const models = readSource("features/models/view.tsx");
const sessions = readSource("features/sessions/view.tsx");
const sidebar = readSource("shared/use-three-state-sidebar.ts");
const styles = readSource("styles.css");

test("status and settings have one sidebar entry and no floating duplicate", () => {
  assert.match(status, /t\.sidebar\.statusAndSettings/);
  assert.match(main, /onOpen=\{\(\) => onOpenDesktopSettings\?\.\("status"\)\}/);
  const statusCardStart = status.indexOf('className="sidebar-status-card"');
  const statusCard = status.slice(statusCardStart, status.indexOf("</button>", statusCardStart));
  assert.doesNotMatch(statusCard, /currentModelQuery|sidebar-status-meta/);
  assert.doesNotMatch(main, /DashboardStatusModal|dashboardStatusOpen|statusSessionsQuery/);
  assert.doesNotMatch(shell, /desktop-status-button/);
  assert.doesNotMatch(styles, /\.desktop-status-button/);
});

test("sessions persist in the application sidebar with title-only rows", () => {
  assert.match(styles, /container-name:\s*dashboard-main/);
  assert.equal((main.match(/<SessionsIndex/g) || []).length, 1);
  assert.match(main, /const sessionsQuery = useSessionsInfiniteQuery\(debouncedQuery, dashboardRuntimeReady\);/);
  assert.match(main, /const sidebarMode = sidebar\.mode;/);
  assert.doesNotMatch(main, /activeSection === "sessions" && sessionSidebarExpanded/);
  assert.match(main, /className="sidebar-session-section"/);
  assert.match(main, /selectedSessionId=\{activeSection === "sessions" \? selectedSessionId : ""\}/);
  assert.doesNotMatch(main, /compactSessionLayout|sessionSidebarOverlayOpen|sessionSidebarDialogOpen/);
  assert.doesNotMatch(styles, /session-sidebar-scrim|session-sidebar-overlay-open/);
  assert.match(main, /onTransientInteractionChange=\{sidebar\.onTransientInteractionChange\}/);
  assert.match(main, /visible=\{sidebarVisible\}/);
  assert.match(sessions, /const transientInteractionActive = Boolean\(menu\);/);
  assert.match(sessions, /onTransientInteractionChange\?\.\(transientInteractionActive\)/);
  assert.match(sessions, /if \(visible\) return;\s*closeMenu\(false\);/);
  assert.doesNotMatch(sessions, /className="session-meta-line"/);
  // The existing compact marker now conveys lifecycle state accessibly.
  assert.match(sessions, /<span className="session-index-icon" data-session-state=\{state\} role="img" aria-label=\{statusLabel\} title=\{statusLabel\} \/>/);
  assert.doesNotMatch(sessions, /MessageCircle/);
  assert.match(sessions, /aria-label=\{`\$\{sessionTitle\} · \$\{statusLabel\}`\}/);
  assert.match(sessions, /title=\{sessionTitle\}/);
  assert.doesNotMatch(sessions, /pill sessions-loading-pill/);
  assert.match(sessions, /loadingMore \? \([\s\S]*?sessions-load-more-indicator[\s\S]*?LoaderCircle/);
  assert.match(main, /initialLoading=\{dashboardRuntimeReady\s*&& sessionsQuery\.isPending\s*&& !sessions\.items\.length\}/);
  assert.match(main, /loadingMore=\{dashboardRuntimeReady && sessionsQuery\.isFetchingNextPage\}/);
  assert.doesNotMatch(main, /loading=\{sessionsQuery\.isFetching\}/);

  const searchToggle = main.slice(
    main.indexOf("function handleSessionSearchToggle()"),
    main.indexOf("// Keep the focused conversation populated by default."),
  );
  assert.match(searchToggle, /sidebar\.openForSearch\(\)/);
  assert.match(sidebar, /if \(collapsed && !peekOpen\) setPeekOpen\(true\);/);
  assert.doesNotMatch(searchToggle, /pushDashboardRoute|setActiveSection/);

  assert.doesNotMatch(main, /sessions-split/);
  assert.doesNotMatch(styles, /\.sessions-split/);
  assert.match(main, /activeSection === "sessions";?\s*$/m);
  assert.doesNotMatch(styles, /\.main-header\.tab-home \.main-title h2::before/);
});

test("session rows expose an accessible pinned and destructive action menu", () => {
  assert.match(sessions, /createPortal\(/);
  assert.match(sessions, /aria-haspopup="menu"/);
  assert.match(sessions, /role="menu"/);
  assert.match(sessions, /role="menuitem"/);
  assert.match(sessions, /event\.key === "Escape"/);
  assert.match(sessions, /\["ArrowDown", "ArrowUp", "Home", "End"\]/);
  assert.match(sessions, /t\.sessions\.deleteNote/);
  assert.match(sessions, /useDialogFocus<HTMLElement>\(true, onCancel\)/);
  assert.match(styles, /\.session-index-actions\s*\{[^}]*opacity:\s*0;/s);
  assert.match(styles, /\.session-index-item:hover \.session-index-actions,[\s\S]*?opacity:\s*1;/s);
  assert.match(styles, /\.session-actions-menu\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*180;/s);
  assert.match(styles, /\.session-actions-menu button\.danger\s*\{[^}]*color:/s);
});

test("model cards keep exact token values while using compact visible labels", () => {
  assert.match(models, /formatCompactNumber/);
  assert.match(models, /aria-label=\{exactValue\}/);
  assert.match(models, /title=\{exactValue\}/);
});

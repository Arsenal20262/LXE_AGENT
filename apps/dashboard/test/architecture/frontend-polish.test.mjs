import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(testDir, "../../src");
const readSource = (relativePath) => readFileSync(path.join(sourceDir, relativePath), "utf8");

const workflow = readFileSync(path.join(sourceDir, "features/sessions/use-session-workspace.ts"), "utf8");
const main = readSource("main.tsx");
const status = readSource("desktop/sidebar-status.tsx");
const models = readSource("features/models/view.tsx");
const sessions = readSource("features/sessions/view.tsx");
const sidebar = readSource("shared/use-three-state-sidebar.ts");
const styles = readSource("styles.css");

test("sidebar status entry opens desktop settings", () => {
  assert.match(status, /t\.sidebar\.statusAndSettings/);
  assert.match(main, /onOpen=\{\(\) => onOpenDesktopSettings\?\.\("status"\)\}/);
});

test("workspace sessions persist in the application sidebar with compact rows", () => {
  assert.match(styles, /container-name:\s*dashboard-main/);
  assert.equal((main.match(/<WorkspacesIndex/g) || []).length, 1);
  assert.match(workflow, /const sessionsQuery = useSessionsInfiniteQuery\(debouncedQuery, dashboardRuntimeReady\);/);
  assert.match(main, /const sidebarMode = sidebar\.mode;/);
  assert.doesNotMatch(main, /activeSection === "sessions" && sessionSidebarExpanded/);
  assert.match(main, /className="sidebar-session-section"/);
  assert.match(workflow, /selectedSessionId: activeSection === "sessions" \? selectedSessionId : ""/);
  assert.match(main, /onTransientInteractionChange=\{sidebar\.onTransientInteractionChange\}/);
  assert.match(main, /visible=\{sidebarVisible\}/);
  assert.match(sessions, /const transientInteractionActive = Boolean\(menu\);/);
  assert.match(sessions, /onTransientInteractionChange\?\.\(transientInteractionActive\)/);
  assert.match(sessions, /if \(visible\) return;\s*closeMenu\(false\);/);
  // The existing compact marker now conveys lifecycle state accessibly.
  assert.match(sessions, /<span className="session-index-icon" data-session-state=\{state\} role="img" aria-label=\{statusLabel\} title=\{statusLabel\} \/>/);
  assert.match(sessions, /aria-label=\{`\$\{sessionTitle\} · \$\{statusLabel\}`\}/);
  assert.match(sessions, /title=\{sessionTitle\}/);
  assert.match(sessions, /loadingMore \? \([\s\S]*?sessions-load-more-indicator[\s\S]*?LoaderCircle/);
  assert.match(workflow, /initialLoading: dashboardRuntimeReady && sessionsQuery\.isPending && !sessions\.items\.length/);
  assert.match(workflow, /loadingMore: dashboardRuntimeReady && sessionsQuery\.isFetchingNextPage/);
  assert.doesNotMatch(main, /loading=\{sessionsQuery\.isFetching\}/);

  const searchToggle = workflow.slice(
    workflow.indexOf("function handleSessionSearchToggle()"),
    workflow.indexOf("// Keep the focused conversation populated by default."),
  );
  assert.match(searchToggle, /onOpenSearch\(\)/);
  assert.match(main, /onOpenSearch: sidebar\.openForSearch/);
  assert.match(sidebar, /if \(collapsed && !peekOpen\) setPeekOpen\(true\);/);
  assert.doesNotMatch(searchToggle, /pushDashboardRoute|setActiveSection/);

  assert.match(main, /activeSection === "sessions";?\s*$/m);
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

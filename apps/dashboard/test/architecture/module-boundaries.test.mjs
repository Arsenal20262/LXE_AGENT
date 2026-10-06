import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(testDir, "../../src");
const expectedModules = [
  "api/model-actions.ts",
  "api/mcp-actions.ts",
  "api/session-actions.ts",
  "features/sessions/use-conversation-events.ts",
  "features/sessions/use-session-workspace.ts",
  "shared/use-dashboard-navigation.ts",
  "features/sessions/SessionSidebar.tsx",
  "features/sessions/ConversationPage.tsx",
  "features/capabilities/CapabilitiesPage.tsx",
  "api/client.ts",
  "api/payloads.ts",
  "api/queries.ts",
  "api/query-client.tsx",
  "api/query-keys.ts",
  "shared/markdown.ts",
  "features/models/model.ts",
  "features/runtime-status/model.ts",
  "features/sessions/conversation.ts",
  "features/sessions/model.ts",
  "shared/content.ts",
  "shared/navigation.ts",
  "shared/ui/markdown.tsx",
  "shared/ui/language-switch.tsx",
  "shared/ui/detail-target.ts",
  "shared/ui/provider-brand-mark.tsx",
  "features/sessions/view.tsx",
  "features/models/view.tsx",
  "features/runtime-status/view.tsx",
  "features/tools/view.tsx",
  "features/integrations/view.tsx",
  "features/skills/view.tsx",
  "features/skills/user-view.tsx",
  "features/details/view.tsx"
];
const expectedEntryImports = [
  "./features/details/view",
  "./features/sessions/SessionSidebar",
  "./features/sessions/ConversationPage",
  "./features/capabilities/CapabilitiesPage",
  "./features/runtime-status/view",
  "./features/sessions/use-session-workspace",
  "./features/sessions/use-conversation-events",
  "./shared/use-dashboard-navigation"
];

function sourceFiles(directory) {
  return readdirSync(directory, { recursive: true })
    .filter((entry) => /\.(ts|tsx)$/.test(String(entry)))
    .map((entry) => path.join(directory, String(entry)));
}

function sourceRelativePath(file) {
  return path.relative(sourceDir, file).split(path.sep).join("/");
}

test("dashboard entry delegates feature views to dedicated modules", () => {
  expectedModules.forEach((relativePath) => {
    assert.equal(existsSync(path.join(sourceDir, relativePath)), true, `${relativePath} should exist`);
  });

  const main = readFileSync(path.join(sourceDir, "main.tsx"), "utf8");
  assert.ok(main.split("\n").length <= 1200, "main.tsx should remain an App orchestration entrypoint");
  expectedEntryImports.forEach((modulePath) => {
    assert.match(main, new RegExp(`from "${modulePath.replace(".", "\\.")}"`));
  });
  assert.doesNotMatch(
    main,
    /^function (SessionDetailView|ModelsView|ToolsView|ConnectionsView|SkillsView|DetailModal)\(/m
  );
  assert.doesNotMatch(main, /type DashboardData|setData\(|fetchJson|patchJson/);
  sourceFiles(sourceDir)
    .filter((file) => path.basename(file) !== "main.tsx")
    .forEach((file) => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /from ["'][^"']*main["']/);
    });

  const files = sourceFiles(sourceDir);
  assert.ok(files.length > expectedModules.length, "boundary scan must cover the Dashboard source tree");
  files
    .filter((file) => !["api/client.ts", "api/queries.ts", "api/model-actions.ts", "api/mcp-actions.ts", "api/session-actions.ts"].includes(sourceRelativePath(file)))
    .forEach((file) => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /\bcallDashboard\b/, `${file} must use query hooks or typed actions`);
    });
});

test("App connects persistent owners while pages receive data and semantic actions", () => {
  const main = readFileSync(path.join(sourceDir, "main.tsx"), "utf8");
  assert.doesNotMatch(main, /useQueryClient|setQueryData|invalidateQueries|removeQueries|ConversationDisplayController|prepareDraftMove|moveConversationAttachments|applyDesktopStreamBatch/);
  for (const hook of ["useSessionWorkspace", "useConversationEvents", "useModelActions", "useMcpActions", "useDashboardNavigation"]) {
    assert.equal((main.match(new RegExp(hook + "\\(", "g")) || []).length, 1, hook + " has one App owner");
    assert.ok(main.indexOf(hook + "(") < main.indexOf("  return ("), hook + " remains mounted above page branches");
  }
  for (const file of ["features/sessions/SessionSidebar.tsx", "features/sessions/ConversationPage.tsx", "features/capabilities/CapabilitiesPage.tsx"]) {
    const page = readFileSync(path.join(sourceDir, file), "utf8");
    assert.doesNotMatch(page, /callDashboard|useQueryClient|setQueryData|invalidateQueries|removeQueries|sessionActions|useSessionWorkspace\(|useConversationEvents\(/, file);
  }
  const requests = readFileSync(path.join(sourceDir, "api/session-actions.ts"), "utf8");
  assert.doesNotMatch(requests, /useState|useRef|queryClient|composer-draft|attachment-draft|display-controller/);
  const workflow = readFileSync(path.join(sourceDir, "features/sessions/use-session-workspace.ts"), "utf8");
  assert.equal((workflow.match(/new ConversationDisplayController\(/g) || []).length, 1);
  assert.match(workflow, /useState\(\(\) => new ConversationDisplayController\(\)\)/);
});

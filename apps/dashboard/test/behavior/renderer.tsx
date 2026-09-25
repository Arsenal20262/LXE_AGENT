/// <reference path="../../src/vite-env.d.ts" />
import React, { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DesktopHealth, DesktopInputAttachmentPayload, LxeDesktopBridge } from "@lxe/desktop-protocol";
import { ConversationComposer } from "../../src/features/sessions/view";
import { useDialogFocus } from "../../src/shared/ui/use-dialog-focus";
import { I18nContext, LANGUAGE_STORAGE_KEY, UI_TEXT } from "../../src/shared/i18n";
import { setupState, cloudState } from "../desktop/settings-fixture-data";
import { modelRow, modelOption } from "../features/models/source-fixtures";
import "../../src/styles.css";

// Only external boundaries are substituted. App, Query hooks, composer and
// dialog focus management are production code, running in Chromium.
const calls: { operation: string; input?: unknown }[] = [];
const sends: { text: string; attachments: DesktopInputAttachmentPayload[] }[] = [];
let stops = 0;
let releaseSend: (() => void) | undefined;
let root: Root | undefined;
let queryClient: QueryClient | undefined;
let serial = 0;
let notifyHealth: ((value: DesktopHealth) => void) | undefined;
let complete = true;
const health: DesktopHealth = {
  gateway: "starting", agent_cli: "starting", lxeskill: "ready", message: "Fixture runtime is starting",
  version: "fixture", resource_root: "/fixture", data_root: "/fixture", workspace_root: "/fixture",
  logging: { desktop: { local_file_enabled: false, file_path: "", disabled_reason: "disabled_by_config",
    last_error: "", console_level: "info", file_level: "info" } },
};
const currentModel = modelRow("deepseek", "local", "DeepSeek", [modelOption("fixture-model")]);
const subscribe = () => () => {};
const desktop = {
  platform: "darwin" as const,
  getSetupState: async () => setupState({ complete }),
  getHealth: async () => ({ ...health }),
  getCloudState: async () => cloudState(),
  getUpdateState: async () => ({ phase: "unsupported" as const }),
  applyAppearance: async () => {},
  listInputAssets: async () => [],
  onStatusChanged: (listener: (value: DesktopHealth) => void) => {
    notifyHealth = listener;
    return () => { notifyHealth = undefined; };
  },
  onCloudStateChanged: subscribe,
  onDashboardInvalidated: subscribe,
  onConversationEvent: subscribe,
  onConversationStreamEvent: subscribe,
  onExecUpdate: subscribe,
  onSessionStatus: subscribe,
  selectConversationFiles: async () => { calls.push({ operation: "selectFiles" }); return []; },
  stageDroppedConversationFiles: async (files: File[]) => {
    calls.push({ operation: "dropFiles", input: files.map(file => file.name) }); return [];
  },
  stagePastedConversationFiles: async () => { calls.push({ operation: "pasteFiles" }); return []; },
  discardConversationFiles: async () => {},
} satisfies Partial<LxeDesktopBridge["desktop"]>;
const dashboard = {
  async call(call: { operation: string; input: Record<string, unknown> }) {
    calls.push(structuredClone(call));
    switch (call.operation) {
      case "sessions.list": return { items: [], total: 0, offset: 0, limit: 10 };
      case "sessions.questions": return { items: [] };
      case "models.current": return currentModel;
      case "models.list": return { items: [currentModel] };
      case "channels.health": return { items: {}, total: 0 };
      case "stats.skills.list": case "stats.tools.list": return { items: [], days: call.input.days };
      case "stats.overview": return {
        days: call.input.days, peak_hour: null, modules: [], daily: [],
        totals: { turns: 7, error_turns: 0, tool_calls: 0, llm_calls: 0, input_tokens: 0,
          output_tokens: 0, skill_executions: 0, skill_failures: 0 },
      };
      default: throw new Error(`Unexpected fixture RPC: ${call.operation}`);
    }
  },
};
window.lxe = { desktop, dashboard } as unknown as LxeDesktopBridge;

type ComposerOptions = { runtimeReady?: boolean; modelSaving?: boolean; thinkingSaving?: boolean; running?: boolean; holdSend?: boolean };
let composerOptions: ComposerOptions = {};
let conversationKey = "";
function composer() {
  return <ConversationComposer
    contextDetail={null} activity={composerOptions.running ? { session_id: "fixture", active: null,
      latest: null, queued: [{ turn_id: "queued", message_id: "queued-message", text: "queued",
        state: "queued", started_at: 0, user_persisted_at: 0, settled_at: 0 }] } : null}
    conversationKey={conversationKey} currentModel={currentModel} modelLoading={false} models={[currentModel]}
    modelSaving={composerOptions.modelSaving ?? false} thinkingSaving={composerOptions.thinkingSaving ?? false}
    runtimeReady={composerOptions.runtimeReady ?? true} runtimeUnavailableMessage="Fixture runtime unavailable"
    onModelChange={() => {}} onThinkingLevelChange={() => {}}
    onSend={async (text, attachments) => {
      sends.push({ text, attachments });
      if (composerOptions.holdSend) await new Promise<void>(resolve => { releaseSend = resolve; });
    }} onStop={async () => { stops++; }} />;
}
function renderComposer() {
  flushSync(() => root!.render(<I18nContext.Provider value={UI_TEXT.en}>
    <QueryClientProvider client={queryClient!}>{composer()}</QueryClientProvider>
  </I18nContext.Provider>));
}
function Dialog({ name, close, children }: { name: string; close: () => void; children?: React.ReactNode }) {
  const ref = useDialogFocus<HTMLDivElement>(true, close);
  return <div role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} ref={ref}>{children}</div>;
}
function DialogFixture({ empty = false }: { empty?: boolean }) {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return <>
    <button id="opener" onClick={() => setOpen(true)}>Open dialog</button>
    {open && <Dialog name="Outer" close={() => setOpen(false)}>
      {!empty && <>
        <button id="hidden-first" hidden>Hidden</button>
        <button disabled tabIndex={0}>Disabled</button>
        <button id="first">First</button>
        <button id="open-nested" onClick={() => setNested(true)}>Open nested</button>
        <button id="last">Last</button>
        <button hidden>Hidden last</button>
      </>}
    </Dialog>}
    {open && nested && <Dialog name="Inner" close={() => setNested(false)}><button id="inner">Inner control</button></Dialog>}
    <button id="outside">Outside</button>
  </>;
}
function reset() {
  if (root) flushSync(() => root!.unmount());
  queryClient?.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.getElementById("root")!);
  calls.length = 0; sends.length = 0; stops = 0; releaseSend = undefined;
}
const fixture = {
  mountDialog(empty = false) { reset(); flushSync(() => root!.render(<DialogFixture empty={empty} />)); },
  mountComposer(options: ComposerOptions = {}) {
    reset(); composerOptions = options; conversationKey = `behavior-${++serial}`; renderComposer();
  },
  updateComposer(options: ComposerOptions) { Object.assign(composerOptions, options); renderComposer(); },
  releaseSend() { releaseSend?.(); },
  state() { return { calls, sends, stops, active: document.activeElement?.id,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(el => el.getAttribute("aria-label")) }; },
  setHealth(patch: Partial<DesktopHealth>) { Object.assign(health, patch); notifyHealth?.({ ...health }); },
  drop() {
    const data = new DataTransfer(); data.items.add(new File(["fixture"], "fixture.txt", { type: "text/plain" }));
    window.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  },
  composeEnter() {
    const input = document.querySelector("textarea")!;
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "中" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, isComposing: true }));
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中" }));
  },
};
Object.assign(window, { behavior: fixture });
localStorage.clear();
localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
const params = new URLSearchParams(location.search);
if (params.has("app")) {
  complete = params.get("complete") !== "false";
  history.replaceState({ section: params.get("section") || "home" }, "");
  await import("../../src/main");
}

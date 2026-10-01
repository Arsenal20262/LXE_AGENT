import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FilePreviewLayout, PreviewHeaderActions, usePreviewSidebar } from "../../../src/features/file-preview/Sidebar";
import { readingState } from "../../../src/features/file-preview/reading-state";
import { setFileBridgeForTests } from "../../../src/features/file-preview/api";
import type { DesktopFilesBridge, FileMetadata, SessionFileRef } from "@lxe/desktop-protocol";
import "../../../src/styles.css";
const calls: string[] = [], pending = new Map<string, string>(), watches = new Map<string, string>();
const workers = new Set<Worker>(), NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) { super(url, options); workers.add(this); }
  override terminate() { workers.delete(this); super.terminate(); }
};
let version = "1", slow = false, removedTreeFile = false;
const pathOf = (ref: SessionFileRef) => ref.kind === "workspace" ? ref.path : ref.id;
function metadata(ref: SessionFileRef): FileMetadata {
  const path = pathOf(ref), extension = path.slice(path.lastIndexOf("."));
  return { key: ref.session_id + path, name: path, extension, size: 100, version, source: "current_file", kind: extension === ".xlsx" || extension === ".csv" ? "excel" : extension === ".pdf" ? "pdf" : extension === ".png" ? "image" : extension === ".md" ? "markdown" : extension === ".html" ? "unsupported" : "text" };
}
setFileBridgeForTests({
  call: async call => {
    calls.push(call.operation);
    const { input } = call;
    if (call.operation === "watch-directory") { watches.set(call.input.request_id, call.input.path); return { version }; }
    if (call.operation === "directory-version") return { version };
    if (call.operation === "stat") { if (slow && pathOf(call.input.ref) === "文档.md") await new Promise(resolve => setTimeout(resolve, 400)); return metadata(call.input.ref); }
    if (call.operation === "applications") return [{ id: "editor", name: "Test Editor", default: true, icon: null }];
    if (call.operation === "open") { calls.push(JSON.stringify(call.input)); return; }
    if (call.operation === "list") {
      const entries = call.input.path ? (removedTreeFile ? [] : [{ name: "nested.txt", path: "folder/nested.txt", kind: "file" }]) : [{ name: "folder", path: "folder", kind: "directory" }, { name: "文档.md", path: "文档.md", kind: "file" }, { name: ".hidden", path: ".hidden", kind: "file" }, ...Array.from({ length: 202 }, (_, i) => ({ name: `file-${i}.txt`, path: `file-${i}.txt`, kind: "file" }))];
      const offset = call.input.offset ?? 0;
      return { rootPath: "/test/workspace", version, entries: entries.slice(offset, offset + 200), next: offset + 200 < entries.length ? offset + 200 : null };
    }
    if (call.operation === "release") { pending.delete(call.input.request_id); watches.delete(call.input.request_id); return; }
    if (call.operation === "prepare") { pending.set(call.input.request_id, pathOf(call.input.ref)); return { handle: call.input.request_id, metadata: metadata(call.input.ref), missingFonts: [] }; }
  },
  readText: async (handle, range) => {
    const name = pending.get(handle); if (!name) throw new Error("released handle");
    const response = await fetch('/fixtures/' + encodeURIComponent(name));
    if (!response.ok) throw new Error('fixture missing ' + name);
    const text = await response.text(), lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [], offset = range?.offset ?? 1, limit = range?.limit ?? 5000;
    const page = lines.slice(offset - 1, offset - 1 + limit);
    return { page: Math.floor((offset - 1) / limit) + 1, text: page.join(""), offset, lines: page.length, next: offset + page.length, eof: offset - 1 + page.length >= lines.length, version };
  },
  read: async (handle, relative) => {
    const name = relative ?? pending.get(handle);
    if (!name) throw new Error("released handle");
    const response = await fetch(`/fixtures/${encodeURIComponent(name)}`); if (!response.ok) throw new Error(`fixture missing ${name}`);
    return new Uint8Array(await response.arrayBuffer());
  },
} as DesktopFilesBridge);
function Controls({ session }: { session: string }) {
  const panel = usePreviewSidebar()!;
  return <div><PreviewHeaderActions />{["文档.md", "book.xlsx", "table.csv", "doc.pdf", "图.png", "page.html"].map((name, i) => <button id={`open-${i}`} key={name} onClick={() => void panel.open({ session_id: session, kind: "workspace", path: name })}>{name}</button>)}<textarea id="draft" defaultValue="keep this draft" /></div>;
}
function Fixture() {
  const [session, setSession] = useState("first");
  (window as any).previewFixture = { calls, pending, workers, watches, removeTreeFile: () => { removedTreeFile = true; version = String(Number(version) + 1); }, diagnostics: () => ({ reading: readingState("first", "first文档.md"), scroll: document.querySelector(".file-text-scroll")?.scrollTop, visible: document.visibilityState, focused: document.hasFocus() }), slow: (value: boolean) => { slow = value; }, change: () => { version = String(Number(version) + 1); }, switchSession: () => setSession(s => s === "first" ? "second" : "first") };
  return <FilePreviewLayout sessionId={session}><Controls session={session} /></FilePreviewLayout>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

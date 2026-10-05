import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FilePreviewLayout, PreviewHeaderActions } from "../../../src/features/file-preview/Sidebar";
import { setFileBridgeForTests } from "../../../src/features/file-preview/api";
import "../../../src/styles.css";
setFileBridgeForTests({ call: async call => call.operation === "list" ? { rootPath: "/fixture", version: "1", entries: [{ name: "notes.txt", path: "notes.txt", kind: "file" }], next: null } : call.operation === "watch-directory" || call.operation === "directory-version" ? { version: "1" } : undefined } as never);
function Fixture() {
  const [session, setSession] = useState("a"), [modal, setModal] = useState(false);
  (window as any).toolsFixture = { setSession, setModal };
  return <><nav><button onClick={() => setSession(session === "a" ? "b" : "a")}>Switch session</button><span>{session}</span></nav><FilePreviewLayout sessionId={session}><div style={{ padding: 20, flex: 1 }}><PreviewHeaderActions /><h2>工具测试</h2></div></FilePreviewLayout>{modal ? <div role="dialog" style={{ position: "fixed", inset: 100, background: "white", zIndex: 100 }}>Modal</div> : null}</>;
}
document.documentElement.style.cssText="--bg:#faf9f6;--surface:#fff;--border:#ddd6cc;--text:#26231e;--muted:#817a70;--accent:#af7353";
document.body.style.cssText="margin:0;color:var(--text)";
const style = document.createElement("style"); style.textContent="#root{height:100vh;display:flex;flex-direction:column}nav{height:32px;flex:none}.file-layout{flex:1;min-height:0}*{box-sizing:border-box}button{cursor:pointer}"; document.head.append(style);
createRoot(document.getElementById("root")!).render(<Fixture />);

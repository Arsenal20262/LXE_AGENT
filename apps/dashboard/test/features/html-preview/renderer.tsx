import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DocumentViewer } from "../../../src/features/file-preview/DocumentViewer";
import { readingState } from "../../../src/features/file-preview/reading-state";
import { htmlReferences } from "../../../src/features/file-preview/html/references";
import "../../../src/features/file-preview/sidebar.css";

function Fixture() {
  const [file, setFile] = useState<string | null>("报告/中文 page.html"), [session, setSession] = useState("s");
  Object.assign(window, { fixture: {
    open: (name: string | null, id = "s") => { setFile(name); setSession(id); },
    references: (html: string) => htmlReferences(new TextEncoder().encode(html)),
  } });
  return <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
    <div>HTML preview · real desktop file bridge</div>
    {file ? <DocumentViewer key={session + file} file={{ session_id: session, kind: "workspace", path: file }} name={file} state={readingState(session, file)} /> : <p>Closed</p>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);

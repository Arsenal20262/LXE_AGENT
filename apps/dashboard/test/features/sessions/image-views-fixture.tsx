import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UnifiedConversationRow } from "../../../src/features/sessions/view";
import { conversationRows, type ConversationRow } from "../../../src/features/sessions/presentation";
import { groupImageViewRows } from "../../../src/features/sessions/image-view-groups";
import type { SessionMessage } from "../../../src/api/payloads";
import "../../../src/styles.css";

function Fixture() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [session, setSession] = useState("image-fixture");
  Object.assign(window, {
    fixtureLive: (steps: NonNullable<ConversationRow["liveTool"]>[]) => setRows(steps.map(step => ({
      id: step.id, groupId: "g", turnId: "image-turn", createdAt: 1, kind: "tool", liveTool: step,
    }))),
    fixtureHistory: (messages: SessionMessage[]) => setRows(conversationRows(messages, [], [])),
    fixtureSession: setSession,
  });
  const noop = async () => {};
  return <main className="conversation-feed" style={{ paddingTop: 60 }}>{groupImageViewRows(rows).map(row =>
    <UnifiedConversationRow key={row.id} row={row} expanded={false} onToggle={() => {}}
      onOpenFile={noop} onRevealFile={noop} onOpenAttachment={noop} attachmentSessionId={session} />)}</main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient()}><Fixture /></QueryClientProvider>);

// Real composer with a local submission sink; used by the native Electron paste smoke.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConversationComposer } from "../../../src/features/sessions/view";
import "../../../src/styles.css";
function Fixture() {
  const [key, setKey] = useState("paste-fixture");
  Object.assign(window, { fixtureSession: setKey });
  return <ConversationComposer
    contextDetail={null} activity={null} conversationKey={key} currentModel={null}
    modelLoading={false} models={[]} modelSaving={false} thinkingSaving={false}
    runtimeReady runtimeUnavailableMessage="" onModelChange={() => {}} onThinkingLevelChange={() => {}}
    onSend={async () => {}} onStop={async () => {}}
  />;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient()}><Fixture /></QueryClientProvider>);

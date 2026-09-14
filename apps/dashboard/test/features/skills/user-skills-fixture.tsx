import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setDashboardTransportForTests } from "../../../src/api/client";
import { UserSkillsView } from "../../../src/features/skills/user-view";
import { ConversationComposer } from "../../../src/features/sessions/view";
import { appendComposerDraftPrompt } from "../../../src/features/sessions/composer-draft";
import { useUiText } from "../../../src/shared/i18n";
import "../../../src/styles.css";
const calls: string[] = [];
setDashboardTransportForTests({ async call(call) {
  calls.push(call.operation);
  const response = await fetch("/__skills", { method: "POST", body: JSON.stringify(call) });
  if (!response.ok) throw new Error(await response.text()); return response.json();
} });
const client = new QueryClient();
const noop = async () => {};
function Fixture() {
  const [conversation, showConversation] = useState(false), [sent, setSent] = useState(0);
  const t = useUiText();
  return <main style={{ padding: 24, maxWidth: 1150, margin: "auto" }}>
    <nav><button onClick={() => showConversation(false)}>技能管理</button><button onClick={() => showConversation(true)}>新对话草稿</button>
      <button onClick={() => { void client.invalidateQueries({ queryKey: ["skills"] }); }}>刷新目录</button></nav>
    <p role="status">已发送消息：{sent}</p>
    {conversation ? <ConversationComposer contextDetail={null} activity={null} conversationKey="skill-acceptance-draft" currentModel={null}
      modelLoading={false} models={[]} modelSaving={false} thinkingSaving={false} runtimeReady runtimeUnavailableMessage=""
      onModelChange={() => {}} onThinkingLevelChange={() => {}} onSend={async () => { setSent(n => n + 1); }} onStop={noop} />
      : <UserSkillsView onConversation={(action, skill) => {
        const prompt = action === "create" ? t.userSkills.createPrompt : action === "edit" && skill
          ? t.userSkills.editPrompt(skill.name, skill.location) : t.userSkills.usePrompt(skill!.name);
        appendComposerDraftPrompt(sessionStorage, "skill-acceptance-draft", prompt); showConversation(true);
      }} />}
    <details><summary>调用记录</summary><pre>{calls.join("\n")}</pre></details>
  </main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);

// Run from the repository root: bun apps/dashboard/test/features/sessions/display-controller.bench.ts
import { ConversationDisplayController } from "../../../src/features/sessions/display-controller.ts";
import { conversationRows } from "../../../src/features/sessions/presentation.ts";
import type { SessionDetailPayload, SessionMessage, DesktopConversationTurnPayload } from "../../../src/api/payloads.ts";

function makeHistory(n: number, turnCount: number): SessionDetailPayload {
  const messages: SessionMessage[] = [];
  for (let t=0; t<turnCount; t++) {
    const base = { display_group_id: `g${t}`, turn: {turn_id: `old${t}`, status: "completed", elapsed_ms: 1000}, created_at: t+1 };
    messages.push({...base, id:`u${t}`, message_id:`u${t}`, role:"user", content:"Please inspect files."} as SessionMessage);
    for (let i=t; i<n; i+=turnCount) {
      messages.push({...base, id:`c${i}`, role:"assistant", content:[{type:"tool_call", id:`call${i}`, name:"read_file", input:{path:`file${i}.txt`}}]} as SessionMessage);
      messages.push({...base, id:`r${i}`, role:"tool", content:[{type:"tool_result", tool_call_id:`call${i}`, content:"file content", is_error:false}]} as SessionMessage);
    }
    messages.push({...base, id:`a${t}`, role:"assistant", content:[{type:"text", text:"Inspection complete."}]} as SessionMessage);
  }
  const ids=[...new Set(messages.map(m=>m.display_group_id))];
  return {session:{session_id:"bench"},messages,messages_page:{group_cursors:ids,total:ids.length,raw_message_total:messages.length,limit:60,fetched_at:1,oldest_cursor:ids[0]??null,newest_cursor:ids.at(-1)??null,previous_cursor:null,has_previous:false,next_cursor:null,has_next:false}} as SessionDetailPayload;
}
function live(seq: number) {
  const turn = {turn_id:"new",message_id:"new-user",client_message_id:"new-client",text:"Continue",created_at:100_000,started_at:100_000,settled_at:0,user_persisted_at:100_000,state:"running",stream:{seq,process_parts:[{type:"text",part_id:"new-answer:0",sequence:1,text:`Streaming ${String(seq).padStart(6,"0")}`,status:"running",presentation:"final"}],tool_steps:[],display_metrics:{phase:"waiting_model"}}} as DesktopConversationTurnPayload;
  return {session_id:"bench",active:turn,latest:null,queued:[]};
}
function measure(fn:()=>unknown) {
  for(let i=0;i<25;i++) fn();
  const samples:number[]=[];
  for(let i=0;i<60;i++){const start=performance.now();fn();samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);
  const rounded=(x:number)=>Number(x.toFixed(3));
  return {median_ms:rounded(samples[30]!),mean_ms:rounded(samples.reduce((a,b)=>a+b,0)/samples.length),p95_ms:rounded(samples[57]!)};
}
console.log(JSON.stringify({runtime:Bun.version,warmup:25,samples:60,scope:"receiveActivity only; loaded history unchanged; 1 live text part; no React or network"}));
for(const turnCount of [1,20]) for(const n of [500,1000,2000]) {
  const page=makeHistory(n,turnCount);
  const c=new ConversationDisplayController(); c.select("bench");c.receiveHistory(page,"latest");
  let seq=0;c.receiveActivity(live(++seq));
  const before=c.getSnapshot(); const beforeTool=before.rows.find(r=>r.kind==="tool");
  c.receiveActivity(live(++seq));
  const after=c.getSnapshot();
  const retainedTools=after.rows.filter(r=>r.kind==="tool").length;
  if(retainedTools!==n) throw new Error(`History truncated: ${retainedTools}/${n}`);
  const update=measure(()=>c.receiveActivity(live(++seq)));
  const projection=measure(()=>conversationRows(after.detail!.messages,[],[]));
  console.log(JSON.stringify({calls:n,history_turns:turnCount,retained_tools:retainedTools,history_bytes:new TextEncoder().encode(JSON.stringify(page.messages)).byteLength,update,history_projection:projection,same_history_reference:before.detail===after.detail,same_first_tool_row_reference:beforeTool===after.rows.find(r=>r.kind==="tool")}));
}

// A large retained live turn, with no saved history, exercises whole-turn rebuilding.
for (const n of [500, 1000, 2000]) {
  const c = new ConversationDisplayController(); c.select("bench"); c.receiveHistory(makeHistory(0, 0), "latest");
  const parts = Array.from({length:n}, (_, i) => ({type:"tool", part_id:`tool:live${i}`, sequence:i+1, tool_step:{id:`live${i}`, name:"read_file", status:"success", arguments:{path:`file${i}.txt`}, result_block:{type:"tool_result", content:"ok"}}}));
  let seq = 0;
  const update = measure(() => {
    const value = live(++seq);
    value.active.stream!.process_parts = [...parts, ...value.active.stream!.process_parts] as NonNullable<DesktopConversationTurnPayload["stream"]>["process_parts"];
    c.receiveActivity(value);
  });
  const retained = c.getSnapshot().rows.filter(row=>row.kind==="tool").length;
  if (retained !== n) throw new Error(`Live tools truncated: ${retained}/${n}`);
  console.log(JSON.stringify({live_calls:n, update}));
}

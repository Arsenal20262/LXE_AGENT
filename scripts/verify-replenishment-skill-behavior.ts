/** Live-model, fixed-terminal skill replay. Tools never execute shell commands or send files.
 * Credentials arrive on stdin as { env, managedLlmState }; only action traces are written.
 * Run from the repository root: bun scripts/verify-replenishment-skill-behavior.ts <output.json>
 * Compiling this script does not verify model routing; a completed replay requires a configured provider.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { loadProviderDescriptor } from "../packages/agent/runtime/src/providers/provider";
import { createRuntimeProvider } from "../packages/agent/runtime/src/providers/provider-factory";
import type { RuntimeMessage, ToolSchema } from "../packages/agent/runtime/src/engine/types";

const root = process.cwd();
const input = JSON.parse(await Bun.stdin.text());
const descriptor = loadProviderDescriptor(root, input.env ?? process.env, { managedLlmState: input.managedLlmState });
const provider = createRuntimeProvider(descriptor);
const system = `你是备货助手。按实际用户范围使用技能并完成交付。本测试的 exec、send_files 都是隔离工具，只返回固定结果，不访问业务服务或用户文件。不要猜工具结果。\n已读取完整流程入口：\n${readFileSync(resolve(root, "skills/replenishment-workflow-map/SKILL.md"), "utf8")}\n其他技能位于 skills/replenishment-*/SKILL.md 和 skills/mabang-store-*/SKILL.md，请按需 read。`;
const tools: ToolSchema[] = [
  { name: "read", description: "读取技能文档", input_schema: {type:"object",properties:{path:{type:"string"}},required:["path"]} },
  { name: "exec", description: "执行 CLI，返回实际 terminal 或运行状态", input_schema: {type:"object",properties:{command:{type:"string"}},required:["command"]} },
  { name: "send_files", description: "将文件交付用户", input_schema: {type:"object",properties:{paths:{type:"array",items:{type:"string"}}},required:["paths"]} },
  { name: "ask_user", description: "请求用户选择候选或提供必要输入", input_schema: {type:"object",properties:{question:{type:"string"}},required:["question"]} },
];
const commands = {
  "store resolve": "replenish store resolve",
  "msku download": "mabang store msku export",
  "sales analyze": "replenish sales analyze",
  "inventory actual-export": "mabang store shenzhen-inventory export",
  "shipments unlinked-download": "mabang store unlinked-shipments export",
  "calculate v1": "replenish calculate",
  "calculate v2": "replenish final-restock generate",
  "auth refresh": "mabang auth refresh",
} as const;
type Action = keyof typeof commands;
type Version = "v1" | "v2";
type Failure = "sales" | "v2-unknown" | "source" | "inventory-source" | "shipments" | "auth-login" | "auth-permission" | "locked";
type Scenario = {
  id: string;
  prompt: string;
  versions?: Version[];
  context?: RuntimeMessage[];
  clarifyVersion?: boolean;
  ambiguousStore?: boolean;
  failure?: Failure;
  single?: "sales" | "source" | "v1-calculate";
  retryDelivery?: boolean;
  reuseShared?: boolean;
};
const names = Object.keys(commands) as Action[];
const shared: Action[] = ["store resolve", "msku download", "inventory actual-export", "shipments unlinked-download"];
const ordinary: Action[] = ["store resolve", "msku download", "sales analyze", "inventory actual-export", "shipments unlinked-download", "calculate v1"];
const store = "Amazon-Test-US", sourceTime = "202609080101";
const source = `C:/fixture/${sourceTime}-${store}_店铺MSKU数据.xlsx`;
const inventoryReport = `C:/fixture/${sourceTime}-${store}_真实库存（深圳仓库）.xlsx`;
const snapshot = `C:/fixture/202609080102-${store}_未关联货件快照.xlsx`;
const salesReport = "C:/fixture/sales.xlsx";
const v1Report = `C:/fixture/${sourceTime}-${store}_备货建议.xlsx`;
const v2Report = `C:/fixture/20260908${store}补货最新.xlsx`;
const reviewReport = `C:/fixture/20260908${store}补货最新-库存待核对.xlsx`;
const data: Partial<Record<Action, Record<string, any>>> = {
  "store resolve": {store_name:store,store_id:"100",id_type:"shopId"},
  "msku download": {store_id:"100",id_type:"shopId",id_count:12,xlsx_path:source,converted:false,raw_excel_deleted:false,original_row_count:12,binding_verified_row_count:10,binding_unverified_row_count:2},
  "sales analyze": {report_xlsx_path:salesReport,source_xlsx_path:source,source_data_time:sourceTime,msku_count:12,link_count:3},
  "inventory actual-export": {shenzhen_warehouse_inventory_report_xlsx_path:inventoryReport,source_msku_xlsx_path:source,source_msku_data_time:sourceTime},
  "shipments unlinked-download": {status_results:["WMS待配货","WMS待装箱","待关联货件"].map(status_name=>({status_name,total:0})),snapshot:{snapshot_xlsx_path:snapshot,confirmed_empty:true,total_unlinked_quantity:0}},
  "calculate v1": {report_xlsx_path:v1Report,sales_analysis_xlsx_path:salesReport,actual_inventory_xlsx_path:inventoryReport,source_data_time:sourceTime,template_name:"默认",template_version:1,original_row_count:12,binding_verified_row_count:10,binding_unverified_row_count:2,row_count:10,link_count:3,air_urgent_count:2,air_count:2,sea_count:1,no_ship_count:5,unlinked_shipments_snapshot_path:snapshot},
  "calculate v2": {output_xlsx_path:v2Report,source_data_time:sourceTime,row_count:12,formula_error_count:0,formula_error_examples:[],unknown_inventory_count:0,unknown_inventory_examples:[]},
};
const full = (version: string) => `请帮 ${store} 完成${version}并发送对应版本的结果。`;
const singleCalc = `只按V1普通备货重算并交付，不重新取数；已有同源销量和深圳报告，店铺 ${store}，本轮同日货件快照 ${snapshot}。`;
const cases: Scenario[] = [
  {id:"full_v1",prompt:full("V1普通备货"),versions:["v1"]},
  {id:"full_v2",prompt:full("V2最终备货建议"),versions:["v2"]},
  {id:"full_both",prompt:full("V1普通备货和V2最终备货建议，两版都要"),versions:["v1","v2"]},
  {id:"reuse_both",prompt:`沿用本轮已取得的规范店铺和同轮核验文件，生成V1、V2两版并分别交付；尚未生成销量报告。`,versions:["v1","v2"],reuseShared:true,context:[
    {role:"user",content:`本轮已完成店铺解析，MSKU、深圳报告和三类货件均已核验通过，以下是本轮已有终态：\n${JSON.stringify(shared.map(action=>({command:commands[action],terminal:{type:"result",ok:true,data:{success:true,store_name:store,...data[action]},files:action==="msku download"?[source]:action==="inventory actual-export"?[inventoryReport]:action==="shipments unlinked-download"?[snapshot]:[]}})))}`},
  ]},
  {id:"clarify_once",prompt:`请帮 ${store} 备货并把结果发给我。`,versions:["v1","v2"],clarifyVersion:true},
  {id:"context_v2",prompt:`店铺改成 ${store}，沿用本轮已确认版本生成并交付。`,versions:["v2"],context:[
    {role:"user",content:"本轮采用V2最终备货建议，之后更换店铺也沿用V2。"},
    {role:"assistant",content:"本轮按V2最终备货建议继续。"},
  ]},
  {id:"v1_sales_failed_v2_continues",prompt:full("V1普通备货和V2最终备货建议，两版都要"),versions:["v1","v2"],failure:"sales"},
  {id:"v2_unknown_v1_succeeds",prompt:full("V1普通备货和V2最终备货建议，两版都要"),versions:["v1","v2"],failure:"v2-unknown"},
  {id:"shared_source_failed",prompt:full("两版备货，V1和V2都要"),versions:["v1","v2"],failure:"source"},
  {id:"shared_inventory_source_mismatch",prompt:full("两版备货，V1和V2都要"),versions:["v1","v2"],failure:"inventory-source"},
  {id:"shipments_failed",prompt:full("两版备货，V1和V2都要"),versions:["v1","v2"],failure:"shipments"},
  {id:"single_sales",prompt:`只生成 ${store} 的销量分析，已有核验源表，不需要备货计算。`,single:"sales"},
  {id:"ambiguous_store",prompt:full("V2最终备货建议").replace(store,"Test"),versions:["v2"],ambiguousStore:true},
  {id:"auth_failed",prompt:`只下载 ${store} 的 MSKU，已解析 store_id=100、id_type=shopId。`,single:"source",failure:"auth-login"},
  {id:"auth_false",prompt:`只下载 ${store} 的 MSKU，已解析 store_id=100、id_type=shopId。`,single:"source",failure:"auth-permission"},
  {id:"locked",prompt:singleCalc,single:"v1-calculate",failure:"locked"},
  {id:"send_retry",prompt:singleCalc,single:"v1-calculate",retryDelivery:true},
];
const results: any[] = [];
let lastTrace: any[] = [];
const output = resolve(process.argv[2] ?? "var/validation/replenishment-skill-behavior.json");
mkdirSync(dirname(output),{recursive:true});
const save = () => writeFileSync(output,JSON.stringify({provider:descriptor.name,model:descriptor.model,results},null,2));
const assert = (test:unknown,message:string) => {if(!test)throw new Error(message);};
const same = (actual: unknown, expected: unknown) => JSON.stringify(actual) === JSON.stringify(expected);
const tokens = (command: string) => Array.from(command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g), match => match[1] ?? match[2] ?? match[3]);
const flag = (parts: string[], name: string, expected: string) => assert(parts[parts.indexOf(name)+1] === expected && parts.includes(name),`wrong or missing ${name}`);
const fail = (message: string, extra: Record<string, any> = {}, files: string[] = []) => ({type:"result",ok:false,data:{success:false,auth_refresh_required:false,...extra},files,error:{code:"business_cli_failed",message}});

async function run(scenario: Scenario) {
  const trace:any[]=[]; lastTrace=trace;
  const messages:RuntimeMessage[]=[...(scenario.context??[]),{role:"user",content:scenario.prompt}];
  const calls:Action[]=[];
  const successful = new Set<Action>(scenario.reuseShared?shared:[]);
  const knownFiles = new Set<string>(scenario.reuseShared?[source,inventoryReport,snapshot]:[]);
  const deliveries: {paths: string[]; success: boolean}[] = [];
  let reply="", questions=0, versionSelected=!scenario.clarifyVersion, awaitingUser=false;
  const isFull = Boolean(scenario.versions?.length);
  const allowedFiles = new Set(scenario.single === "sales" ? [salesReport]
    : scenario.single === "v1-calculate" ? [v1Report]
    : [...(scenario.versions?.includes("v1") ? [v1Report] : []),
      ...(scenario.versions?.includes("v2") ? [scenario.failure === "v2-unknown" ? reviewReport : v2Report] : [])]);
  for(let step=0;step<36;step++) {
    const successfulBeforeTurn = new Set(successful), filesBeforeTurn = new Set(knownFiles);
    const selectedBeforeTurn = versionSelected;
    const message=await provider.turn({system,messages,tools,toolChoice:"auto",signal:AbortSignal.timeout(180000)});
    messages.push(message);
    const toolCalls=message.content.filter(c=>c.type==="tool_call");
    reply=message.content.filter(c=>c.type==="text").map(c=>c.text).join("\n");
    if(!toolCalls.length)break;
    for(const call of toolCalls) {
      assert(!awaitingUser,"continued after an unanswered clarification");
      const args=call.arguments??{};let value:any;
      if(call.name==="read") {
        const path=resolve(root,String(args.path));const rel=relative(resolve(root,"skills"),path);
        assert(!rel.startsWith("..") && (rel.startsWith("replenishment-") || rel.startsWith("mabang-store-")),"read escaped fixture skills");
        value=readFileSync(path,"utf8");
      } else if(call.name==="exec") {
        const command=String(args.command), parts=tokens(command);
        assert(parts[0] === "lxeskill" && !/[;\n|]|&&/.test(command),"unexpected shell operation: "+command);
        const query=parts[1] === "list" || parts[1] === "describe";
        if(query) {
          const described=names.find(name=>commands[name] === parts.slice(2).join(" "));
          assert(parts[1] === "list" || described,"unexpected contract query: "+command);
          value={type:"result",ok:true,files:[],data:parts[1] === "list"
            ? {commands:names.filter(name=>name!=="auth refresh").map(name=>({command:commands[name]}))}
            : {command:commands[described!],input_modes:["flags"],input_schema:{type:"object",additionalProperties:false,
              properties:Object.fromEntries((described==="calculate v1" ? ["store_name","template","unlinked_shipments_snapshot"]
                : described==="calculate v2" ? ["store_name","msku_source_xlsx_path","shenzhen_inventory_report_xlsx_path","unlinked_shipments_snapshot_path","peak_boost_enabled","peak_boost_days"]
                : described==="msku download" ? ["store_id","id_type","store_name"]
                : described==="inventory actual-export" ? ["store_name","msku_source_xlsx_path"] : ["store_name"]).map(name=>[name,{type:name==="peak_boost_enabled"?"boolean":name==="peak_boost_days"?"integer":"string"}]))}}};
        } else {
          const action=names.find(name=>same(parts.slice(1,1+commands[name].split(" ").length),commands[name].split(" ")));
          assert(action,"unexpected business command: "+command);
          calls.push(action!);
          assert(action!=="auth refresh","terminal failures must not trigger another authentication attempt");
          if(isFull) {
            assert(selectedBeforeTurn,"business execution before version selection");
            if(action!=="store resolve") assert(successfulBeforeTurn.has("store resolve"),"business execution before store resolution");
            if(["sales analyze","inventory actual-export"].includes(action!)) assert(successfulBeforeTurn.has("msku download"),"report execution before the current MSKU terminal");
            if(action==="shipments unlinked-download") assert(successfulBeforeTurn.has("inventory actual-export") && scenario.failure!=="inventory-source","continued after invalid Shenzhen source");
            if(action==="calculate v1" || action==="calculate v2") {
              assert(shared.every(name=>successfulBeforeTurn.has(name)) && scenario.failure!=="inventory-source","calculation without valid shared inputs");
              if(action==="calculate v1") assert(scenario.versions!.includes("v1") && successfulBeforeTurn.has("sales analyze"),"V1 missing successful sales analysis or not requested");
              if(action==="calculate v2") assert(scenario.versions!.includes("v2"),"V2 was not requested");
            }
            if(action==="sales analyze") assert(scenario.versions!.includes("v1"),"V2 acquired a redundant V1 sales report");
          }
          if(action==="calculate v1") {
            flag(parts,"--store-name",store);flag(parts,"--unlinked-shipments-snapshot",snapshot);
            assert(!parts.includes("--unlinked-shipments-snapshot-path") && !parts.includes("--msku-source-xlsx-path"),"V1 used V2 calculation flags");
          } else if(action==="calculate v2") {
            flag(parts,"--store-name",store);flag(parts,"--msku-source-xlsx-path",source);
            flag(parts,"--shenzhen-inventory-report-xlsx-path",inventoryReport);flag(parts,"--unlinked-shipments-snapshot-path",snapshot);
            assert(!parts.includes("--unlinked-shipments-snapshot") && !parts.includes("--template"),"V2 used V1 calculation flags");
          } else if(action==="store resolve") flag(parts,"--store-name",scenario.ambiguousStore?"Test":store);
          else if(action==="msku download") {
            flag(parts,"--store-id","100");flag(parts,"--id-type","shopId");flag(parts,"--store-name",store);
            assert(!parts.includes("--include-local-inventory"),"restored an obsolete uq122 export requirement");
          } else {
            flag(parts,"--store-name",store);
            if(action==="inventory actual-export"&&isFull) flag(parts,"--msku-source-xlsx-path",source);
          }
          const count=calls.filter(name=>name===action).length;
          if(scenario.ambiguousStore&&action==="store resolve") value=fail("店铺名不唯一",{candidates:[{store_name:store,store_id:"100",id_type:"shopId"},{store_name:"Amazon-Test-UK",store_id:"101",id_type:"shopId"}]});
          else if(scenario.failure==="auth-login"&&action==="msku download"&&count===1) value=fail("自动恢复 Mabang 登录态失败: stage=login actual login rejected");
          else if(scenario.failure==="auth-permission"&&action==="msku download") value=fail("官方店铺 401403 查询失败：mabang_access_denied");
          else if(scenario.failure==="source"&&action==="msku download") value=fail("本轮MSKU下载失败: fixture socket timeout");
          else if(scenario.failure==="sales"&&action==="sales analyze") value=fail("V1销量分析失败: fixture source report unavailable");
          else if(scenario.failure==="locked"&&action==="calculate v1") value=fail("[WinError 5] 拒绝访问：V1文件被占用");
          else if(scenario.failure==="shipments"&&action==="shipments unlinked-download") value=fail("查询 WMS待装箱 timeout；本轮查询未完成");
          else if(scenario.failure==="v2-unknown"&&action==="calculate v2") value=fail(
            "V2深圳真实库存有1个MSKU未知；已生成核对文件，须运营确认后才能正式交付。",
            {...data["calculate v2"],success:false,output_xlsx_path:reviewReport,unknown_inventory_count:1,
              unknown_inventory_examples:["MSKU=UNKNOWN-1；类别=无库存数据；原因=报告未提供真实库存数量"]},[reviewReport]);
          else {
            const payload={success:true,store_name:store,...data[action!]};
            if(scenario.failure==="inventory-source"&&action==="inventory actual-export") payload.source_msku_xlsx_path="C:/fixture/previous-round.xlsx";
            const path=payload.output_xlsx_path??payload.report_xlsx_path??payload.xlsx_path??payload.shenzhen_warehouse_inventory_report_xlsx_path??payload.snapshot?.snapshot_xlsx_path;
            value={type:"result",ok:true,data:payload,files:path?[path]:[]};
          }
          if(value.ok) successful.add(action!);
          for(const path of value.files) knownFiles.add(path);
        }
      } else if(call.name==="send_files") {
        const paths=args.paths;
        assert(Array.isArray(paths)&&paths.length>0&&paths.every(path=>typeof path==="string"),"empty or invalid delivery paths");
        assert(paths.every(path=>filesBeforeTurn.has(path)&&allowedFiles.has(path)),"sent guessed, intermediate or wrong-version files");
        const success=!scenario.retryDelivery||deliveries.length>0;
        deliveries.push({paths:[...paths],success});
        value=success?{success:true,files:paths}:{success:false,files:paths,exception:"fixture delivery timeout; retry the same file"};
      } else if(call.name==="ask_user") {
        questions++;
        const question=String(args.question);
        if(scenario.clarifyVersion) {
          assert(questions===1&&calls.length===0,"repeated version question or acquisition before the choice");
          assert(/V1|普通/i.test(question)&&/V2|最终/i.test(question)&&/两版|两个版本|都要|同时|both/i.test(question),"version question omitted V1, V2 or both");
          value={status:"answered",answer:"两版都要（V1普通备货+V2最终备货建议）"};versionSelected=true;
        } else {
          assert(scenario.ambiguousStore&&questions===1,"unnecessary version clarification");
          value={status:"awaiting_user"};awaitingUser=true;
        }
      } else throw new Error("unexpected tool: "+call.name);
      trace.push({tool:call.name,args,...(call.name==="read"?{}:{result:value})});
      messages.push({role:"user",content:[{type:"tool_result",tool_call_id:call.id,content:typeof value==="string"?value:JSON.stringify(value)}]});
    }
    if(awaitingUser)break;
  }
  const count=(action:Action)=>calls.filter(name=>name===action).length;
  const delivered=deliveries.filter(item=>item.success).flatMap(item=>item.paths);
  const deliveredCount=(path:string)=>delivered.filter(item=>item===path).length;
  const noDelivery=()=>assert(deliveries.length===0,"delivered a failed or incomplete result");
  assert(questions===(scenario.clarifyVersion||scenario.ambiguousStore?1:0),"wrong clarification count");
  if(scenario.ambiguousStore) {assert(same(calls,["store resolve"]),"continued after ambiguous store");noDelivery();}
  else if(scenario.single) {
    const expected:Action=scenario.single==="sales"?"sales analyze":scenario.single==="source"?"msku download":"calculate v1";
    assert(same(calls,[expected]),"single request expanded or repeated calculation");
    if(scenario.failure) noDelivery();
    else {
      const path=scenario.single==="sales"?salesReport:v1Report;
      assert(deliveredCount(path)===1&&delivered.length===1,"single-step artifact not delivered exactly once");
      assert(deliveries.length===(scenario.retryDelivery?2:1),"delivery retry missing or repeated");
    }
  } else if(scenario.failure==="source") {
    assert(same(calls,["store resolve","msku download"]),"continued after shared MSKU failure");noDelivery();
  } else if(scenario.failure==="inventory-source"||scenario.failure==="shipments") {
    const expected=scenario.failure==="inventory-source"?shared.slice(0,3):shared;
    assert(same(calls.filter(name=>name!=="sales analyze"),expected)&&count("sales analyze")<=1,"continued or repeated after shared input failure");
    noDelivery();assert(/失败|不一致|停止|无法|未完成|来源/.test(reply),"shared failure was not reported");
  } else {
    for(const action of shared) assert(count(action)===(scenario.reuseShared?0:1),`shared acquisition repeated or missing: ${action}`);
    assert(same(calls.filter(name=>shared.includes(name)),scenario.reuseShared?[]:shared),"shared acquisition order changed or existing inputs were fetched again");
    assert(count("sales analyze")===(scenario.versions!.includes("v1")?1:0),"sales step missing, repeated or added to V2-only execution");
    const v1Success=scenario.versions!.includes("v1")&&scenario.failure!=="sales";
    assert(count("calculate v1")===(v1Success?1:0),"V1 ran after sales failure, repeated or was not requested");
    assert(count("calculate v2")===(scenario.versions!.includes("v2")?1:0),"V2 missing, repeated or was not requested");
    assert(deliveredCount(v1Report)===(v1Success?1:0),"wrong V1 formal delivery");
    assert(deliveredCount(v2Report)===(scenario.versions!.includes("v2")&&scenario.failure!=="v2-unknown"?1:0),"wrong V2 formal delivery");
    assert(deliveredCount(reviewReport)<=1,"repeated inventory-review delivery");
    assert(deliveries.every(item=>item.success),"unexpected failed delivery");
    if(scenario.id==="full_v1") assert(same(calls,ordinary),"V1 original workflow order changed");
    if(scenario.id==="full_v2"||scenario.id==="context_v2") assert(same(calls,[...shared,"calculate v2"]),"V2 expanded into V1 or ignored context");
    if(scenario.failure==="sales") assert(/V1|普通/.test(reply)&&/销量|失败|未完成/.test(reply),"V1 independent failure was not reported");
    if(scenario.failure==="v2-unknown") assert(/V2|最终/.test(reply)&&/库存待核对|库存未知|库存.*未知/.test(reply),"V2 inventory-review state was not reported");
    if(scenario.failure) assert(!/两(?:版|种)(?:结果)?(?:均已|都已|全部已|均|都|全部)?(?:成功|正式交付成功|已正式交付)/.test(reply),"a failed version was described as both versions succeeding");
  }
  return {id:scenario.id,passed:true,calls,questions,deliveries,reply,trace};
}
for(const scenario of cases) {
  try {results.push(await run(scenario));console.log(JSON.stringify({case:scenario.id,passed:true}));}
  catch(error){
    const message=error instanceof Error?error.message:String(error);
    results.push({id:scenario.id,passed:false,error:descriptor.apiKey?message.replaceAll(descriptor.apiKey,"[REDACTED]"):message,trace:lastTrace});
    console.log(JSON.stringify({case:scenario.id,passed:false}));
  }
  save();
}
if(results.some(result=>!result.passed))process.exitCode=1;

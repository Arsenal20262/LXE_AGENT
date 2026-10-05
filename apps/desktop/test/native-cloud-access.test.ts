import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "@lxe/core";
import { DesktopCloudService } from "../src/main/desktop-cloud";
import { DesktopCloudEnrollmentManager } from "../src/main/cloud-enrollment";
import { DesktopConfigStore } from "../src/main/config-store";
import { CloudContextError } from "../src/main/cloud-context";
import { CloudHttpError, parseCloudError } from "../src/main/cloud-errors";
import { DirectNativeCloudClient } from "../src/main/native-cloud-client";
const roots: string[] = [];
const safe = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() };
const logs: unknown[] = [];
const logger: Logger = { debug() {}, info() {}, warn(m, f) { logs.push([m,f]); }, error() {}, child() { return logger; } };
afterEach(() => { roots.splice(0).forEach(r => rmSync(r,{ recursive:true, force:true })); logs.length=0; });
function fixture() {
  const root = mkdtempSync(join(tmpdir(),"native-cloud-")); roots.push(root); mkdirSync(join(root,"workspace"));
  let config = new DesktopConfigStore(root, join(root,"workspace"), safe, {platform:"win32"});
  const device = { kind:"managed_device", id:"pc", display_name:"PC", wireguard_ip:"10.88.0.28" };
  let role = "administrator", revision = "a".repeat(64), offline = false, denied = false, available = true;
  let pause: Promise<void> | null = null;
  const requests: string[] = [];
  const context = () => ({response_schema:"lxe.device-context.v1",device:{...device}, permission: {
    assignment_version:1, profile:{id:"fba",revision:1,labels:{"zh-CN":"FBA","en-US":"FBA"}},
    grants:{skill_types:["default"],desktop_features:["erp_dashboard"],server_capabilities:["erp"],erp_actions:["purchase_import"]}}});
  const make = (overrides: Partial<ConstructorParameters<typeof DesktopCloudService>[0]> = {}) => new DesktopCloudService({ dataRoot:root, supported:false, config, logger,
    enrollments:new DesktopCloudEnrollmentManager(), provisioner:{provision:async()=>{throw Error("no provisioning");}},
    onConfigured:async()=>{}, fetch:async()=>{throw Error("must not request old identity");},
    contextClient:{query:async()=>{if(offline)throw new CloudContextError("offline","cloud_connection_failed");
      if(denied)throw new CloudContextError("denied","business_device_denied",403);return context();}},
    accessClient:{request:async(_server,path,_signal,body)=>{
      requests.push(path);
      if(path==="/api/v1/device-access")return {response_schema:"lxe.device-access.v1",device:{...device},
        management_role:role,management_version:1,managed_llm_v2:{revision:1,default_target:available?{provider:"deepseek",model:"deepseek-v4-flash"}:null,
          models:available?[{provider:"deepseek",model:"deepseek-v4-flash",available:true,credential_revision:revision}]:[]}};
      const observed={...device}; if(pause)await pause;
      if(path.includes("browser-handoff"))return {device:observed,code: ((body as any).target==="erp"?"lxe_erp_handoff_":"lxe_handoff_")+"x".repeat(43),expires_at:4000000000};
      return {device:observed,credential:{provider:"deepseek",model:"deepseek-v4-flash",api_key:"fixture-key-"+revision[0],credential_revision:revision}};
    }}, ...overrides });
  return {root,get config(){return config;},device,requests,make,setRole:(v:string)=>role=v,setRevision:(v:string)=>revision=v.repeat(64),
    setOffline:(v:boolean)=>offline=v,setDenied:(v:boolean)=>denied=v,setAvailable:(v:boolean)=>available=v,setPause:(v:Promise<void>)=>pause=v,
    restart:()=>config=new DesktopConfigStore(root,join(root,"workspace"),safe,{platform:"win32"})};
}
test("two independent unbound Windows directories fetch models and open scoped browser destinations",async()=>{
  const a=fixture(),b=fixture(); const x=a.make(),y=b.make();
  await x.start();await y.start();
  for(const f of [a,b]) {
    expect(f.config.cloudConfiguration().managed).toBe(false);
    expect(f.config.cloudIdentityCredential()).toBe("");
    expect(f.config.state().credential_source).toBe("cloud");
    expect(f.config.managedLlmOwner()?.id).toBe("pc");
  }
  expect(x.state().native_access).toMatchObject({status:"connected",model_status:"ready",is_admin:true});
  expect(await x.adminDashboardUrl()).toContain("/admin?auth=identity-v1#handoff=lxe_handoff_");
  expect(await x.erpDashboardUrl()).toContain("/erp?auth=identity-v1#handoff=lxe_erp_handoff_");
  await x.clearModelCache();expect(a.config.managedLlmState().credentials).toHaveLength(0);
  expect(b.config.managedLlmState().credentials).toHaveLength(1);
  await x.check();expect(a.config.managedLlmState().credentials).toHaveLength(1);
  await x.stop();await y.stop();
});
test("offline restart retains owned cache; denial removes it; local credentials and preferences survive",async()=>{
  const f=fixture();f.config.saveLocalModelCredential({provider:"deepseek",api_key:"personal"});
  let s=f.make();await s.start();expect(f.config.state().credential_source).toBe("local");await s.stop();
  f.restart();f.setOffline(true);s=f.make();await s.start();
  expect(s.state().native_access).toMatchObject({status:"offline",model_status:"cached"});
  expect(f.config.managedLlmState().credentials).toHaveLength(1);
  await expect(s.erpDashboardUrl()).rejects.toThrow();
  f.setOffline(false);f.setDenied(true);await s.check();
  expect(f.config.managedLlmState().credentials).toHaveLength(0);
  expect(f.config.state().credential_source).toBe("local");
  await s.stop();
});
test("identity changes require confirmation; role changes disable admin; publication removes keys",async()=>{
  const f=fixture(),s=f.make();await s.start();
  f.device.id="second";await s.check();expect(s.state().device_context?.pending_device?.id).toBe("second");
  expect(f.config.managedLlmState().credentials).toHaveLength(0);
  await expect(s.adminDashboardUrl()).rejects.toThrow();
  await s.confirmDevice();expect(f.config.managedLlmOwner()?.id).toBe("second");
  f.setRole("member");await s.check();await expect(s.adminDashboardUrl()).rejects.toThrow();
  expect(await s.erpDashboardUrl()).toContain("erp_handoff");
  f.setAvailable(false);await s.check();expect(f.config.managedLlmState().credentials).toHaveLength(0);
  await s.stop();
});
test("late model responses after cache clear cannot repopulate credentials",async()=>{
  const f=fixture(),s=f.make();await s.start();f.setRevision("b");
  let resume!:()=>void;f.setPause(new Promise<void>(r=>resume=r));
  const pending=s.check();while(f.requests.filter(p=>p.includes("llm-credential")).length<2)await Bun.sleep(1);
  await s.clearModelCache();resume();await pending;
  expect(f.config.managedLlmState().credentials).toHaveLength(0);await s.stop();
});
test("direct transport ignores proxies, never sends credentials/cookies, and never follows redirects",async()=>{
  const seen:string[]=[];const upstream=Bun.serve({hostname:"127.0.0.1",port:0,fetch(req){
    seen.push(new URL(req.url).pathname);expect(req.headers.get("authorization")).toBeNull();expect(req.headers.get("cookie")).toBeNull();
    expect(req.headers.get("x-lxe-client")).toBe("cli");
    if(new URL(req.url).pathname.endsWith("redirect"))return new Response(null,{status:302,headers:{location:"/leak"}});
    return Response.json({ok:true});
  }});
  const old=process.env.HTTP_PROXY;process.env.HTTP_PROXY="http://127.0.0.1:1";
  try {
    const c=new DirectNativeCloudClient(),signal=new AbortController().signal,server="http://127.0.0.1:"+upstream.port;
    expect(await c.request(server,"/api/v1/device-access",signal)).toEqual({ok:true});
    await expect(c.request(server,"/api/v1/device-access/redirect",signal)).rejects.toBeInstanceOf(CloudHttpError);
    expect(seen).toHaveLength(2);
  }finally{if(old===undefined)delete process.env.HTTP_PROXY;else process.env.HTTP_PROXY=old;upstream.stop(true);}
});
test("HTTP diagnostics parse full long JSON and redact model keys before logging/display",async()=>{
  const upstream=Bun.serve({hostname:"127.0.0.1",port:0,fetch(){return Response.json({padding:"x".repeat(6000),detail:{
    code:"new_code",user_message:"请重试",message:"diagnostic",api_key:"must-not-leak"}},{status:403});}});
  try{await new DirectNativeCloudClient().request("http://127.0.0.1:"+upstream.port,"/api/v1/device-access",new AbortController().signal);
    throw Error("expected failure");}catch(e){expect(e).toBeInstanceOf(CloudHttpError);expect((e as Error).message).toBe("请重试");
    expect(JSON.stringify(e)).not.toContain("must-not-leak");}finally{upstream.stop(true);}
});

test("unknown legacy model cache is removed, while attributable enrollment cache migrates", async () => {
  for (const enrolled of [false, true]) {
    const f=fixture();
    if (enrolled) f.config.saveCloudEnrollment({deviceId:"pc",deviceName:"PC",vpnIp:f.device.wireguard_ip,
      dataServerUrl:"http://10.88.0.1:8000",tunnelName:"",apiKey:"lxe_client_pc.fixture"});
    f.config.saveLocalModelCredential({provider:"deepseek",api_key:"personal"});
    f.config.saveManagedLlmState({revision:1,default_target:{provider:"deepseek",model:"deepseek-v4-flash"},
      models:[{provider:"deepseek",model:"deepseek-v4-flash",available:true,credential_revision:"a".repeat(64)}],
      credentials:[{provider:"deepseek",model:"deepseek-v4-flash",api_key:"fixture",credential_revision:"a".repeat(64),fetched_at:1,invalid_revision:""}]});
    f.restart();
    expect(f.config.managedLlmState().credentials).toHaveLength(enrolled?1:0);
    expect(f.config.managedLlmOwner()?.id ?? null).toBe(enrolled?"pc":null);
    expect(f.config.state().credential_source).toBe("local");
  }
});
test.each(["credential","handoff"] as const)("mismatched %s response clears the old device cache",async stage=>{
  const f=fixture(),normal=f.make();await normal.start();await normal.stop();
  const s=f.make({accessClient:{request:async(_server,path)=>{
    if(path==="/api/v1/device-access") return {response_schema:"lxe.device-access.v1",device:f.device,
      management_role:"administrator",management_version:1,managed_llm_v2:{revision:1,default_target:{provider:"deepseek",model:"deepseek-v4-flash"},
        models:[{provider:"deepseek",model:"deepseek-v4-flash",available:true,credential_revision:(stage==="credential"?"b":"a").repeat(64)}]}};
    return {device:{...f.device,id:"different"},code:"lxe_handoff_"+"x".repeat(43),expires_at:4000000000};
  }}});
  await s.start();
  if(stage==="handoff") await expect(s.adminDashboardUrl()).rejects.toThrow("identity changed");
  expect(f.config.managedLlmState().credentials).toHaveLength(0);
  expect(s.state().native_access?.status).toBe("denied");await s.stop();
});
test("model-specific failure does not prevent another published model or browser login",async()=>{
  const f=fixture();
  const s=f.make({accessClient:{request:async(_server,path)=>{
    if(path==="/api/v1/device-access")return {response_schema:"lxe.device-access.v1",device:f.device,management_role:"member",management_version:1,
      managed_llm_v2:{revision:1,default_target:{provider:"deepseek",model:"deepseek-v4-pro"},
        models:["deepseek-v4-flash","deepseek-v4-pro"].map(model=>({provider:"deepseek",model,available:true,credential_revision:"a".repeat(64)}))}};
    if(path.includes("browser-handoff"))return {device:f.device,code:"lxe_erp_handoff_"+"x".repeat(43),expires_at:4000000000};
    if(path.includes("flash"))throw new CloudHttpError(parseCloudError('{"detail":{"code":"model_unavailable","user_message":"模型已下架","message":"No model"}}'),404,"failed");
    return {device:f.device,credential:{provider:"deepseek",model:"deepseek-v4-pro",credential_revision:"a".repeat(64),api_key:"fixture"}};
  }}});
  await s.start();expect(f.config.managedLlmState().credentials.map(c=>c.model)).toEqual(["deepseek-v4-pro"]);
  expect(s.state().native_access?.last_error).toBe("模型已下架");
  expect(await s.erpDashboardUrl()).toContain("erp_handoff");await s.stop();
});
test("stopping an in-flight handoff discards the late code",async()=>{
  const f=fixture(),s=f.make();await s.start();
  let resume!:()=>void;f.setPause(new Promise<void>(r=>resume=r));
  const pending=s.erpDashboardUrl().catch(error=>error);
  await s.stop();resume();expect((await pending).message).toContain("cancelled");
});
test("a missing native endpoint asks for a server upgrade and never falls back to enrollment",async()=>{
  const upstream=Bun.serve({hostname:"127.0.0.1",port:0,fetch(){return Response.json({detail:"Not Found"},{status:404});}});
  const f=fixture(),client=new DirectNativeCloudClient();
  const s=f.make({accessClient:{request:(_url,path,signal,body)=>client.request("http://127.0.0.1:"+upstream.port,path,signal,body)}});
  try{await s.start();expect(s.state().native_access?.last_error).toContain("升级服务器");
    expect(f.config.managedLlmState().credentials).toHaveLength(0);
    expect(f.config.cloudConfiguration().managed).toBe(false);
  }finally{await s.stop();upstream.stop(true);}
});

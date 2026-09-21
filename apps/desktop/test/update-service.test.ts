import {expect,test} from "bun:test";
import {DesktopUpdateService,UpdateBusyError,updateDiagnostic,UPDATE_INTERVAL_MS,type LatestUpdate} from "../src/main/update-service";
import type {DesktopUpdateRelease} from "@lxe/desktop-protocol";
const release:DesktopUpdateRelease={version:"0.2.18",build_id:"one",file_name:"LXE-Agent-0.2.18-windows-x64.exe",size:3,sha512:"hash",notes:"notes"};
function fixture(){
 const calls:string[]=[];
 let latest:LatestUpdate={state:"available",release};
 let verificationFailure=false,cleanupFailure=false,busy=false,downloadFailures=0;
 const service=new DesktopUpdateService({
  supported:true,
  api:{latest:async()=>{calls.push("latest");return latest;},ticket:async()=>{calls.push("ticket");return {url:"https://private/file?signature=secret",expires_at:99999};}},
  installer:{download:async(_r,_u,progress)=>{calls.push("download");if(downloadFailures-->0)throw new Error("status 403");progress(42);return "cache.exe";},
   verify:async()=>{calls.push("verify");if(verificationFailure)throw new Error("SHA512 checksum mismatch");},
   install:()=>{calls.push("install");}},
  beginInstall:()=>{calls.push("fence");if(busy)throw new UpdateBusyError("Tasks running");return ()=>{calls.push("unlock");};},
  cleanup:async()=>{calls.push("cleanup");if(cleanupFailure)throw new Error("runtime did not exit");},
 });
 return {service,calls,pause:()=>{latest={state:"paused",release:null};},replace:()=>{latest={state:"available",release:{...release,build_id:"two"}};},
  bad:()=>{verificationFailure=true;},busy:()=>{busy=true;},cleanupFail:()=>{cleanupFailure=true;},downloadFail:(n:number)=>{downloadFailures=n;}};
}
test("half-hour polling and download never installs without explicit action",async()=>{
 const f=fixture();expect(UPDATE_INTERVAL_MS).toBe(1800000);
 expect((await f.service.check()).phase).toBe("ready");f.service.stop();
 expect(f.calls).toEqual(["latest","ticket","download","verify"]);
});
test("ready cached package avoids repeated tickets",async()=>{
 const f=fixture();await f.service.check();await f.service.check();
 expect(f.calls.filter(x=>x==="ticket")).toHaveLength(1);
});
test("installation rechecks release and checksum then fences before cleanup",async()=>{
 const f=fixture();await f.service.check();f.calls.length=0;
 await f.service.install();expect(f.calls).toEqual(["latest","verify","fence","cleanup","install"]);
});
test.each(["pause","replace"] as const)("withdrawn/replaced release cannot install: %s",async action=>{
 const f=fixture();await f.service.check();f[action]();expect((await f.service.install()).phase).toBe("error");
 expect(f.calls).not.toContain("fence");expect(f.calls).not.toContain("install");
});
test("busy tasks are not cancelled, and cleanup is not called",async()=>{
 const f=fixture();await f.service.check();f.busy();expect((await f.service.install()).phase).toBe("ready");
 expect(f.calls).not.toContain("cleanup");expect(f.calls).not.toContain("install");
});
test("cleanup failure releases fence and blocks installation",async()=>{
 const f=fixture();await f.service.check();f.cleanupFail();const s=await f.service.install();
 expect(s.message).toContain("runtime did not exit");expect(f.calls).toContain("unlock");expect(f.calls).not.toContain("install");
});
test("package corrupted after download is rejected before closing app",async()=>{
 const f=fixture();await f.service.check();f.bad();await f.service.install();
 expect(f.calls).not.toContain("cleanup");expect(f.calls).not.toContain("install");
});
test("expired URL gets one renewal, never unbounded retry",async()=>{
 const f=fixture();f.downloadFail(1);expect((await f.service.check()).phase).toBe("ready");
 expect(f.calls.filter(x=>x==="ticket")).toHaveLength(2);
 const g=fixture();g.downloadFail(20);expect((await g.service.check()).phase).toBe("error");
 expect(g.calls.filter(x=>x==="ticket")).toHaveLength(2);
});
test("concurrent checks share a single download",async()=>{
 const f=fixture();await Promise.all([f.service.check(),f.service.check()]);
 expect(f.calls.filter(x=>x==="download")).toHaveLength(1);
});

test("update diagnostics redact signed URLs and mark truncation",()=>{
 const message=updateDiagnostic(new Error("https://private/file?signature=secret "+"x".repeat(2100)));
 expect(message).not.toContain("signature");expect(message).toContain("[URL redacted]");expect(message).toEndWith(" [truncated]");
});

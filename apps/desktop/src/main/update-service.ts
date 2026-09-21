import type {DesktopUpdateRelease, DesktopUpdateState} from "@lxe/desktop-protocol";
export interface LatestUpdate {state:"available"|"up_to_date"|"no_release"|"paused";release:DesktopUpdateRelease|null}
export interface UpdateApi {
 latest():Promise<LatestUpdate>;
 ticket(release:DesktopUpdateRelease):Promise<{url:string;expires_at:number}>;
}
export interface UpdateInstaller {
 download(release:DesktopUpdateRelease,url:string,progress:(percent:number)=>void):Promise<string>;
 verify(file:string,release:DesktopUpdateRelease):Promise<void>;
 install():void;
}
export class UpdateBusyError extends Error { readonly code = "updates_busy"; }
export const UPDATE_INTERVAL_MS=30*60*1000;
export function sameRelease(a:DesktopUpdateRelease|undefined|null,b:DesktopUpdateRelease|undefined|null):boolean{
 return !!a&&!!b&&a.version===b.version&&a.build_id===b.build_id&&a.sha512===b.sha512&&a.size===b.size;
}
export function updateDiagnostic(error:unknown):string{
 return String(error instanceof Error?error.message:error).replace(/https?:\/\/[^\s"<>]+/g,"[URL redacted]").slice(0,2000);
}
export class DesktopUpdateService {
 private value:DesktopUpdateState={phase:"idle"};
 private operation:Promise<DesktopUpdateState>|undefined;
 private file:string|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private stopped=false;
 private installing=false;
 constructor(private options:{api:UpdateApi;installer:UpdateInstaller;supported:boolean;beginInstall:()=>()=>void;cleanup:()=>Promise<void>;configured?:()=>boolean;lastAttempt?:string;recordAttempt?:(release:DesktopUpdateRelease)=>void;recordError?:(error:unknown)=>void}){
  if(!options.supported)this.value={phase:"unsupported"};
 }
 state():DesktopUpdateState{return structuredClone({...this.value,...(this.options.lastAttempt?{lastAttempt:this.options.lastAttempt}:{})});}
 recordFailure(error:unknown):void{this.options.recordError?.(error);this.value={phase:"error",message:updateDiagnostic(error)};}
 start():void{
  if(this.value.phase==="unsupported")return;
  this.stopped=false;
  const tick=async()=>{
   if(this.stopped)return;
   if(this.options.configured?.()!==false)await this.check();
   if(!this.stopped)this.timer=setTimeout(tick,UPDATE_INTERVAL_MS+Math.floor(Math.random()*60_000));
  };
  this.timer=setTimeout(tick,5000+Math.floor(Math.random()*10_000));
  this.timer.unref?.();
 }
 stop():void{this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 check():Promise<DesktopUpdateState>{
  if(this.value.phase==="unsupported"||this.installing)return Promise.resolve(this.state());
  if(this.operation)return this.operation;
  this.operation=this.checkOnce().finally(()=>{this.operation=undefined;});
  return this.operation;
 }
 private async checkOnce():Promise<DesktopUpdateState>{
  const previous=this.value;
  try{
   this.value={phase:"checking",...(previous.release?{release:previous.release}:{})};
   const latest=await this.options.api.latest();
   if(latest.state!=="available"||!latest.release){
    this.file=undefined;
    this.value={phase:latest.state==="paused"?"paused":"idle",message:latest.state==="paused"?"更新发布已暂停":latest.state==="no_release"?"暂未发布更新":"已是最新版本"};
    return this.state();
   }
   const release=latest.release;
   if(previous.phase==="ready"&&this.file&&sameRelease(previous.release,release)){
    this.value={phase:"ready",release};return this.state();
   }
   this.file=undefined;
   this.value={phase:"downloading",release,percent:0};
   // One automatic ticket renewal/retry. Further attempts require the next check or user action.
   for(let attempt=0;attempt<2;attempt++){
    try{
     const ticket=await this.options.api.ticket(release);
     this.file=await this.options.installer.download(release,ticket.url,percent=>{
      this.value={phase:"downloading",release,...(Number.isFinite(percent)?{percent:Math.max(0,Math.min(100,percent))}:{})};
     });
     break;
    }catch(error){
     if(attempt||/429|403.*(device|business)|checksum|sha512|release_changed/i.test(updateDiagnostic(error)))throw error;
    }
   }
   if(!this.file)throw new Error("下载未返回安装包");
   this.value={phase:"verifying",release};
   await this.options.installer.verify(this.file,release);
   this.value={phase:"ready",release};
  }catch(error){this.value={phase:"error",message:updateDiagnostic(error)};}
  return this.state();
 }
 async install():Promise<DesktopUpdateState>{
  if(this.installing||this.operation)return this.state();
  if(this.value.phase!=="ready"||!this.value.release||!this.file)return this.state();
  this.installing=true;
  const release=this.value.release;
  let unlock:(()=>void)|undefined;
  try{
   this.value={phase:"installing",release};
   const latest=await this.options.api.latest();
   if(latest.state!=="available"||!sameRelease(latest.release,release))throw new Error("此更新已暂停或被替换，请重新检查更新");
   await this.options.installer.verify(this.file,release);
   // No await between the idle check and installing the scheduler's admission fence.
   unlock=this.options.beginInstall();
   this.options.recordAttempt?.(release);
   await this.options.cleanup();
   this.options.installer.install();
  }catch(error){
   unlock?.();
   this.options.recordError?.(error);
   this.value=error instanceof UpdateBusyError?{phase:"ready",release,message:updateDiagnostic(error)}:{phase:"error",message:updateDiagnostic(error)};
  }finally{this.installing=false;}
  return this.state();
 }
}

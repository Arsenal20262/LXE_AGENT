import {NsisUpdater} from "electron-updater";
import {Provider} from "electron-updater/out/providers/Provider";
import {downloadDifferential} from "./update-differential";
import {app,autoUpdater} from "electron";
import {launchUpdateInstaller} from "./update-launch";
import {join} from "node:path";
import type {DesktopUpdateIdentity,DesktopUpdateRelease} from "@lxe/desktop-protocol";
import type {LatestUpdate,UpdateApi,UpdateInstaller,UpdateTicket} from "./update-service";
import {sameIdentity,updateDiagnostic} from "./update-service";
import {parseUpdateArtifact,parseUpdateRelease,parseSignedArtifact,verifyUpdateFile} from "./update-artifacts";
import {UpdateHttpExecutor} from "./update-http-executor";
export {parseUpdateRelease} from "./update-artifacts";
export class DesktopUpdateApi implements UpdateApi{
 constructor(private server:()=>string,private version:string,private buildId?:string){}
 private async call(path:string,body?:unknown):Promise<any>{
  const base=new URL(this.server());
  if(base.protocol!=="http:"||base.hostname!=="10.88.0.1"||base.port!=="8000"||base.username||base.password)throw new Error("更新服务地址必须是已配置的公司 WireGuard 服务");
  const response=await fetch(new URL("/api/v1/desktop-updates/"+path,base),{
   method:body?"POST":"GET",headers:{"X-LXE-Client":"cli",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:"error",
  });
  const text=await response.text();
  if(text.length>131072)throw new Error("更新服务响应超过大小限制");
  let result:any;try{result=JSON.parse(text);}catch{throw new Error("更新服务返回非 JSON 响应："+response.status+" "+updateDiagnostic(text));}
  if(!response.ok)throw new Error("HTTP "+response.status+" "+updateDiagnostic(JSON.stringify(result.detail??result))+
   (response.headers.has("Retry-After")?"；请在 "+response.headers.get("Retry-After")+" 秒后重试":""));
  return result;
 }
 async latest():Promise<LatestUpdate>{
  const result=await this.call("latest?platform=windows-x64&current_version="+encodeURIComponent(this.version));
  if(!["available","up_to_date","paused","no_release"].includes(result.state))throw new Error("未知更新状态");
  return {state:result.state,release:result.release?parseUpdateRelease(result.release):null};
 }
 async ticket(release:DesktopUpdateRelease):Promise<UpdateTicket>{
  const base:DesktopUpdateIdentity|undefined=this.buildId?{version:this.version,build_id:this.buildId}:undefined;
  const result=await this.call("download",{version:release.version,build_id:release.build_id,platform:"windows-x64",
   ...(release.blockmap&&base?{include_blockmaps:true,base_release:base}:{})});
  const key=(r:DesktopUpdateIdentity,name:string)=>r.version+"/"+r.build_id+"/"+name;
  const ticket:UpdateTicket={...parseSignedArtifact(result,key(release,release.file_name))};
  if(result.differential_unavailable)ticket.differential_unavailable=updateDiagnostic(result.differential_unavailable);
  if(result.differential){
   const d=result.differential,old=parseUpdateRelease(d.base_release);
   if(!base||!sameIdentity(old,base)||!release.blockmap)throw new Error("差分基础版本与本机不匹配");
   const oldMap=parseUpdateArtifact(d.old_blockmap,old.file_name+".blockmap",16*1024**2);
   const newMap=parseUpdateArtifact(d.new_blockmap,release.blockmap.file_name,16*1024**2);
   if(newMap.size!==release.blockmap.size||newMap.sha512!==release.blockmap.sha512)throw new Error("差分目标元数据发生变化");
   ticket.differential={base_release:old,
    old_blockmap:{...oldMap,...parseSignedArtifact(d.old_blockmap,key(old,oldMap.file_name))},
    new_blockmap:{...newMap,...parseSignedArtifact(d.new_blockmap,key(release,newMap.file_name))}};
  }
  return ticket;
 }
}
export class PrivateNsisUpdater extends NsisUpdater {
 ticket:UpdateTicket|undefined;
 private readonly transport:UpdateHttpExecutor;
 constructor(private diagnostic:(message:string)=>void){
  super();
  this.transport=new UpdateHttpExecutor((info,callback)=>this.emit("login",info,callback));
  Object.defineProperty(this,"httpExecutor",{value:this.transport});
  this.autoDownload=false;this.autoInstallOnAppQuit=false;
  this.disableDifferentialDownload=false;this.disableWebInstaller=true;this.allowDowngrade=false;
  this.logger=null;
 }
 protected override async differentialDownloadInstaller(fileInfo:any,options:any,destination:string,_provider:any,oldName:string):Promise<boolean> {
  if(!this.ticket||!this.downloadedUpdateHelper)return true;
  return downloadDifferential({ticket:this.ticket,oldFile:join(this.downloadedUpdateHelper.cacheDir,oldName),
   newFile:destination,newUrl:fileInfo.url,info:fileInfo.info,transport:this.transport,
   headers:options.requestHeaders,cancellationToken:options.cancellationToken,
   diagnostic:this.diagnostic,progress:value=>this.emit("download-progress",value)});
 }

 async launchInstaller():Promise<void> {
  const file=this.installerPath;
  if(!file||!this.downloadedUpdateHelper?.downloadedFileInfo)throw new Error("No verified installer available");
  const args=["--updated","/S","--force-run",`/D=${app.getAppPath().replace(/[\\/]resources[\\/]app\.asar$/,"")}`];
  const elevated=()=>launchUpdateInstaller(file,args,true);
  if(this.downloadedUpdateHelper.downloadedFileInfo.isAdminRightsRequired)await elevated();
  else try{await launchUpdateInstaller(file,args);}catch(error){
   if(["EACCES","UNKNOWN"].includes((error as NodeJS.ErrnoException).code??""))await elevated();else throw error;
  }
  // Upstream quitAndInstall quits before asynchronous spawn failures are known.
  // Preserve its installer arguments/events, but only quit after confirmed spawn.
  this.quitAndInstallCalled=true;
  autoUpdater.emit("before-quit-for-update");app.quit();
 }
}
export class ElectronUpdateInstaller implements UpdateInstaller {
 private readonly updater:PrivateNsisUpdater;
 constructor(onError:(error:unknown)=>void=()=>{},diagnostic:(message:string)=>void=()=>{}){
  this.updater=new PrivateNsisUpdater(diagnostic);
  this.updater.on("error",onError);
 }
 async download(release:DesktopUpdateRelease,ticket:UpdateTicket,progress:(percent:number)=>void):Promise<string>{
  this.updater.ticket=ticket;
  class PrivateProvider extends Provider<any> {
   constructor(_options:any,_updater:any,runtime:any){super(runtime);}
   async getLatestVersion(){return {version:release.version,files:[{url:release.file_name,size:release.size,sha512:release.sha512}]};}
   resolveFiles(info:any){return [{url:new URL(ticket.url),info:info.files[0]}];}
  }
  this.updater.setFeedURL({provider:"custom",updateProvider:PrivateProvider});
  const listener=(p:any)=>progress(p.percent);
  this.updater.on("download-progress",listener);
  try{
   await this.updater.checkForUpdates();const files=await this.updater.downloadUpdate();
   if(!files?.[0])throw new Error("安装包未下载");return files[0];
  }catch(error){
   if((error as any)?.statusCode===403){
    const expired=new Error(updateDiagnostic(error));expired.name="UpdateTicketExpiredError";throw expired;
   }
   throw error;
  }finally{this.updater.removeListener("download-progress",listener);}
 }
 verify=verifyUpdateFile;
 install():Promise<void>{return this.updater.launchInstaller();}
}

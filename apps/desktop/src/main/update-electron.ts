import {NsisUpdater} from "electron-updater";
import {Provider} from "electron-updater/out/providers/Provider";
import {createHash} from "node:crypto";
import {createReadStream,statSync} from "node:fs";
import type {DesktopUpdateRelease} from "@lxe/desktop-protocol";
import type {LatestUpdate,UpdateApi,UpdateInstaller} from "./update-service";
import {updateDiagnostic} from "./update-service";
const COS_HOST="lxe-agent-updates-1317107914.cos.ap-guangzhou.myqcloud.com";

export function parseUpdateRelease(value:any):DesktopUpdateRelease {
 if(!value||typeof value.version!=="string"||typeof value.build_id!=="string"||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)
  ||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.build_id)||typeof value.notes!=="string"||value.notes.length>32768
  ||value.file_name!=="LXE-Agent-"+value.version+"-windows-x64.exe"
  ||!Number.isSafeInteger(value.size)||value.size<=0||value.size>16*1024**3
  ||typeof value.sha512!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(value.sha512))throw new Error("服务器返回的更新记录无效");
 return {version:value.version,build_id:value.build_id,notes:value.notes,file_name:value.file_name,size:value.size,sha512:value.sha512};
}
export class DesktopUpdateApi implements UpdateApi{
 constructor(private server:()=>string,private version:string){}
 private async call(path:string,body?:unknown):Promise<any>{
  const base=new URL(this.server());
  // This API is authenticated by the existing trusted WireGuard listener, not a renderer URL.
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
 async ticket(release:DesktopUpdateRelease){
  const result=await this.call("download",{version:release.version,build_id:release.build_id,platform:"windows-x64"});
  const url=new URL(result.url);
  if(url.protocol!=="https:"||url.hostname!==COS_HOST||url.port||url.username||url.password
   ||decodeURIComponent(url.pathname)!="/artifacts/"+release.version+"/"+release.build_id+"/"+release.file_name
   ||!Number.isSafeInteger(result.expires_at)||result.expires_at<=Date.now()/1000)throw new Error("下载链接或有效期无效");
  return {url:url.toString(),expires_at:result.expires_at as number};
 }
}
export class ElectronUpdateInstaller implements UpdateInstaller {
 private updater:any;
 constructor(onError:(error:unknown)=>void=()=>{}){
  this.updater=new NsisUpdater();
  this.updater.autoDownload=false;this.updater.autoInstallOnAppQuit=false;
  this.updater.disableDifferentialDownload=true;this.updater.disableWebInstaller=true;
  this.updater.allowDowngrade=false;
  this.updater.logger=null;
  // Download promises carry the real errors to the application; never log signed URLs.
  this.updater.on("error",onError);
 }
 async download(release:DesktopUpdateRelease,url:string,progress:(percent:number)=>void):Promise<string>{
  class PrivateProvider extends Provider<any> {
   constructor(_options:any,_updater:any,runtime:any){super(runtime);}
   async getLatestVersion(){return {version:release.version,files:[{url:release.file_name,size:release.size,sha512:release.sha512}]};}
   resolveFiles(info:any){return [{url:new URL(url),info:info.files[0]}];}
  }
  this.updater.setFeedURL({provider:"custom",updateProvider:PrivateProvider});
  const listener=(p:any)=>progress(p.percent);
  this.updater.on("download-progress",listener);
  try{await this.updater.checkForUpdates();const files=await this.updater.downloadUpdate();if(!files?.[0])throw new Error("安装包未下载");return files[0];}
  finally{this.updater.removeListener("download-progress",listener);}
 }
 async verify(file:string,release:DesktopUpdateRelease):Promise<void>{
  if(statSync(file).size!==release.size)throw new Error("安装包大小校验失败");
  const hash=createHash("sha512");
  for await(const part of createReadStream(file))hash.update(part);
  if(hash.digest("base64")!==release.sha512)throw new Error("安装包 SHA-512 校验失败");
 }
 install():void{this.updater.quitAndInstall(true,true);}
}

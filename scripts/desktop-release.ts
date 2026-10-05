import {randomUUID} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,rmSync,statSync} from "node:fs";
import {join,resolve,basename} from "node:path";
import {execFileSync} from "node:child_process";
import COS from "cos-nodejs-sdk-v5";

import {VERSION,sha512,verifyCandidate,writeJsonAtomic} from "./release-candidate";
import {cleanupCandidates,lockCandidateFiles,recordPublished} from "./release-retention";
export {VERSION,sha512} from "./release-candidate";
export function compareVersions(a:string,b:string):number{
 if(!VERSION.test(a)||!VERSION.test(b))throw new Error("Invalid version");
 const x=a.split(".").map(Number),y=b.split(".").map(Number);
 for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]!<y[i]!?-1:1;
 return 0;
}
const root=resolve(import.meta.dir,".."),intentPath=join(root,"config","desktop-release.json");
const json=(path:string)=>JSON.parse(readFileSync(path,"utf8"));
const write=(path:string,value:unknown)=>writeFileSync(path,JSON.stringify(value,null,2)+"\n",{flag:"wx"});
const git=(...args:string[])=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const bucket="lxe-agent-updates-1317107914",region="ap-guangzhou",channelKey="channels/stable/windows-x64.json";
export async function main(args=process.argv.slice(2),ports?:{cos:unknown;lockRoot:string}):Promise<void>{
 const [action,arg]=args;
 if(action==="select"){
  const intent=json(intentPath);
  if(!VERSION.test(intent.version)||!intent.notes?.trim())throw new Error("Prepare config/desktop-release.json with version and notes");
  if(git("status","--porcelain"))throw new Error("Commit source and release notes before candidate build");
  mkdirSync(join(root,"build"),{recursive:true});
  const build_id=new Date().toISOString().replace(/[-:.]/g,"")+"-"+randomUUID().slice(0,8);
  writeFileSync(join(root,"build","desktop-version-selection.json"),JSON.stringify({schema_version:1,selected_version:intent.version,source_commit:git("rev-parse","HEAD"),build_id}));
  console.log("Candidate version: "+intent.version);return;
 }
 if(action==="candidate"){
  const intent=json(intentPath),selected=json(join(root,"build","desktop-version-selection.json"));
  if(intent.version!==selected.selected_version||git("status","--porcelain")||git("rev-parse","HEAD")!==selected.source_commit)throw new Error("Source or intent changed during build");
  const build_id=selected.build_id;
  if(typeof build_id!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(build_id))throw new Error("Build identity missing; run select before packaging");
  const file_name="LXE-Agent-"+intent.version+"-windows-x64.exe";
  const from=join(root,"dist","desktop",file_name);
  if(!existsSync(from)||!existsSync(from+".blockmap"))throw new Error("Installer or blockmap missing: "+from);
  const dir=join(root,"dist","desktop-candidates",build_id);mkdirSync(dir,{recursive:true});
  const artifact=join(dir,file_name);copyFileSync(from,artifact);
  copyFileSync(from+".blockmap",artifact+".blockmap");
  write(join(dir,"candidate.json"),{schema_version:1,version:intent.version,build_id,source_commit:selected.source_commit,
   built_at:new Date().toISOString(),platform:"windows-x64",file_name,object_key:"artifacts/"+intent.version+"/"+build_id+"/"+file_name,
   size:statSync(artifact).size,sha512:await sha512(artifact),notes:intent.notes,
   blockmap:{file_name:file_name+".blockmap",object_key:"artifacts/"+intent.version+"/"+build_id+"/"+file_name+".blockmap",
    size:statSync(artifact+".blockmap").size,sha512:await sha512(artifact+".blockmap")}});
  if(process.env.LXE_RELEASE_CANDIDATE_RESULT)writeJsonAtomic(process.env.LXE_RELEASE_CANDIDATE_RESULT,{candidate:join("dist","desktop-candidates",build_id,"candidate.json")});
  console.log("Candidate saved: "+join(dir,"candidate.json"));
  if(!process.env.LXE_RELEASE_CANDIDATE_RESULT)cleanupCandidates(resolve(dir,".."),build_id);
  return;
 }
 if(action!=="publish"&&action!=="pause")throw new Error("Use select, candidate, publish <candidate.json>, or pause");
 const lock=join(ports?.lockRoot||process.env.LOCALAPPDATA||root,"LXE","release","publish.lock");mkdirSync(resolve(lock,".."),{recursive:true});
 try{mkdirSync(lock);}catch{throw new Error("Publisher locked: "+lock);}
 let unlockCandidate:(()=>void)|undefined;
 let publishedLocal:{directory:string;build_id:string}|undefined;
 try{
  if(!ports)console.log("Reading publisher credentials...");
  const credentials=ports?null:JSON.parse((await Bun.stdin.text()).replace(/^\uFEFF/,""));
  const cos=ports?.cos??new COS({SecretId:credentials.secretId,SecretKey:credentials.secretKey});
  const call=(method:string,extra:any):Promise<any>=>new Promise((ok,fail)=>(cos as any)[method]({Bucket:bucket,Region:region,...extra},(e:any,v:any)=>e?fail(e):ok(v)));
  const get=async(Key:string)=>{try{return JSON.parse(String((await call("getObject",{Key})).Body));}catch(e:any){if(e.statusCode===404)return null;throw e;}};
  const put=async(Key:string,value:unknown)=>call("putObject",{Key,Body:JSON.stringify(value),ContentType:"application/json",CacheControl:"no-store"});
  console.log("Checking current update channel...");
  const before=await get(channelKey);
  if(action==="pause"){if(!before)throw new Error("No channel published");await put(channelKey,{...before,paused:true});console.log("Stable channel paused");return;}
  if(!arg||basename(arg)!=="candidate.json")throw new Error("Pass selected candidate.json");
  const candidatePath=resolve(arg),dir=resolve(candidatePath,"..");
  unlockCandidate=lockCandidateFiles(resolve(dir,".."));
  const record=await verifyCandidate(candidatePath);
  console.log("Verified candidate "+record.version+" / "+record.build_id+"...");
  if(before?.release){
   const order=compareVersions(record.version,before.release.version);
   if(order<0)throw new Error("Refusing channel downgrade");
   if(order===0&&record.build_id!==before.release.build_id)throw new Error("Published version is frozen to another build");
  }
  const publication=join(dir,"publication.json");
  if(!existsSync(publication))write(publication,{...record,published_at:new Date().toISOString()});
  const release=json(publication);
  if(JSON.stringify({...release,published_at:undefined})!==JSON.stringify({...record,published_at:undefined}))throw new Error("Candidate differs from publication");
  const manifestKey="releases/"+record.version+"/"+record.build_id+"/release.json",existing=await get(manifestKey);
  if(existing&&JSON.stringify(existing)!==JSON.stringify(release))throw new Error("Version frozen to another build");
  for(const artifact of [record,...(record.blockmap?[record.blockmap]:[])]){
  const file=join(dir,artifact.file_name);
  let head:any;try{head=await call("headObject",{Key:artifact.object_key});}catch(e:any){if(e.statusCode!==404)throw e;}
  if(!head){
   console.log("Uploading "+artifact.file_name+" ("+(artifact.size/1024/1024).toFixed(2)+" MiB)...");
   let lastPercent=-1;
   await call("uploadFile",{Key:artifact.object_key,FilePath:file,Headers:{"x-cos-meta-sha512":artifact.sha512},
    onProgress:({percent}:{percent:number})=>{
     if(!Number.isFinite(percent))return;
     const value=Math.floor(Math.max(0,Math.min(1,percent))*100);
     if(value!==lastPercent){lastPercent=value;console.log("Upload progress: "+value+"%");}
    }});
  }else console.log("Installer already exists; verifying uploaded metadata...");
  head=await call("headObject",{Key:artifact.object_key});
  if(Number(head.headers["content-length"])!==artifact.size||head.headers["x-cos-meta-sha512"]!==artifact.sha512)throw new Error("Uploaded artifact metadata mismatch: "+artifact.file_name);
  }
  console.log("Saving release record...");
  if(!existing)await put(manifestKey,release);
  if(JSON.stringify(await get(channelKey))!==JSON.stringify(before))throw new Error("Channel changed; review and retry");
  console.log("Activating stable update channel...");
  await put(channelKey,{schema_version:1,paused:false,release:{version:record.version,build_id:record.build_id}});
  try{
   recordPublished(resolve(dir,".."),record);
   publishedLocal={directory:resolve(dir,".."),build_id:record.build_id};
  }catch(error){console.warn("Published remotely, but local success recording failed; cleanup skipped: "+String(error));}
  console.log("Published "+record.version+" / "+record.build_id);
 }finally{
  try{unlockCandidate?.();}finally{rmSync(lock,{recursive:true});}
 }
 if(publishedLocal)cleanupCandidates(publishedLocal.directory,publishedLocal.build_id);
}
// Keep the CLI alive while Windows PowerShell is delivering piped credentials.
if(import.meta.main)await main().catch(error=>{
 const message=String(error?.error?.Message||error?.message||error).replace(/https?:\/\/\S+/g,"[URL redacted]");
 console.error(JSON.stringify({message:message.slice(0,1500)+(message.length>1500?" [truncated]":""),code:error?.error?.Code,status:error?.statusCode}));
 process.exitCode=1;
});

import {createHash,randomUUID} from "node:crypto";
import {createReadStream,copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,rmSync,statSync} from "node:fs";
import {join,resolve,basename} from "node:path";
import {execFileSync} from "node:child_process";
import COS from "cos-nodejs-sdk-v5";

export const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function compareVersions(a:string,b:string):number{
 if(!VERSION.test(a)||!VERSION.test(b))throw new Error("Invalid version");
 const x=a.split(".").map(Number),y=b.split(".").map(Number);
 for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]!<y[i]!?-1:1;
 return 0;
}
export async function sha512(file:string):Promise<string>{
 const hash=createHash("sha512");for await(const part of createReadStream(file))hash.update(part);return hash.digest("base64");
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
  writeFileSync(join(root,"build","desktop-version-selection.json"),JSON.stringify({schema_version:1,selected_version:intent.version,source_commit:git("rev-parse","HEAD")}));
  console.log("Candidate version: "+intent.version);return;
 }
 if(action==="candidate"){
  const intent=json(intentPath),selected=json(join(root,"build","desktop-version-selection.json"));
  if(intent.version!==selected.selected_version||git("status","--porcelain")||git("rev-parse","HEAD")!==selected.source_commit)throw new Error("Source or intent changed during build");
  const build_id=new Date().toISOString().replace(/[-:.]/g,"")+"-"+randomUUID().slice(0,8);
  const file_name="LXE-Agent-"+intent.version+"-windows-x64.exe";
  const from=join(root,"dist","desktop",file_name);
  if(!existsSync(from))throw new Error("Installer missing: "+from);
  const dir=join(root,"dist","desktop-candidates",build_id);mkdirSync(dir,{recursive:true});
  const artifact=join(dir,file_name);copyFileSync(from,artifact);
  write(join(dir,"candidate.json"),{schema_version:1,version:intent.version,build_id,source_commit:selected.source_commit,
   built_at:new Date().toISOString(),platform:"windows-x64",file_name,object_key:"artifacts/"+intent.version+"/"+build_id+"/"+file_name,
   size:statSync(artifact).size,sha512:await sha512(artifact),notes:intent.notes});
  console.log("Candidate saved: "+join(dir,"candidate.json"));return;
 }
 if(action!=="publish"&&action!=="pause")throw new Error("Use select, candidate, publish <candidate.json>, or pause");
 const lock=join(ports?.lockRoot||process.env.LOCALAPPDATA||root,"LXE","release","publish.lock");mkdirSync(resolve(lock,".."),{recursive:true});
 try{mkdirSync(lock);}catch{throw new Error("Publisher locked: "+lock);}
 try{
  const credentials=ports?null:JSON.parse((await Bun.stdin.text()).replace(/^\uFEFF/,""));
  const cos=ports?.cos??new COS({SecretId:credentials.secretId,SecretKey:credentials.secretKey});
  const call=(method:string,extra:any):Promise<any>=>new Promise((ok,fail)=>(cos as any)[method]({Bucket:bucket,Region:region,...extra},(e:any,v:any)=>e?fail(e):ok(v)));
  const get=async(Key:string)=>{try{return JSON.parse(String((await call("getObject",{Key})).Body));}catch(e:any){if(e.statusCode===404)return null;throw e;}};
  const put=async(Key:string,value:unknown)=>call("putObject",{Key,Body:JSON.stringify(value),ContentType:"application/json",CacheControl:"no-store"});
  const before=await get(channelKey);
  if(action==="pause"){if(!before)throw new Error("No channel published");await put(channelKey,{...before,paused:true});console.log("Stable channel paused");return;}
  if(!arg||basename(arg)!=="candidate.json")throw new Error("Pass selected candidate.json");
  const candidatePath=resolve(arg),record=json(candidatePath),dir=resolve(candidatePath,"..");
  if(!VERSION.test(record.version)||record.platform!=="windows-x64"||!/^[a-f0-9]{40}$/.test(record.source_commit)||!/^[a-zA-Z0-9_-]{1,100}$/.test(record.build_id))throw new Error("Invalid candidate identity");
  const file_name="LXE-Agent-"+record.version+"-windows-x64.exe";
  if(record.file_name!==file_name||record.object_key!=="artifacts/"+record.version+"/"+record.build_id+"/"+file_name)throw new Error("Invalid candidate path");
  const file=join(dir,file_name);
  if(await sha512(file)!==record.sha512||statSync(file).size!==record.size)throw new Error("Candidate installer changed");
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
  let head:any;try{head=await call("headObject",{Key:record.object_key});}catch(e:any){if(e.statusCode!==404)throw e;}
  if(!head)await call("uploadFile",{Key:record.object_key,FilePath:file,Headers:{"x-cos-meta-sha512":record.sha512}});
  head=await call("headObject",{Key:record.object_key});
  if(Number(head.headers["content-length"])!==record.size||head.headers["x-cos-meta-sha512"]!==record.sha512)throw new Error("Uploaded installer metadata mismatch");
  if(!existing)await put(manifestKey,release);
  if(JSON.stringify(await get(channelKey))!==JSON.stringify(before))throw new Error("Channel changed; review and retry");
  await put(channelKey,{schema_version:1,paused:false,release:{version:record.version,build_id:record.build_id}});
  console.log("Published "+record.version+" / "+record.build_id);
 }finally{rmSync(lock,{recursive:true});}
}
if(import.meta.main)main().catch(error=>{
 console.error(JSON.stringify({message:String(error?.error?.Message||error?.message||error).replace(/https?:\/\/\S+/g,"[URL redacted]").slice(0,1500),code:error?.error?.Code,status:error?.statusCode}));
 process.exitCode=1;
});

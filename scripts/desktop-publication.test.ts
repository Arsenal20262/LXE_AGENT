import {expect,test} from "bun:test";
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {main,sha512} from "./desktop-release";
import {lockCandidateFiles} from "./release-retention";
const CHANNEL="channels/stable/windows-x64.json";
class FakeCos {
 objects=new Map<string,string>();
 hashes=new Map<string,string>();
 failChannel=false;
 uploaded=0;
 getObject(p:any,cb:any){
  if(!this.objects.has(p.Key))return cb({statusCode:404});
  if(p.Output){p.Output.on("error",cb);p.Output.end(this.objects.get(p.Key),()=>cb(null,{}));}
  else cb(null,{Body:this.objects.get(p.Key)});
 }
 headObject(p:any,cb:any){this.objects.has(p.Key)?cb(null,{headers:{"content-length":Buffer.byteLength(this.objects.get(p.Key)!),"x-cos-meta-sha512":this.hashes.get(p.Key)}}):cb({statusCode:404});}
 uploadFile(p:any,cb:any){this.uploaded++;this.objects.set(p.Key,readFileSync(p.FilePath,"utf8"));this.hashes.set(p.Key,p.Headers["x-cos-meta-sha512"]);cb(null,{});}
 putObject(p:any,cb:any){if(this.failChannel&&p.Key===CHANNEL)return cb(new Error("channel write interrupted"));this.objects.set(p.Key,p.Body);cb(null,{});}
}
async function candidate(root:string,build:string,version="0.2.17"){
 const dir=join(root,build);mkdirSync(dir);
 const file_name="LXE-Agent-"+version+"-windows-x64.exe",file=join(dir,file_name);writeFileSync(file,"installer "+build);
 const record={schema_version:1,version,build_id:build,source_commit:"a".repeat(40),built_at:"2026-09-21",platform:"windows-x64",file_name,
  object_key:"artifacts/"+version+"/"+build+"/"+file_name,size:readFileSync(file).length,sha512:await sha512(file),notes:"notes"};
 const path=join(dir,"candidate.json");writeFileSync(path,JSON.stringify(record));return path;
}
test("channel is the final commit; interrupted publication retries without rebuilding or reuploading",async()=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-publication-"));const cos=new FakeCos(),ports={cos,lockRoot:root};
 try{const path=await candidate(root,"one");cos.failChannel=true;
 await expect(main(["publish",path],ports)).rejects.toThrow("interrupted");
 expect(existsSync(join(root,"one","publication.json"))).toBe(true);
 expect(existsSync(join(root,"last-published.json"))).toBe(false);
 expect(cos.objects.has(CHANNEL)).toBe(false);expect(cos.uploaded).toBe(1);
 cos.failChannel=false;await main(["publish",path],ports);expect(cos.uploaded).toBe(1);
 expect(JSON.parse(readFileSync(join(root,"last-published.json"),"utf8")).build_id).toBe("one");
 expect(JSON.parse(cos.objects.get(CHANNEL)!).release.build_id).toBe("one");
 await main(["publish",path],ports);expect(cos.uploaded).toBe(1);
 }finally{rmSync(root,{recursive:true});}
});
test("only successful publication triggers local pruning and rotates the protected published candidate",async()=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-publication-"));const cos=new FakeCos(),ports={cos,lockRoot:root};
 const file=(id:string)=>join(root,id,"LXE-Agent-0.2.17-windows-x64.exe");
 try{
 const first=await candidate(root,"build-0");await main(["publish",first],ports);
 for(let n=1;n<6;n++)await candidate(root,`build-${n}`,n===5?"0.2.18":"0.2.17");
 const next=join(root,"build-5","candidate.json");cos.failChannel=true;
 await expect(main(["publish",next],ports)).rejects.toThrow("interrupted");
 expect(existsSync(file("build-0"))).toBe(true);expect(existsSync(file("build-1"))).toBe(true);
 expect(JSON.parse(readFileSync(join(root,"last-published.json"),"utf8")).build_id).toBe("build-0");
 cos.failChannel=false;await main(["publish",next],ports);
 expect(existsSync(file("build-0"))).toBe(false);expect(existsSync(file("build-1"))).toBe(false);
 expect(existsSync(file("build-3"))).toBe(true);
 expect(existsSync(join(root,"build-0","candidate.json"))).toBe(true);
 expect(existsSync(join(root,"build-0","publication.json"))).toBe(true);
 }finally{rmSync(root,{recursive:true});}
});
test("publisher respects the local installer lock before uploading",async()=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-publication-"));const cos=new FakeCos();
 try{const path=await candidate(root,"one"),unlock=lockCandidateFiles(root);
 await expect(main(["publish",path],{cos,lockRoot:root})).rejects.toThrow("locked");
 expect(cos.uploaded).toBe(0);unlock();
 }finally{rmSync(root,{recursive:true});}
});
test("unpublished version may be rebuilt, published version is frozen, pause preserves high water mark",async()=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-publication-"));const cos=new FakeCos(),ports={cos,lockRoot:root};
 try{const a=await candidate(root,"one"),b=await candidate(root,"two");cos.failChannel=true;
 await expect(main(["publish",a],ports)).rejects.toThrow();cos.failChannel=false;
 await main(["publish",b],ports);
 await expect(main(["publish",a],ports)).rejects.toThrow("frozen");
 await main(["pause"],ports);expect(JSON.parse(cos.objects.get(CHANNEL)!).paused).toBe(true);
 await main(["publish",b],ports);expect(JSON.parse(cos.objects.get(CHANNEL)!).paused).toBe(false);
 const old=await candidate(root,"old","0.2.16");
 await expect(main(["publish",old],ports)).rejects.toThrow("downgrade");
 }finally{rmSync(root,{recursive:true});}
});
test("tampered candidate is rejected before upload",async()=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-publication-"));const cos=new FakeCos();
 try{const path=await candidate(root,"one");writeFileSync(join(root,"one","LXE-Agent-0.2.17-windows-x64.exe"),"bad");
 await expect(main(["publish",path],{cos,lockRoot:root})).rejects.toThrow("changed");
 expect(cos.uploaded).toBe(0);
 }finally{rmSync(root,{recursive:true});}
});

test("blockmap is verified and uploaded before activating channel; tampering blocks all uploads",async()=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-blockmap-publication-")),cos=new FakeCos();
 try{
  const path=await candidate(root,"diff"),record=JSON.parse(readFileSync(path,"utf8"));
  const file=join(root,"diff",record.file_name+".blockmap");writeFileSync(file,"blockmap");
  record.blockmap={file_name:record.file_name+".blockmap",object_key:record.object_key+".blockmap",size:8,sha512:await sha512(file)};
  writeFileSync(path,JSON.stringify(record));writeFileSync(file,"tampered");
  await expect(main(["publish",path],{cos,lockRoot:root})).rejects.toThrow("changed");expect(cos.uploaded).toBe(0);
  writeFileSync(file,"blockmap");await main(["publish",path],{cos,lockRoot:root});
  expect(cos.uploaded).toBe(2);expect(cos.objects.has(record.blockmap.object_key)).toBe(true);
  expect(JSON.parse(cos.objects.get(`releases/${record.version}/${record.build_id}/release.json`)!).blockmap).toEqual(record.blockmap);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test.each(["missing","tampered"])("remote blockmap %s prevents channel activation",async failure=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-remote-blockmap-")),cos=new FakeCos();
 try{
  const path=await candidate(root,"diff"),record=JSON.parse(readFileSync(path,"utf8"));
  const file=join(root,"diff",record.file_name+".blockmap");writeFileSync(file,"blockmap");
  record.blockmap={file_name:record.file_name+".blockmap",object_key:record.object_key+".blockmap",size:8,sha512:await sha512(file)};writeFileSync(path,JSON.stringify(record));
  const upload=cos.uploadFile.bind(cos);
  cos.uploadFile=(request,callback)=>upload(request,()=>{
   if(request.Key===record.blockmap.object_key){
    if(failure==="missing")cos.objects.delete(request.Key);else cos.hashes.set(request.Key,"changed");
   }
   callback(null,{});
  });
  await expect(main(["publish",path],{cos,lockRoot:root})).rejects.toThrow();
  expect(cos.objects.has(CHANNEL)).toBe(false);expect(existsSync(join(root,"last-published.json"))).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test.each(["installer","blockmap"])("same-size remote %s corruption with unchanged metadata prevents activation",async target=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-remote-content-")),cos=new FakeCos();
 try{
  const path=await candidate(root,"diff"),record=JSON.parse(readFileSync(path,"utf8"));
  const file=join(root,"diff",record.file_name+".blockmap");writeFileSync(file,"blockmap");
  record.blockmap={file_name:record.file_name+".blockmap",object_key:record.object_key+".blockmap",size:8,sha512:await sha512(file)};
  writeFileSync(path,JSON.stringify(record));
  const key=target==="installer"?record.object_key:record.blockmap.object_key;
  const upload=cos.uploadFile.bind(cos);
  cos.uploadFile=(request,callback)=>upload(request,()=>{
   if(request.Key===key)cos.objects.set(key,"x".repeat(cos.objects.get(key)!.length));
   callback(null,{});
  });
  await expect(main(["publish",path],{cos,lockRoot:root})).rejects.toThrow("content mismatch");
  expect(cos.objects.has(CHANNEL)).toBe(false);
  expect(cos.objects.has(`releases/${record.version}/${record.build_id}/release.json`)).toBe(false);
  expect(existsSync(join(root,"last-published.json"))).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("interrupted remote verification preserves the original error and never activates",async()=>{
 const root=mkdtempSync(join(tmpdir(),"lxe-remote-read-")),cos=new FakeCos();
 try{
  const path=await candidate(root,"one"),get=cos.getObject.bind(cos);
  cos.getObject=(request,callback)=>{
   if(!request.Output)return get(request,callback);
   request.Output.write("partial");
   request.Output.destroy(new Error("fixture connection reset"));
   callback(new Error("fixture connection reset"));
  };
  await expect(main(["publish",path],{cos,lockRoot:root})).rejects.toThrow("fixture connection reset");
  expect(cos.objects.has(CHANNEL)).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

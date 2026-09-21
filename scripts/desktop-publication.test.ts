import {expect,test} from "bun:test";
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {main,sha512} from "./desktop-release";
const CHANNEL="channels/stable/windows-x64.json";
class FakeCos {
 objects=new Map<string,string>();
 hashes=new Map<string,string>();
 failChannel=false;
 uploaded=0;
 getObject(p:any,cb:any){this.objects.has(p.Key)?cb(null,{Body:this.objects.get(p.Key)}):cb({statusCode:404});}
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
 expect(cos.objects.has(CHANNEL)).toBe(false);expect(cos.uploaded).toBe(1);
 cos.failChannel=false;await main(["publish",path],ports);expect(cos.uploaded).toBe(1);
 expect(JSON.parse(cos.objects.get(CHANNEL)!).release.build_id).toBe("one");
 await main(["publish",path],ports);expect(cos.uploaded).toBe(1);
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

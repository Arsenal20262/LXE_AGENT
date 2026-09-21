import {expect,test} from "bun:test";
import {compareVersions,sha512} from "./desktop-release";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
test("release comparison uses numeric segments",()=>{
 expect(compareVersions("0.2.10","0.2.9")).toBe(1);
 expect(compareVersions("0.2.17","0.2.17")).toBe(0);
 expect(()=>compareVersions("0.2.017","0.2.17")).toThrow();
});
test("artifact hashing is interoperable base64 SHA512",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"lxe-release-"));
 try{const path=join(dir,"package.exe");writeFileSync(path,"installer");
 expect(await sha512(path)).toBe(createHash("sha512").update("installer").digest("base64"));}
 finally{rmSync(dir,{recursive:true});}
});

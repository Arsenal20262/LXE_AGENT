import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';
const require=createRequire(import.meta.url);
test('workspace application menus and native IPC in real Electron',async()=>{
 const output=mkdtempSync(resolve(tmpdir(),'lxe-open-app-renderer-')),profile=mkdtempSync(resolve(tmpdir(),'lxe-open-app-profile-'));
 try{
  await build({root:resolve(import.meta.dirname,'../../..'),logLevel:'error',build:{outDir:output,emptyOutDir:true,target:'es2022',minify:false,rollupOptions:{input:resolve(import.meta.dirname,'renderer.html')}}});
  for(const name of ['host','preload']){const result=await Bun.build({entrypoints:[resolve(import.meta.dirname,name+'.ts')],outdir:resolve(output,'main'),naming:'[name].cjs',target:'node',format:'cjs',external:['electron']});if(!result.success)throw new Error(result.logs.map(String).join('\n'));}
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=Bun.spawn([require(resolve(import.meta.dirname,'../../../../desktop/node_modules/electron')),resolve(import.meta.dirname,'runner.cjs'),profile,output],{env,stdout:'pipe',stderr:'pipe'});
  const timer=setTimeout(()=>child.kill(),90000);
  try{
   const readOutput=async()=>{let value='';for await(const chunk of child.stdout){const text=new TextDecoder().decode(chunk);value+=text;process.stdout.write(text);}return value;};
   const [code,stdout,stderr]=await Promise.all([child.exited,readOutput(),new Response(child.stderr).text()]);
   expect(code,stdout+'\n'+stderr).toBe(0);const line=stdout.split('\n').find(l=>l.startsWith('LXE_WORKSPACE_RESULT='));expect(line).toBeDefined();expect(JSON.parse(line!.slice(21)).passed).toHaveLength(8);
  }finally{clearTimeout(timer);if(child.exitCode===null){child.kill();await child.exited;}}
 }finally{rmSync(output,{recursive:true,force:true,maxRetries:5});rmSync(profile,{recursive:true,force:true,maxRetries:5});}
},115000);

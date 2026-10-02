/** Starts the actual packaged app with isolated test state; no model calls or external browser automation. */
import { strict as assert } from 'node:assert';
import { closeSync, openSync, readFileSync, mkdtempSync, readdirSync, cpSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
if (process.platform !== 'win32' || !process.argv[2]) throw new Error('Usage on Windows: bun scripts/verify-packaged-workspace-apps.ts <win-unpacked-directory>');
const source = resolve(process.argv[2]);
const root = mkdtempSync(join(tmpdir(), 'lxe-packaged-workspace-apps-'));
// Keep the original package and its var directory untouched; use its exact resources.
for (const entry of readdirSync(source, {withFileTypes:true})) {
  if (entry.isFile() || entry.name === 'locales') cpSync(join(source, entry.name), join(root, entry.name), {recursive:true});
}
symlinkSync(join(source, 'resources'), join(root, 'resources'), 'junction');
const workspace = join(root, 'workspace 中文'); mkdirSync(workspace);
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
// External Windows GUI processes can retain inherited output handles. Do not wait for pipe EOF.
const stdoutPath=join(root,'stdout.log'), stderrPath=join(root,'stderr.log');
const stdoutFd=openSync(stdoutPath,'w'), stderrFd=openSync(stderrPath,'w');
const child = Bun.spawn([join(root, 'LXE Agent.exe'), '--inspect=127.0.0.1:0', '--disable-gpu'], {env, stdout:stdoutFd, stderr:stderrFd});
let logs = '', debuggerAddress: string | undefined;
const collect = () => { logs=readFileSync(stdoutPath,'utf8')+'\n'+readFileSync(stderrPath,'utf8');debuggerAddress ??= logs.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-z\d-]+/)?.[0]; };
const delay = (ms: number) => new Promise(r=>setTimeout(r,ms));
async function wait(fn:()=>unknown|Promise<unknown>, label:string) {const end=Date.now()+45000;while(Date.now()<end){if(await fn())return;await delay(100)}throw new Error('Timed out: '+label)}
let socket: WebSocket | undefined, sequence=0;
const pending = new Map<number,{resolve:(value:any)=>void;reject:(error:any)=>void}>();
async function raw(expression: string):Promise<any> {
  const id=++sequence;
  const result=new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});setTimeout(()=>{if(pending.delete(id))reject(new Error('Inspector request timed out'))},15000)});
  socket!.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));return result;
}
async function evaluate(expression: string):Promise<any> {
  const job=++sequence;
  await raw(`globalThis.__workspaceJobs ||= {}; globalThis.__workspaceJobs[${job}]={done:false};Promise.resolve((${expression})).then(value=>globalThis.__workspaceJobs[${job}]={done:true,value},error=>globalThis.__workspaceJobs[${job}]={done:true,error:String(error)});true`);
  let result:any;
  await wait(async()=>{result=await raw(`globalThis.__workspaceJobs[${job}]`);return result?.done},'evaluation '+job);
  if(result.error)throw new Error(result.error);return result.value;
}
const renderer = (code:string) => evaluate(`workspaceTestElectron.BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(${JSON.stringify(code)})`);
try {
  await wait(()=>{collect();return debuggerAddress},'packaged app inspector');
  socket=new WebSocket(debuggerAddress!); await new Promise<void>((resolve,reject)=>{socket!.onopen=()=>resolve();socket!.onerror=reject});
  socket.onmessage=event=>{const message=JSON.parse(String(event.data)), task=pending.get(message.id);if(!task)return;pending.delete(message.id);if(message.error||message.result?.exceptionDetails)task.reject(new Error(JSON.stringify(message.error||message.result.exceptionDetails)));else task.resolve(message.result?.result?.value)};
  await delay(2000);
  await evaluate("(globalThis.workspaceTestElectron=process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json')('electron'),true)");
  await wait(()=>evaluate("workspaceTestElectron.BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().startsWith('app://lxe/'))"),'production dashboard');
  await wait(()=>renderer('!!window.lxe?.files && !!window.lxe?.dashboard'),'production preload');
  const apps=await renderer('window.lxe.desktop.getWorkspaceApplications()');
  assert.ok(apps.some((app:any)=>app.id==='explorer'),JSON.stringify(apps));
  assert.ok(apps.every((app:any)=>app.icon===null||app.icon.startsWith('data:image/')));
  const opened:string[]=[];
  for(const id of ['explorer','vscode','windowsterminal','gitbash'].filter(id=>apps.some((app:any)=>app.id===id))){
    await renderer(`window.lxe.desktop.openWorkspace(${JSON.stringify(workspace)},${JSON.stringify(id)})`);opened.push(id);
  }
  const missing=await renderer(`window.lxe.desktop.openWorkspace(${JSON.stringify(join(workspace,'missing'))}).then(()=>'',e=>e.message)`);assert.match(missing,/ENOENT/);
  const invalid=await renderer(`window.lxe.desktop.openWorkspace(${JSON.stringify(workspace)},'arbitrary-command').then(()=>'',e=>e.message)`);assert.match(invalid,/Unknown workspace application/);
  const report={packaged:await evaluate('workspaceTestElectron.app.isPackaged'),platform:process.platform,source,root,apps:apps.map((app:any)=>({id:app.id,icon:!!app.icon})),opened,passed:['actual packaged executable','production app:// dashboard/preload/CSP','installed app discovery','native application icons','Unicode and space path launches','missing directory and unknown app diagnostics']};
  assert.equal(report.packaged,true);writeFileSync(join(root,'report.json'),JSON.stringify(report,null,2));console.log('LXE_PACKAGED_WORKSPACE_RESULT='+JSON.stringify(report));
  await evaluate('(setTimeout(()=>workspaceTestElectron.app.quit(),100),true)'); socket.close();
  await Promise.race([child.exited,delay(15000).then(()=>{throw new Error('Packaged app did not quit')})]);
} catch(error) {collect();writeFileSync(join(root,'failure.log'),logs);console.error('Packaged test directory: '+root);throw error}
finally {socket?.close();if(child.exitCode===null){child.kill();await child.exited}closeSync(stdoutFd);closeSync(stderrFd)}

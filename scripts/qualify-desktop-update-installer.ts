/** Windows-only isolated NSIS qualification. Never uses the production AppID/cache. */
import {createRequire} from "node:module";
import {cpSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
const root=resolve(import.meta.dir,".."),desktop=join(root,"apps/desktop");
const require=createRequire(join(desktop,"package.json")),builderRequire=createRequire(require.resolve("electron-builder/package.json"));
const {build,Platform,Arch}=require("electron-builder");
const libRequire=createRequire(builderRequire.resolve("app-builder-lib/package.json"));
const asar=libRequire("@electron/asar");
const adapter=createRequire(import.meta.url)("./windows-update-installer.cjs");
export async function qualify(payload:string,legacyRef:string,resumeRoot?:string){
 if(process.platform!=="win32")throw new Error("Windows qualification requires Windows");
 if(!existsSync(join(payload,"resources/app.asar")))throw new Error("Pass a built win-unpacked payload");
 const id=resumeRoot?resolve(resumeRoot).split(/[\\/]/).at(-1)!.replace("lxe-update-qualification-",""):randomUUID().slice(0,8),name="lxe-update-qualification-"+id;
 if(!/^[a-f0-9]{8}$/.test(id))throw new Error("Invalid isolated qualification directory");
 const output=join(root,"dist",name);mkdirSync(output,{recursive:true});
 const clone=join(output,"payload"),application=join(output,"application");
 if(!resumeRoot){cpSync(payload,clone,{recursive:true});asar.extractAll(join(clone,"resources/app.asar"),application);}
 cpSync(join(desktop,"dist"),join(application,"dist"),{recursive:true});
 const production=Bun.YAML.parse(readFileSync(join(desktop,"electron-builder.yml"),"utf8")) as any;
 const product="LXE Update Qualification "+id;
 if(!resumeRoot)renameSync(join(clone,production.productName+".exe"),join(clone,product+".exe"));
 // Explicit deletion tests may run only this fixture, never the managed tunnel script.
 writeFileSync(join(clone,"resources/wireguard/remove-lxe-tunnel.ps1"),'param([string]$ResultPath)\n[IO.File]::WriteAllText($ResultPath,"qualification: no tunnel changed")\nexit 0\n');
 const cache=name+"-updater";
 writeFileSync(join(clone,"resources/app-update.yml"),`updaterCacheDirName: ${cache}\n`);
 const legacy=join(output,"legacy-installer.nsh");
 writeFileSync(legacy,execFileSync("git",["show",legacyRef+":apps/desktop/resources/installer.nsh"],{cwd:root}));
 const artifacts:string[]=[];
 for(let n=1;n<=3;n++){
  const version=`0.0.${n}`;
  const artifact=join(output,version,`LXE-Update-Qualification-${version}.exe`);
  if(n===1&&resumeRoot&&existsSync(artifact)){artifacts.push(artifact);continue;}
  const metadata={...JSON.parse(readFileSync(join(application,"package.json"),"utf8")),name,productName:product,version,lxeBuildId:`qualification-${id}-${n}`};
  writeFileSync(join(application,"package.json"),JSON.stringify(metadata));
  writeFileSync(join(application,"qualification-version.txt"),version);
  rmSync(join(clone,"resources/app.asar"));rmSync(join(clone,"resources/app.asar.unpacked"),{recursive:true,force:true});
  await asar.createPackageWithOptions(application,join(clone,"resources/app.asar"),{unpack:"**/{pty-host.cjs,pty-runtime/**/*}"});
  if(n===2)await adapter({packager:{projectDir:desktop}});
  const config={...production,appId:"com.lxe.agent.updatequalification."+id,productName:product,
   win:{...production.win,artifactName:`LXE-Update-Qualification-${version}.exe`},extraMetadata:metadata,
   directories:{...production.directories,output:join(output,version)},
   nsis:{...production.nsis,include:n===1?legacy:join(desktop,"resources/installer.nsh"),
    useZip:n===1,differentialPackage:n!==1,createDesktopShortcut:false,createStartMenuShortcut:false},publish:null};
  console.log("Building isolated installer "+version+" using "+config.appId);
  await build({projectDir:desktop,prepackaged:clone,config,targets:Platform.WINDOWS.createTarget(["nsis"],Arch.x64),publish:"never"});
  artifacts.push(join(output,version,`LXE-Update-Qualification-${version}.exe`));
 }
 const record={schema_version:1,appId:"com.lxe.agent.updatequalification."+id,productName:product,cache,
  output,installRoot:join(output,"安装 space",product),artifacts,builds:[1,2,3].map(n=>`qualification-${id}-${n}`)};
 writeFileSync(join(output,"qualification.json"),JSON.stringify(record,null,2));
 console.log("QUALIFICATION="+join(output,"qualification.json"));
}
if(import.meta.main)await qualify(resolve(process.argv[2]??"dist/desktop-unpacked/win-unpacked"),process.argv[3]??"ba7aacd22c1b968161de02ec19bd5d90dccac7e2",process.argv[4]);

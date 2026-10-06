/** Native Windows credential/migration probe, run only with isolated qualification metadata. */
import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { bootstrapUserData } from "../apps/desktop/src/main/data-bootstrap";
import { acquireDataRootLock, dataRootInitialized } from "../apps/desktop/src/main/data-migration";
import { resolveDesktopPaths } from "../apps/desktop/src/main/paths";
import { cloneSecrets } from "../apps/desktop/src/main/config-store/model";

const input = process.argv.find(value => value.startsWith("--qualification="))!.slice("--qualification=".length);
const q = JSON.parse(readFileSync(input,"utf8"));
assert.match(q.appId, /^com\.lxe\.agent\.updatequalification\.[a-f0-9]{8}$/);
const mode = process.argv.find(value => value.startsWith("--mode="))!.slice(7);
const install = process.argv.find(value => value.startsWith("--install="))!.slice(10);
assert.ok(q.productName.startsWith("LXE Update Qualification "));
const profile = mode === "seed" ? join(q.installRoot,"var/electron/user-data") : mode === "check" ? join(process.env.LOCALAPPDATA!,q.productName,"electron/user-data") : join(q.output,"native-probe-profile");
mkdirSync(profile,{recursive:true});
app.setPath("userData",profile);
app.whenReady().then(async () => {
  const data = join(process.env.LOCALAPPDATA!,q.productName);
  const legacy = join(q.installRoot,"var");
  if (mode === "seed") {
    assert.ok(safeStorage.isEncryptionAvailable());
    const secrets = cloneSecrets(); secrets.ziniao_password = "qualification-secret";
    writeFileSync(join(legacy,"config/secrets.bin"),safeStorage.encryptString(JSON.stringify(secrets)));
  } else if (mode === "migrate") {
    const release = acquireDataRootLock(data);
    try {
      const paths = resolveDesktopPaths({packaged:true, appPath:join(install,"resources/app.asar"),executablePath:join(install,q.productName+".exe"),resourcesPath:join(install,"resources"),environment:{LOCALAPPDATA:process.env.LOCALAPPDATA},dataDirectoryName:q.productName});
      assert.equal(await bootstrapUserData(paths,q.appId,safeStorage,async () => {throw new Error("Unexpected ambiguous sources");}),true);
    } finally {release();}
  }
  if (mode !== "seed") {
    assert.equal(dataRootInitialized(data),true);
    assert.equal(JSON.parse(safeStorage.decryptString(readFileSync(join(data,"config/secrets.bin")))).ziniao_password,"qualification-secret");
    assert.equal(JSON.parse(readFileSync(join(data,"config/settings.json"),"utf8")).workspace_root,join(data,"workspace"));
    assert.ok(existsSync(join(data,"workspace/中文 file.txt")));
  }
  writeFileSync(join(q.output,`data-${mode}-native.json`),JSON.stringify({ok:true,mode,data}));
  app.quit();
}).catch(error => {writeFileSync(join(q.output,`data-${mode}-error.txt`),String(error.stack ?? error));app.exit(1);});

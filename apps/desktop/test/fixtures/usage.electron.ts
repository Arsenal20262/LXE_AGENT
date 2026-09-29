// Bundle with Bun and run Electron <runner.cjs> <fixture.html> <artifact-directory>.
import { app, BrowserWindow, session } from "electron";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const output = resolve(process.argv[3]!);
mkdirSync(output, { recursive: true });
app.setPath("userData", join(output, "electron"));
const deadline = setTimeout(() => { console.error("Usage acceptance timed out"); app.exit(1); }, 45_000);
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((request, callback) => callback({ cancel: !request.url.startsWith("file:") && !request.url.startsWith("data:") }));
  const window = new BrowserWindow({ show: false, width: 1100, height: 850 });
  const errors: string[] = [];
  window.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  const js = (source: string) => window.webContents.executeJavaScript(source);
  const wait = async (condition: string) => {
    for (let count = 0; count < 150; count++) {
      if (await js(condition)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out: ${condition}`);
  };
  await window.loadFile(resolve(process.argv[2]!));
  await wait("document.querySelector('#open-settings')");
  await js("document.querySelector('#open-settings').click()");
  await wait("document.querySelector('.desktop-usage-amount')");
  assert.equal(await js("document.querySelector('.desktop-usage-amount strong').textContent"), "5.72");
  assert.equal(await js("document.querySelector('.desktop-settings-modal button[type=submit]')===null"), true);
  assert.equal(await js("window.usageFixture.calls"), 1);
  assert.equal(await js("document.querySelector('.desktop-usage-value').title.length>0"), true);
  assert.equal(await js("document.querySelector('.desktop-settings-nav-item.active').previousElementSibling.textContent.includes('模型设置')"), true);
  for (const width of [1100, 600]) {
    window.setSize(width, 850);
    for (const language of ["zh", "en"]) for (const theme of ["light", "dark"]) {
      await js(`window.fixtureLanguage('${language}');document.documentElement.dataset.theme='${theme}';document.documentElement.dataset.fontSize='large'`);
      await wait(`document.querySelector('.desktop-usage-panel h3').textContent==='${language === "zh" ? "额度" : "Usage"}'`);
      await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      assert.equal(await js("(()=>{const e=document.querySelector('.desktop-settings-content');return e.scrollWidth<=e.clientWidth && document.documentElement.scrollWidth<=innerWidth})()"), true);
      writeFileSync(join(output, `usage-${width}-${language}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
    }
  }
  await js("window.usageFixture.delay=100;window.usageFixture.value.status='error';window.usageFixture.value.error='DeepSeek balance HTTP 401: authentication_error';document.querySelector('.desktop-usage-refresh').click()");
  await wait("document.querySelector('.desktop-usage-refresh').disabled");
  await wait("document.querySelector('.desktop-usage-error')");
  assert.equal(await js("document.querySelector('.desktop-usage-amount strong').textContent"), "5.72");
  await js("document.querySelector('.desktop-usage-error summary').click()");
  assert.match(await js("document.querySelector('.desktop-usage-error pre').textContent"), /HTTP 401/);
  await js("window.usageFixture.value={status:'unconfigured',source:'local',balances:[],updated_at:null,error:null};document.querySelector('.desktop-usage-refresh').click()");
  await wait("document.querySelector('.desktop-usage-hint')");
  assert.equal(await js("document.querySelector('.desktop-usage-amount')===null"), true);
  await js("window.usageFixture.value={status:'ready',source:'local',balances:[{currency:'USD',total_balance:'0.00'}],updated_at:1234,error:null};document.querySelector('.desktop-usage-refresh').click()");
  await wait("document.querySelector('.desktop-usage-amount strong')?.textContent==='0.00'");
  assert.equal(await js("document.querySelector('.desktop-usage-account').textContent.includes('Personal account')"), true);
  assert.deepEqual(errors, []);
  console.log("Usage native acceptance passed: navigation, refresh, stale/error/empty/zero, source, localization, light/dark and responsive layout.");
  clearTimeout(deadline);
  window.destroy();
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });

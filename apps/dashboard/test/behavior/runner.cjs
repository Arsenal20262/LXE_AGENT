// Local Electron renderer only; this never connects to a store browser.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const [suite, profile, url] = process.argv.slice(2);
// DOM/input regression tests must also run in remote Windows sessions without a GPU.
app.disableHardwareAcceleration();
app.setPath("userData", profile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const passed = [];
const errors = [];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 900, show: false,
    // Hidden Windows windows throttle animation frames even with backgroundThrottling disabled.
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  // Do not permit accidental external requests from fixtures or production UI.
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const local = details.url.startsWith(new URL(url).origin + "/") || /^(data:|blob:)/.test(details.url);
    if (!local) errors.push(`Unexpected network request: ${details.url}`);
    callback({ cancel: !local });
  });
  win.webContents.on("console-message", event => {
    if (event.level === "error") errors.push(event.message);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer exited:", details); app.exit(1);
  });
  const js = code => win.webContents.executeJavaScript(code);
  const settle = () => js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))))");
  const state = () => js("behavior.state()");
  const waitFor = async (code, label) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await js(code)) return;
      await delay(25);
    }
    throw new Error(`Timed out: ${label}\n${JSON.stringify(await state())}\n${await js("document.body.innerText.slice(0, 3000)")}`);
  };
  const load = async (query = "") => {
    await win.loadURL(url + query);
    await waitFor("Boolean(window.behavior)", "fixture loaded");
    await settle();
  };
  const focus = async selector => {
    await js(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    win.webContents.focus();
  };
  const click = async selector => {
    await focus(selector);
    // Focus may scroll an offscreen sidebar row; finish that scroll before opening its menu.
    await settle();
    await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await settle();
  };
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    if (keyCode === "Enter") win.webContents.sendInputEvent({ type: "char", keyCode: "\r", modifiers });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await settle();
  };
  const type = async text => {
    await focus("textarea"); await win.webContents.insertText(text); await settle();
    assert.equal(await js("document.querySelector('textarea').value"), text, "native input reached the controlled textarea");
  };
  const step = async (name, run) => {
    try { await run(); assert.deepEqual(errors, [], "renderer console/network errors"); passed.push(name); }
    catch (error) { console.error("Failed scenario:", name); throw error; }
  };
  try {
    await load();
    if (suite === "dialog") {
      await step("focus enters the first visible control and wraps in both directions", async () => {
        await js("behavior.mountDialog()"); await click("#opener");
        assert.equal((await state()).active, "first", "initial focus skips hidden and disabled controls");
        await key("Tab", ["shift"]);
        assert.equal((await state()).active, "last");
        await key("Tab");
        assert.equal((await state()).active, "first");
        await key("Tab");
        assert.equal((await state()).active, "open-nested", "native Tab moves between inner controls");
      });
      await step("Escape closes only the top dialog and restores each opener", async () => {
        await click("#open-nested");
        assert.equal((await state()).active, "inner");
        await key("Tab"); assert.equal((await state()).active, "inner");
        await key("Escape");
        assert.deepEqual((await state()).dialogs, ["Outer"]);
        assert.equal((await state()).active, "open-nested");
        await key("Escape");
        assert.deepEqual((await state()).dialogs, []);
        assert.equal((await state()).active, "opener");
        await focus("#outside"); await key("Tab", ["shift"]);
        assert.equal((await state()).active, "opener", "unmounted dialog no longer traps keys");
      });
      await step("an empty dialog keeps focus until Escape", async () => {
        await js("behavior.mountDialog(true)"); await click("#opener");
        for (const modifiers of [[], ["shift"]]) {
          await key("Tab", modifiers);
          assert.equal(await js("document.activeElement.getAttribute('role')"), "dialog");
        }
        await key("Escape"); assert.equal((await state()).active, "opener");
      });
    } else if (suite === "composer") {
      await step("IME confirmation does not send; Shift+Enter inserts a line; Enter sends once", async () => {
        await js("behavior.mountComposer()"); await type("中文");
        assert.equal(await js("document.querySelector('textarea').maxLength"), 8192);
        // Synthetic composition metadata covers React's nativeEvent.isComposing;
        // normal Enter/Tab/Shift+Enter use Chromium native input below.
        await js("behavior.composeEnter()"); await settle();
        assert.equal((await state()).sends.length, 0);
        await key("Enter", ["shift"]);
        assert.equal(await js("document.querySelector('textarea').value"), "中文\n");
        assert.equal((await state()).sends.length, 0);
        await key("Enter");
        assert.deepEqual((await state()).sends, [{ text: "中文", attachments: [] }]);
      });
      await step("a pending send cannot be submitted twice", async () => {
        await js("behavior.mountComposer({holdSend:true})"); await type("pending");
        await key("Enter"); await key("Enter"); await click(".conversation-send-button");
        assert.equal((await state()).sends.length, 1);
        await js("behavior.releaseSend()"); await settle();
        assert.equal(await js("document.querySelector('textarea').value"), "");
      });
      await step("running work changes the action button to stop", async () => {
        await js("behavior.mountComposer({running:true})"); await type("queued draft");
        await click(".conversation-send-button");
        assert.equal((await state()).stops, 1); assert.equal((await state()).sends.length, 0);
        // Enter intentionally queues a new message during an existing turn.
        await focus("textarea"); await key("Enter");
        assert.equal((await state()).sends.length, 1);
      });
      await step("model/thinking saves block both click and keyboard submission", async () => {
        for (const flag of ["modelSaving", "thinkingSaving"]) {
          await js(`behavior.mountComposer({${flag}:true})`); await type("wait for settings");
          await key("Enter"); await click(".conversation-send-button");
          assert.equal((await state()).sends.length, 0, flag);
          await js(`behavior.updateComposer({${flag}:false})`); await focus("textarea"); await key("Enter");
          assert.equal((await state()).sends.length, 1, `${flag} recovery`);
        }
      });
      await step("offline composer retains draft and blocks send, file selection and drops", async () => {
        await js("behavior.mountComposer()"); await type("offline draft");
        await js("behavior.updateComposer({runtimeReady:false})"); await settle();
        assert.equal(await js("document.querySelector('textarea').disabled"), true);
        assert.equal(await js("document.querySelector('textarea').placeholder"), "Fixture runtime unavailable");
        await click(".conversation-send-button"); await key("Enter");
        await click(".conversation-attach-button"); await js("behavior.drop()"); await settle();
        assert.deepEqual((await state()).sends, []); assert.deepEqual((await state()).calls, []);
        await js("behavior.updateComposer({runtimeReady:true})"); await focus("textarea"); await key("Enter");
        assert.deepEqual((await state()).sends, [{ text: "offline draft", attachments: [] }]);
        await js("behavior.drop()"); await settle();
        assert.deepEqual((await state()).calls, [{ operation: "dropFiles", input: ["fixture.txt"] }], "drop listener is exercised after recovery");
      });
    } else if (suite === "readiness") {
      for (const [section, expected] of [
        ["home", ["sessions.list", "models.current", "channels.health", "stats.overview", "stats.skills.list"]],
        ["activity", ["sessions.list", "models.current", "stats.overview", "stats.skills.list", "stats.tools.list"]],
        ["sessions", ["sessions.list", "models.current", "models.list", "channels.health"]],
      ]) {
        await step(`${section}: both runtime processes gate requests and recovery loads data`, async () => {
          await load(`?app=1&section=${section}`);
          await waitFor("Boolean(document.querySelector('[data-lxe-root-state=ready]'))", "actual app mounted");
          const rpc = async () => (await state()).calls.filter(call => call.operation.includes("."));
          await delay(100); assert.deepEqual(await rpc(), [], "starting runtime");
          await js("behavior.setHealth({gateway:'ready',agent_cli:'starting'})"); await settle(); await delay(100);
          assert.deepEqual(await rpc(), [], "Agent CLI still starting");
          await js("behavior.setHealth({gateway:'starting',agent_cli:'ready'})"); await settle(); await delay(100);
          assert.deepEqual(await rpc(), [], "Gateway still starting");
          await js("behavior.setHealth({gateway:'ready',agent_cli:'ready'})");
          await waitFor(`${JSON.stringify(expected)}.every(operation => behavior.state().calls.some(call => call.operation === operation))`, "ready queries execute");
          await settle();
          assert.equal(await js("Boolean(document.querySelector('[data-lxe-root-state=fatal]'))"), false);
        });
      }
      await step("real settings dialog restores focus to its sidebar trigger", async () => {
        await click(".sidebar-settings-button");
        assert.equal(await js("document.querySelector('.desktop-settings-modal').contains(document.activeElement)"), true);
        await key("Escape");
        assert.equal(await js("Boolean(document.querySelector('.desktop-settings-modal'))"), false);
        assert.equal(await js("document.activeElement.matches('.sidebar-settings-button')"), true);
      });
      await step("incomplete onboarding can be dismissed and explains disabled conversation", async () => {
        await load("?app=1&complete=false&section=sessions");
        await waitFor("Boolean(document.querySelector('.desktop-onboarding-skip'))", "onboarding skip");
        await click(".desktop-onboarding-skip");
        await click(".session-new-button");
        await waitFor("Boolean(document.querySelector('textarea'))", "conversation after skipping");
        assert.equal(await js("document.querySelector('textarea').disabled"), true);
        const placeholder = await js("document.querySelector('textarea').placeholder");
        assert.match(placeholder, /model/i);
        assert.deepEqual((await state()).calls.filter(call => call.operation.includes(".")), []);
        await js("behavior.setHealth({gateway:'ready',agent_cli:'ready'})");
        await waitFor("document.querySelectorAll('.welcome-metrics dd').length > 0", "welcome statistics after runtime recovery");
        assert.equal(await js("document.querySelector('textarea').disabled"), false);
        assert.equal(await js("document.querySelector('.welcome-metrics dd').textContent"), "7");
      });
    } else if (suite === "workspaces") {
      await load("?app=1&workspaces=1&section=sessions");
      await waitFor("document.querySelectorAll('.workspace-group').length === 3", "workspace groups");
      const shop = '.workspace-group[data-workspace-directory="/fixture/shop"]';
      const group = directory => '.workspace-group[data-workspace-directory=' + JSON.stringify(directory) + ']';
      const expanded = directory => js('document.querySelector(' + JSON.stringify(group(directory) + ' .workspace-group-toggle') + ').getAttribute("aria-expanded")');
      const label = directory => js('document.querySelector(' + JSON.stringify(group(directory) + ' .workspace-group-toggle > span') + ').textContent');
      const beginRename = async directory => {
        await click(group(directory) + ' .workspace-actions-trigger');
        await key('Enter');
        await waitFor('document.activeElement?.id === "workspace-display-name"', 'rename input focused');
      };
      const enterName = async name => {
        await focus('#workspace-display-name');
        await js('document.querySelector("#workspace-display-name").select()');
        await key('Backspace');
        if (name) await win.webContents.insertText(name);
        await click('.workspace-rename-dialog button[type="submit"]');
      };
      await step("all workspaces are discoverable and expanded groups page independently", async () => {
        assert.match(await js("document.querySelector('.workspace-index').textContent"), /archive/);
        assert.equal((await state()).calls.some(call => call.operation === "sessions.list" && call.input.directory === "/fixture/shop"), false);
        await click(shop + " .workspace-group-toggle");
        await waitFor(`document.querySelectorAll('${shop} .session-index-item').length === 10`, "first shop page");
        assert.match(await js(`document.querySelector('${shop}').textContent`), /Pinned/);
        await click(shop + " .workspace-load-more");
        await waitFor(`document.querySelectorAll('${shop} .session-index-item').length === 20`, "second shop page");
        await click(shop + " .workspace-load-more");
        await waitFor(`document.querySelectorAll('${shop} .session-index-item').length === 23`, "last shop page");
        assert.equal(await js(`document.querySelector('${shop}').textContent.includes('Default chat')`), false);
      });
      await step("group new chat selects its directory without creating a session", async () => {
        await click(shop + " .workspace-group-header > button:last-child");
        await waitFor("Boolean(document.querySelector('.conversation-workspace select'))", "draft directory selector");
        assert.equal(await js("document.querySelector('.conversation-workspace select').value"), "/fixture/shop");
        await type("Prepare the project report");
        assert.equal((await state()).calls.filter(call => call.operation === "sessions.send").length, 0);
        if (process.env.LXE_WORKSPACE_SCREENSHOT) {
          require("node:fs").writeFileSync(process.env.LXE_WORKSPACE_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
        }
      });
      await step("cancel, choose, open and failed send preserve the draft and actual directory", async () => {
        await js("behavior.chooseDirectory(null)");
        await click(".conversation-workspace button[aria-label='Choose workspace']");
        assert.equal(await js("document.querySelector('textarea').value"), "Prepare the project report");
        assert.equal(await js("document.querySelector('.conversation-workspace select').value"), "/fixture/shop");
        await js('behavior.chooseDirectory("D:\\\\资料\\\\采购")');
        await click(".conversation-workspace button[aria-label='Choose workspace']");
        const selected = await js("document.querySelector('.conversation-workspace select').value");
        assert.equal(selected, "D:\\资料\\采购");
        await click(".conversation-workspace button[aria-label='Open folder']");
        assert.equal((await state()).calls.findLast(call => call.operation === "openWorkspace").input, selected);
        await js("behavior.failWorkspaceSend(true)");
        await focus("textarea"); await key("Enter");
        await waitFor("document.body.textContent.includes('EACCES: fixture directory denied')", "actual failure displayed");
        assert.equal((await state()).calls.findLast(call => call.operation === "sessions.send").input.directory, selected);
        assert.equal(await js("document.querySelector('textarea').value"), "Prepare the project report");
        assert.equal(await js("document.querySelector('.conversation-workspace select').disabled"), false);
      });
      await step("pending first send locks its directory and a late reply cannot switch a newer draft", async () => {
        await click(".session-new-button");
        await js("behavior.failWorkspaceSend(false); behavior.holdWorkspaceSend(true)");
        await type("Shared default task"); await key("Enter");
        await waitFor("document.querySelector('.conversation-workspace select').disabled", "directory locked");
        assert.equal((await state()).calls.findLast(call => call.operation === "sessions.send").input.directory, "/fixture/default");
        await click(shop + " .workspace-group-header > button:last-child");
        await js("behavior.releaseWorkspaceSend()");
        await settle();
        await waitFor("Boolean(document.querySelector('.conversation-workspace select')) && document.querySelector('.conversation-workspace select').value === '/fixture/shop'", "new draft retained");
        assert.equal(await js("document.querySelector('textarea').value"), "");
      });
      await step("global search labels the directory and an existing chat cannot change it", async () => {
        await click(".sidebar-search-button");
        await focus(".search-box input"); await win.webContents.insertText("Archived project"); await settle();
        await waitFor("document.querySelector('.session-workspace-result')?.textContent === '/fixture/archive'", "search directory label");
        await click(".session-index-open");
        await waitFor("document.querySelector('.conversation-workspace-name')?.textContent === 'archive'", "existing chat directory");
        assert.equal(await js("Boolean(document.querySelector('.conversation-workspace select'))"), false);
        await click(".conversation-workspace button[aria-label='Open folder']");
        assert.equal((await state()).calls.findLast(call => call.operation === "openWorkspace").input, "/fixture/archive");
      });
      await step('selected empty directories survive reload without creating chats', async () => {
        await click('.session-search-close');
        await js('behavior.chooseDirectory("/fixture/empty")');
        const sends = (await state()).calls.filter(call => call.operation === 'sessions.send').length;
        await click('.workspace-index-heading button');
        await waitFor('document.querySelector(".conversation-workspace select")?.value === "/fixture/empty"', 'registered draft');
        assert.equal((await state()).calls.filter(call => call.operation === 'sessions.send').length, sends);
        assert.match(await js('document.querySelector(' + JSON.stringify(group('/fixture/empty')) + ').textContent'), /No conversations yet/);
        await load('?app=1&workspaces=1&section=sessions');
        await waitFor('Boolean(document.querySelector(' + JSON.stringify(group('/fixture/empty')) + '))', 'empty registration after reload');
        assert.equal(await expanded('/fixture/empty'), 'true');
      });
      await step('rename failure keeps input, retry updates sidebar, selector and conversation title', async () => {
        await beginRename('/fixture/archive');
        await js('behavior.failRename(true)');
        await enterName('  采购项目  ');
        await waitFor('document.querySelector(".workspace-rename-dialog [role=alert]")?.textContent.includes("SQLITE_READONLY")', 'actual rename failure');
        assert.equal(await js('document.querySelector("#workspace-display-name").value'), '  采购项目  ');
        await js('behavior.failRename(false)');
        await click('.workspace-rename-dialog button[type="submit"]');
        await waitFor('!document.querySelector(".workspace-rename-dialog")', 'rename saved');
        assert.equal(await label('/fixture/archive'), '采购项目');
        if (await expanded('/fixture/archive') !== 'true') await click(group('/fixture/archive') + ' .workspace-group-toggle');
        await click(group('/fixture/archive') + ' .session-index-open');
        await waitFor('document.querySelector(".conversation-workspace-name")?.textContent === "采购项目"', 'updated conversation name');
        await click(group('/fixture/archive') + ' .workspace-group-header > button:last-child');
        assert.equal(await js('document.querySelector(".conversation-workspace select option:checked").textContent'), '采购项目');
        await beginRename('/fixture/archive'); await enterName('');
        await waitFor('!document.querySelector(".workspace-rename-dialog")', 'reset saved');
        assert.equal(await label('/fixture/archive'), 'archive');
        assert.equal(await js('document.querySelector(".conversation-workspace select option:checked").textContent'), 'archive');
      });
      await step('default aliases, duplicate names and default-directory changes remain distinct', async () => {
        await beginRename('/fixture/default'); await enterName('日常工作');
        await waitFor('!document.querySelector(".workspace-rename-dialog")', 'default renamed');
        assert.equal(await label('/fixture/default'), '日常工作');
        assert.equal(await js('document.querySelector(' + JSON.stringify(group('/fixture/default') + ' .workspace-default-badge') + ').textContent'), 'Default');
        await beginRename('/fixture/empty'); await enterName('日常工作');
        await waitFor('!document.querySelector(".workspace-rename-dialog")', 'duplicate saved');
        assert.equal(await label('/fixture/empty'), '日常工作 · /fixture/empty');
        assert.equal(await label('/fixture/default'), '日常工作 · /fixture/default');
        await js('behavior.setHealth({workspace_root:"/fixture/empty"})'); await settle();
        await waitFor('document.querySelector(".workspace-group")?.dataset.workspaceDirectory === "/fixture/empty"', 'new default first');
        assert.equal(await js('Boolean(document.querySelector(' + JSON.stringify(group('/fixture/default') + ' .workspace-default-badge') + '))'), false);
        assert.equal(await js('Boolean(document.querySelector(' + JSON.stringify(group('/fixture/empty') + ' .workspace-default-badge') + '))'), true);
        await beginRename('/fixture/empty'); await enterName(' ');
        await waitFor('!document.querySelector(".workspace-rename-dialog")', 'default reset');
        assert.equal(await label('/fixture/empty'), 'Default workspace');
        assert.equal(await label('/fixture/default'), '日常工作');
        await js('behavior.setHealth({workspace_root:"/fixture/default"})'); await settle();
        assert.equal(await label('/fixture/empty'), 'empty');
        if (process.env.LXE_WORKSPACE_SCREENSHOT) require('node:fs').writeFileSync(process.env.LXE_WORKSPACE_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      });
      await step('fold preferences survive data refresh, search and reload; deliberate entry expands', async () => {
        for (const directory of ['/fixture/default', '/fixture/archive', '/fixture/shop']) {
          if (await expanded(directory) === 'true') await click(group(directory) + ' .workspace-group-toggle');
        }
        await js('behavior.refreshWorkspaces()'); await settle();
        assert.equal(await expanded('/fixture/archive'), 'false');
        await click('.sidebar-search-button'); await click('.session-search-close');
        assert.equal(await expanded('/fixture/shop'), 'false');
        await load('?app=1&workspaces=1&section=sessions');
        await waitFor('Boolean(document.querySelector(' + JSON.stringify(shop) + '))', 'groups restored');
        assert.equal(await expanded('/fixture/default'), 'false');
        assert.equal(await expanded('/fixture/archive'), 'false');
        await click('.sidebar-search-button');
        await focus('.search-box input'); await win.webContents.insertText('Archived project');
        await waitFor('document.querySelector(".session-workspace-result")?.textContent === "/fixture/archive"', 'search ready');
        await click('.session-index-open'); await click('.session-search-close');
        assert.equal(await expanded('/fixture/archive'), 'true');
        await click(shop + ' .workspace-group-header > button:last-child');
        assert.equal(await expanded('/fixture/shop'), 'true');
        assert.equal(await js('JSON.parse(localStorage.getItem("lxe.window.main.workspaces.expanded.v1"))["/fixture/shop"]'), true);
      });
      await step('registration cancel and failure retain the draft and retry registers without sending', async () => {
        await type('Keep my draft');
        const before = (await state()).calls.filter(call => call.operation === 'workspaces.register').length;
        await js('behavior.chooseDirectory(null)'); await click('.workspace-index-heading button');
        assert.equal((await state()).calls.filter(call => call.operation === 'workspaces.register').length, before);
        await js('behavior.chooseDirectory("/fixture/retry"); behavior.failRegistration(true)');
        await click('.conversation-workspace button[aria-label="Choose workspace"]');
        await waitFor('document.querySelector(".conversation-workspace")?.textContent.includes("SQLITE_FULL")', 'registration failure');
        assert.equal(await js('document.querySelector("textarea").value'), 'Keep my draft');
        assert.equal(await js('document.querySelector(".conversation-workspace select").value'), '/fixture/shop');
        await js('behavior.failRegistration(false)'); await click('.conversation-workspace button[aria-label="Choose workspace"]');
        await waitFor('document.querySelector(".conversation-workspace select").value === "/fixture/retry"', 'retry registered');
        assert.equal(await js('document.querySelector("textarea").value'), 'Keep my draft');
      });
      await step('late registration cannot switch a newer draft or pull the user off another page', async () => {
        await js('behavior.chooseDirectory("/fixture/late"); behavior.holdRegistration(true)');
        await click('.workspace-index-heading button');
        await click(shop + ' .workspace-group-header > button:last-child');
        await js('behavior.releaseRegistration()'); await settle();
        await waitFor('Boolean(document.querySelector(' + JSON.stringify(group('/fixture/late')) + '))', 'late directory registered');
        assert.equal(await js('document.querySelector(".conversation-workspace select").value'), '/fixture/shop');
        await js('behavior.chooseDirectory("/fixture/later")'); await click('.workspace-index-heading button');
        await click('.tab-list button:first-child');
        await js('behavior.releaseRegistration()'); await settle();
        assert.equal(await js('Boolean(document.querySelector(".conversation-workspace"))'), false);
        await click('.session-new-button');
      });
      await step('corrupt preferences and blocked local storage still allow toggling', async () => {
        await js('localStorage.setItem("lxe.window.main.workspaces.expanded.v1", "{")');
        await load('?app=1&workspaces=1&section=sessions');
        await waitFor('Boolean(document.querySelector(' + JSON.stringify(shop) + '))', 'groups after corrupt preferences');
        assert.equal(await expanded('/fixture/default'), 'true');
        await js('Storage.prototype.setItem = () => { throw new Error("fixture storage unavailable"); }; undefined');
        await click(group('/fixture/default') + ' .workspace-group-toggle');
        assert.equal(await expanded('/fixture/default'), 'false');
        await click(group('/fixture/default') + ' .workspace-group-toggle');
        assert.equal(await expanded('/fixture/default'), 'true');
      });
    } else throw new Error(`Unknown suite: ${suite}`);
    console.log("LXE_BEHAVIOR_RESULT=" + JSON.stringify({ suite, passed }));
    win.destroy(); app.exit(0);
  } catch (error) {
    console.error(error.stack || error);
    console.error("Completed scenarios:", JSON.stringify(passed));
    console.error("Renderer errors:", JSON.stringify(errors));
    console.error("State:", JSON.stringify(await state().catch(String)));
    win.destroy(); app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });

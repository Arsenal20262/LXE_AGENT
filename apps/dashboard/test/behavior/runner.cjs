// Local Electron renderer only; this never connects to a store browser.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const [suite, profile, url] = process.argv.slice(2);
app.setPath("userData", profile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const passed = [];
const errors = [];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
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

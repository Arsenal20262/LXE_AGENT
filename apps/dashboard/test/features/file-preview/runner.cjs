// Tests only the local LXE renderer, never an external store browser.
const { app, BrowserWindow, clipboard, protocol } = require("electron");
const assert = require("node:assert/strict");
const [profile, output, protocolFile] = process.argv.slice(2);
const url = "app://lxe/test/features/file-preview/renderer.html";
// Exercise the production asset handler with the desktop's privileged scheme.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }]);
app.disableHardwareAcceleration(); app.setPath("userData", profile);
const passed = [], errors = [], requested = [], delay = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const handle = protocol.handle.bind(protocol);
  protocol.handle = (scheme, handler) => handle(scheme, request => { requested.push(request.url); return handler(request); });
  require(protocolFile).registerDashboardProtocol(output);
  protocol.handle = handle;
  const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    requested.push(details.url);
    const local = details.url.startsWith("app://lxe/") || /^(data:|blob:)/.test(details.url);
    if (!local) errors.push(`External request: ${details.url}`); callback({ cancel: !local });
  });
  win.webContents.on("console-message", event => { if (event.level === "error" || event.message.includes("Setting up fake worker")) errors.push(event.message); });
  const js = code => win.webContents.executeJavaScript(code);
  const wait = async (condition, label) => { const deadline = Date.now() + 12000; while (Date.now() < deadline) { if (await js(condition)) return; await delay(40); } throw new Error(`Timeout: ${label}\n${await js("(()=>{const text=document.body.innerText;return text.length>2500?text.slice(0,800)+'\\n[truncated]\\n'+text.slice(-1400):text})()")}`); };
  const click = async selector => { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(80); };
  const capture = async name => {
    if (!process.env.LXE_PREVIEW_CAPTURE_DIR) return;
    const fs=require("node:fs"), path=require("node:path");fs.mkdirSync(process.env.LXE_PREVIEW_CAPTURE_DIR,{recursive:true});
    fs.writeFileSync(path.join(process.env.LXE_PREVIEW_CAPTURE_DIR,name+".png"),(await win.webContents.capturePage()).toPNG());
  };
  const step = async (name, fn) => { await fn(); assert.deepEqual(errors, []); passed.push(name); };
  try {
    await win.loadURL(url);
  win.webContents.enableDeviceEmulation({ screenPosition: "desktop", screenSize: { width: 0, height: 0 }, viewPosition: { x: 0, y: 0 }, viewSize: { width: 0, height: 0 }, deviceScaleFactor: 2, scale: 1 });
    await wait("!!window.previewFixture", "mount");
    assert.ok(requested.includes(url), "production protocol served the fixture");
    assert.equal(await js("previewFixture.workers.size"), 0);
    assert.equal(requested.some(path => /ExcelViewer|PdfViewer|pdf.worker|worker-/.test(path)), false, "large viewers are lazy");
    await step("Markdown, local image and tab deduplication", async () => {
      await click("#open-0"); await wait("document.querySelector('.file-markdown img')?.naturalWidth > 0", "local Markdown image");
      assert.equal(await js("document.querySelector('.file-markdown h1').textContent"), "Preview heading");
      assert.equal(await js("Math.round(document.querySelector('.file-sidebar').getBoundingClientRect().width)"), 420);
      await click("#open-0"); assert.equal(await js("document.querySelectorAll('[role=tab]').length"), 1);
      assert.equal(await js("document.querySelector('#draft').value"), "keep this draft");
    });
    await step("FortuneSheet React 19 mounting, selection, copying and resizing", async () => {
      await click("#open-1"); await wait("!!document.querySelector('.fortune-container canvas')", "spreadsheet canvas");
      await wait("document.body.innerText.includes('Sales') && document.body.innerText.includes('Notes')", "worksheet tabs");
      const canvas = await js("(() => { const c=document.querySelector('.fortune-container canvas'), r=c.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; })()");
      assert.ok(canvas.width > 100 && canvas.height > 100);
      win.webContents.focus();
      win.webContents.sendInputEvent({ type: "mouseDown", x:Math.round(canvas.x+95),y:Math.round(canvas.y+55),button:"left",clickCount:1 });
      win.webContents.sendInputEvent({ type: "mouseUp", x:Math.round(canvas.x+95),y:Math.round(canvas.y+55),button:"left",clickCount:1 });
      await delay(150);
      await capture("spreadsheet");
      clipboard.clear();
      win.webContents.sendInputEvent({type:"keyDown",keyCode:"c",modifiers:[process.platform==="darwin"?"meta":"control"]});
      win.webContents.sendInputEvent({type:"keyUp",keyCode:"c",modifiers:[process.platform==="darwin"?"meta":"control"]});
      await delay(150); assert.ok(clipboard.readText().length > 0, "selection copies actual cell content");
      await js("document.querySelector('[role=separator]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
      await delay(200); assert.equal(await js("Math.round(document.querySelector('.file-sidebar').getBoundingClientRect().width)"),440);
      assert.equal(await js("document.querySelector('#draft').value"), "keep this draft");
    });
    await step("PDF local worker, text selection and rendered content", async () => {
      await click("#open-3");
      const expected = process.env.LXE_PREVIEW_OFFICE_PDF ? "Office 验证" : "Preview sample";
      await wait(`document.querySelector('.textLayer')?.textContent.includes(${JSON.stringify(expected)})`, "PDF text layer");
      await capture("pdf");
      assert.ok(await js("(() => {const c=document.querySelector('.file-pdf canvas');const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((v,i)=>i%4!==3&&v<240);})()"), "PDF contains visible pixels");
      assert.ok(requested.some(path=>path.includes("pdf.worker")));
      assert.equal(await js("previewFixture.workers.size"), 1, "PDF runs in its dedicated worker");
    });
    await step("Image and unsupported HTML", async () => {
      await click("#open-4"); await wait("document.querySelector('.file-image img')?.naturalWidth > 0", "image");
      await wait("previewFixture.workers.size === 0", "PDF worker released after changing tabs");
      await click("#open-5"); await wait("!!document.querySelector('.file-preview-empty')", "unsupported");
      assert.equal(await js("document.body.innerText.includes('Never execute')"),false);
    });
    await step("System application menu and native open bridge", async () => {
      await click(".file-open-split button:last-child"); await wait("!!document.querySelector('[role=menuitem]')", "applications");
      await click("[role=menuitem]");
      assert.ok(await js("previewFixture.calls.some(c=>c.includes('\"application\":\"editor\"'))"));
    });
    await step("File tree includes hidden files and session state stays isolated", async () => {
      await click(".file-header-actions button:first-child"); await wait("document.body.innerText.includes('.hidden')", "hidden file");
      const count=await js("document.querySelectorAll('[role=tab]').length");
      await js("previewFixture.switchSession()"); await delay(100); assert.equal(await js("!!document.querySelector('.file-sidebar')"),false);
      await js("previewFixture.switchSession()"); await delay(100); assert.equal(await js("document.querySelectorAll('[role=tab]').length"), count);
    });
    await step("Reading position, image zoom and worksheet survive tab remounts", async () => {
      await click("#open-0"); await wait("!!document.querySelector('.file-markdown h1')", "Markdown loaded");
      await js("document.querySelector('.file-text-scroll').scrollTop = 650"); await delay(100);
      assert.ok(await js("document.querySelector('.file-text-scroll').scrollTop > 600"));
      await click("#open-4"); await wait("!!document.querySelector('.file-image img')", "image ready");
      await js("var z=document.querySelector('.file-zoom-bar select');z.value='200';z.dispatchEvent(new Event('change',{bubbles:true}))");
      await click("#open-1"); await wait("!!document.querySelector('.fortune-container canvas')", "workbook ready");
      await js("[...document.querySelectorAll('.luckysheet-sheets-item')].find(e=>e.textContent.includes('Notes')).click()"); await delay(150);
      await click("#open-0"); await wait("document.querySelector('.file-text-scroll')?.scrollTop > 600", "Markdown position restored");
      await click("#open-4"); await wait("document.querySelector('.file-zoom-bar select')?.value === '200'", "image zoom restored");
      await click("#open-1"); await wait("document.querySelector('.luckysheet-sheets-item-active')?.textContent.includes('Notes')", "worksheet restored");
    });
    await step("Text paging, exact partial copy and cross-page Markdown", async () => {
      await click("#open-0"); await wait("!!document.querySelector('.file-markdown h1')", "Markdown ready");
      await js("var s=document.querySelector('.file-document-toolbar select');s.value='plain';s.dispatchEvent(new Event('change',{bubbles:true}))");
      await wait("document.querySelector('.file-text-actions button')?.textContent.includes('已加载') && !document.querySelector('.file-text-actions button').disabled", "partial copy label");
      win.show(); win.focus(); win.webContents.focus(); await delay(150);
      clipboard.clear(); await click(".file-text-actions button"); await wait("document.querySelector('.file-text-actions button')?.textContent.includes('已复制')", "copy completed");
      assert.ok(clipboard.readText().startsWith('# Preview heading\n')); assert.equal(clipboard.readText().includes('const last = 2;'),false);
      await click(".file-load-more"); await wait("document.querySelector('.file-text code')?.textContent.includes('const last = 2;')", "second page");
      await click(".file-text-actions button"); assert.ok(clipboard.readText().endsWith('const last = 2;\n' + String.fromCharCode(96).repeat(3) + '\n'));
      await js("var s=document.querySelector('.file-document-toolbar select');s.value='rendered';s.dispatchEvent(new Event('change',{bubbles:true}))");
      await wait("document.querySelector('.file-markdown pre')?.textContent.includes('const last = 2;')", "cross-page fence");
    });
    await step("PDF 400 percent, pixel budget, rotation and zoom restoration", async () => {
      await click("#open-3"); await wait("!!document.querySelector('.textLayer span')", "PDF ready");
      await js("var z=document.querySelector('.file-zoom-bar select');z.value='400';z.dispatchEvent(new Event('change',{bubbles:true}))"); await delay(600);
      assert.ok(await js("[...document.querySelectorAll('.file-pdf canvas')].every(c=>c.width*c.height<=16777216)"));
      await click(".file-pdf-navigation button"); await delay(350);
      if (!process.env.LXE_PREVIEW_OFFICE_PDF) {
        await js("var p=document.querySelector('.file-pdf-navigation input');var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(p,'8');p.dispatchEvent(new Event('input',{bubbles:true}))");
        await wait("document.querySelector('.file-pdf-navigation input').value === '8'", "page navigation");
      }
      await click("#open-0"); await wait("previewFixture.workers.size === 0", "PDF worker released");
      await click("#open-3"); await wait("document.querySelector('.file-zoom-bar select')?.value === '400'", "PDF zoom restored");
      if (!process.env.LXE_PREVIEW_OFFICE_PDF) await wait("document.querySelector('.file-pdf-navigation input')?.value === '8'", "PDF page restored");
      await capture("pdf-400");
    });
    await step("Last opening intent wins and active tabs stay visible", async () => {
      await js("previewFixture.slow(true);document.querySelector('#open-0').click();document.querySelector('#open-4').click()"); await delay(650);
      assert.ok(await js("document.querySelector('[role=tab][aria-selected=true]').textContent.includes('图.png')"));
      await js("previewFixture.slow(false)");
      assert.ok(await js("(()=>{const a=document.querySelector('[aria-selected=true]').getBoundingClientRect(),r=document.querySelector('.file-tabs').getBoundingClientRect();return a.left>=r.left-1&&a.right<=r.right+1})()"));
      await js("document.querySelector('[role=tab][aria-selected=true]').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))");
      await wait("document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('文档.md')", "Home navigation");
    });
    await step("Scoped shortcuts close only the current tab and refresh only its preview", async () => {
      await wait("!!document.querySelector('.file-markdown h1')", "active document");
      const before=await js("previewFixture.calls.filter(c=>c==='prepare').length"), count=await js("document.querySelectorAll('[role=tab]').length");
      const modifier=process.platform==='darwin'?'metaKey':'ctrlKey';
      await js("document.querySelector('.file-sidebar').dispatchEvent(new KeyboardEvent('keydown',{key:'r',"+modifier+":true,bubbles:true,cancelable:true}))");
      await wait("previewFixture.calls.filter(c=>c==='prepare').length>"+before,"scoped refresh");
      await js("document.querySelector('.file-sidebar').dispatchEvent(new KeyboardEvent('keydown',{key:'w',"+modifier+":true,bubbles:true,cancelable:true}))");
      await wait("document.querySelectorAll('[role=tab]').length==="+(count-1),"scoped close");
      assert.equal(await js("document.querySelector('#draft').value"),"keep this draft");
    });
    await step("Refresh releases old handle and closing releases active preview", async () => {
      await click("#open-0"); await wait("!!document.querySelector('.file-markdown h1')", "Markdown remount");
      const before=await js("previewFixture.calls.filter(c=>c==='prepare').length");
      await js("previewFixture.change();window.dispatchEvent(new Event('focus'))");
      await wait(`previewFixture.calls.filter(c=>c==='prepare').length > ${before}`, "version refresh");
      await click(".file-tab-strip > button:last-child"); await delay(100);
      assert.equal(await js("previewFixture.pending.size"),0);
    });
    await step("Narrow layout and persisted tabs survive reload", async () => {
      await click(".file-header-actions button:last-child"); win.setSize(640,800); await delay(200);
      assert.ok(await js("document.querySelector('.file-layout').classList.contains('preview-full')"));
      assert.equal(await js("getComputedStyle(document.querySelector('.file-layout-main')).visibility"),"hidden");
      await win.reload(); await wait("!!document.querySelector('.file-markdown h1')", "restored active tab");
      assert.ok(await js("document.querySelectorAll('[role=tab]').length > 3"));
    });
    console.log("LXE_PREVIEW_RESULT="+JSON.stringify({passed})); win.destroy(); app.exit(0);
  } catch(error) { console.error(error.stack||error); console.error(JSON.stringify({passed,errors})); console.error(await js("(()=>{const text=document.body.innerText;return text.length>2500?text.slice(0,800)+'\\n[truncated]\\n'+text.slice(-1400):text})()").catch(String)); try {require('node:fs').writeFileSync(require('node:path').join(profile,'failure.png'),(await win.webContents.capturePage()).toPNG());}catch{} win.destroy(); app.exit(1); }
}).catch(e=>{console.error(e);app.exit(1)});

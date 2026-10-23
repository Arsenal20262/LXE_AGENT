const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

module.exports = async ({ js, step, waitFor, click, state }) => {
  const days = '.amazon-peak-days input';
  const save = '.workbench-settings-actions button';
  const editDays = async value => {
    await js(`(() => { const input = document.querySelector('${days}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(`!document.querySelector('${save}').disabled`, "days editable");
  };
  const loaded = () => waitFor(`Boolean(document.querySelector('${days}'))`, "Amazon settings loaded");
  const saved = () => waitFor(`document.querySelector('${save}').disabled && !document.querySelector('${days}').disabled`, "days saved");

  await step("days-only settings use the shared header and leave opt-in to the current request", async () => {
    await js("behavior.mountAmazonSettings('zh')"); await loaded();
    assert.equal(await js("document.querySelectorAll('input[type=checkbox]').length"), 0);
    assert.equal(await js("document.querySelector('.workbench-detail-header h1').id"), "amazon-final-restock-settings-title");
    assert.equal(await js("document.querySelector('section').getAttribute('aria-labelledby')"), "amazon-final-restock-settings-title");
    assert.equal(await js("document.querySelectorAll('[class*=vietnam]').length"), 0);
    assert.match(await js("document.body.innerText"), /默认30天/);
    assert.match(await js("document.body.innerText"), /每轮默认不加成/);
    assert.equal(await js(`document.querySelector('${days}').value`), "");
    assert.equal(await js("document.querySelectorAll('input[type=file]').length"), 0);
  });
  await step("days persist across remounts without editing the historical switch", async () => {
    await editDays("20"); await click(save); await saved();
    assert.deepEqual((await state()).calls.filter(call => call.operation === "amazon.save").at(-1).input,
      { peak_boost_enabled: true, peak_boost_days: 20 });
    await js("behavior.mountAmazonSettings('en')"); await loaded();
    assert.equal(await js(`document.querySelector('${days}').value`), "20");
    assert.equal(await js("document.querySelectorAll('input[type=checkbox]').length"), 0);
  });
  await step("pending saves lock fields and failed saves preserve the draft and actual error", async () => {
    await editDays("40"); await js("behavior.amazonSaveMode('hold')"); await click(save);
    assert.equal(await js(`document.querySelector('${days}').disabled`), true);
    assert.equal(await js(`document.querySelector('${save}').disabled`), true);
    await js("behavior.releaseAmazonSave()"); await saved();
    await editDays("60"); await js("behavior.amazonSaveMode('error')"); await click(save);
    await waitFor("Boolean(document.querySelector('[role=alert]'))", "actual save error");
    assert.match(await js("document.querySelector('[role=alert]').textContent"), /PermissionError: fixture settings denied/);
    assert.equal(await js(`document.querySelector('${days}').value`), "60");
    assert.equal(await js(`document.querySelector('${days}').disabled`), false);
    await js("behavior.amazonSaveMode('success'); behavior.mountAmazonSettings('zh')"); await loaded();
    assert.equal(await js(`document.querySelector('${days}').value`), "40");
  });
  await step("corrupt settings block editing and support explicit retry", async () => {
    await js("behavior.amazonReadFailure(true); behavior.mountAmazonSettings('zh')");
    await waitFor("Boolean(document.querySelector('[role=alert]'))", "actual read error");
    assert.match(await js("document.querySelector('[role=alert]').textContent"), /设置格式无效/);
    assert.equal(await js(`document.querySelector('${days}') === null`), true);
    await js("behavior.amazonReadFailure(false)"); await click('.workbench-refresh'); await loaded();
    assert((await state()).calls.every(call => call.operation.startsWith("amazon.")));
  });
  await step("invalid days never save and blank remains distinct from zero", async () => {
    const count = (await state()).calls.filter(call => call.operation === "amazon.save").length;
    for (const value of ["-1", "121", "1.5", "abc"]) {
      await editDays(value); await click(save);
      assert.match(await js("document.querySelector('[role=alert]').textContent"), /0～120/);
    }
    assert.equal((await state()).calls.filter(call => call.operation === "amazon.save").length, count);
    for (const [value, expected] of [["0", 0], ["", null]]) {
      await editDays(value); await click(save); await saved();
      const input = (await state()).calls.filter(call => call.operation === "amazon.save").at(-1).input;
      assert.deepEqual(input, { peak_boost_enabled: true, peak_boost_days: expected });
      await js("behavior.mountAmazonSettings('zh')"); await loaded();
      assert.equal(await js(`document.querySelector('${days}').value`), value);
    }
  });
  await step("Amazon styles are independent of Vietnam selectors and preserve Vietnam fields", async () => {
    const source = readFileSync(join(__dirname, "../../src/features/workbench/amazon-final-restock-settings-view.tsx"), "utf8");
    assert.doesNotMatch(source, /vietnam-settings|vietnam-save/);
    assert.match(source, /<WorkbenchPageHeader/);
    const before = await js(`getComputedStyle(document.querySelector('${days}')).height`);
    assert.equal(before, "38px");
    assert.equal(await js(`getComputedStyle(document.querySelector('${days}')).width`), "88px");
    try {
      await js(`(() => { const style = document.createElement('style'); style.id = 'vietnam-isolation-probe'; style.textContent = '.vietnam-settings-view input { height: 77px !important; } .vietnam-save button { min-height: 77px !important; }'; document.head.append(style); })()`);
      assert.equal(await js(`getComputedStyle(document.querySelector('${days}')).height`), before);
      assert.notEqual(await js(`getComputedStyle(document.querySelector('${save}')).minHeight`), "77px");
      await js("behavior.mountVietnam('en')");
      await waitFor("document.querySelectorAll('.vietnam-settings-view input').length === 7", "Vietnam fields loaded");
      assert.equal(await js("getComputedStyle(document.querySelector('.vietnam-settings-view input')).height"), "77px");
    } finally { await js("document.querySelector('#vietnam-isolation-probe')?.remove()"); }
    assert.equal(await js("getComputedStyle(document.querySelector('.vietnam-settings-view input')).height"), "38px");
    assert.deepEqual(await js("[...document.querySelectorAll('.vietnam-settings-view input')].map(input => input.value)"),
      ["60", "30", "10", "3900", "0", "0.8", "0.8"]);
    assert.equal(await js("document.querySelectorAll('.amazon-peak-days').length"), 0);
  });
};

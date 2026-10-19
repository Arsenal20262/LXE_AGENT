const assert = require("node:assert/strict");

module.exports = async ({ js, step, waitFor, click, state }) => {
  const toggle = '.amazon-peak-toggle input';
  const loaded = () => waitFor(`Boolean(document.querySelector('${toggle}'))`, "Amazon settings loaded");
  const checked = value => waitFor(`document.querySelector('${toggle}').checked === ${value} && !document.querySelector('${toggle}').disabled`, "saved toggle");

  await step("default-on, localized setting without data uploads", async () => {
    await js("behavior.mountAmazonSettings('zh')"); await loaded(); await checked(true);
    assert.match(await js("document.body.innerText"), /30.*120/s);
    assert.equal(await js("document.querySelectorAll('input[type=file]').length"), 0);
  });
  await step("off persists on remount and can be reenabled", async () => {
    await click(toggle); await checked(false);
    await js("behavior.mountAmazonSettings('en')"); await loaded(); await checked(false);
    await click(toggle); await checked(true);
    assert.deepEqual((await state()).calls.filter(call => call.operation === "amazon.save").map(call => call.input), [{ peak_boost_enabled: true }]);
  });
  await step("pending saves lock input and failed saves keep prior value", async () => {
    await js("behavior.amazonSaveMode('hold')"); await click(toggle);
    assert.equal(await js(`document.querySelector('${toggle}').disabled`), true);
    await js("behavior.releaseAmazonSave()"); await checked(false);
    await js("behavior.amazonSaveMode('error')"); await click(toggle); await checked(false);
    assert.match(await js("document.querySelector('[role=alert]').textContent"), /PermissionError: fixture settings denied/);
    await js("behavior.amazonSaveMode('success')");
  });
  await step("corrupt settings block the toggle and support explicit retry", async () => {
    await js("behavior.amazonReadFailure(true); behavior.mountAmazonSettings('zh')");
    await waitFor("Boolean(document.querySelector('[role=alert]'))", "actual read error");
    assert.match(await js("document.querySelector('[role=alert]').textContent"), /设置格式无效/);
    assert.equal(await js(`document.querySelector('${toggle}') === null`), true);
    await js("behavior.amazonReadFailure(false)"); await click('.workbench-refresh'); await loaded(); await checked(false);
    assert((await state()).calls.every(call => call.operation.startsWith("amazon.")));
  });
};

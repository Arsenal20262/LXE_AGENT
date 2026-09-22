import { expect, spyOn, test } from "bun:test";
import type { JsonObject } from "@lxe/protocol";
import { normalizeToolResultImages } from "../../src/tooling/tool-result-images";
import { ModelImageError, ModelImageProcessor } from "../../src/providers/model-image";
import { adaptMessagesForCompletions } from "../../src/providers/completions-provider";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=";
const image = (data = png, mime = "image/png"): JsonObject => ({ type: "image", source: { type: "base64", media_type: mime, data } });
const signal = () => new AbortController().signal;

test("keeps compliant bytes, corrects MIME, and leaves text and custom URLs alone", async () => {
  const text = { type: "text", text: '{"screenshot_url":"https://example.invalid/p.png"}' };
  const original = [text, image(png, "image/jpeg")];
  const result = await normalizeToolResultImages(original, signal());
  expect(result).toEqual({ content: [text, image()], failures: [] });
  expect(original[1]).toEqual(image(png, "image/jpeg"));
  const jpeg = Buffer.from(await new Bun.Image(Buffer.from(png, "base64")).jpeg().bytes()).toString("base64");
  expect(await normalizeToolResultImages([image(jpeg, "image/jpeg")], signal())).toEqual({ content: [image(jpeg, "image/jpeg")], failures: [] });
  expect(await normalizeToolResultImages([text], signal())).toEqual({ content: [text], failures: [] });
});

test("rejects malformed Base64, non-images and truncated images while retaining siblings", async () => {
  const broken = [image("%%%"), image(""), image("YWJj"), image(Buffer.from(png, "base64").subarray(0, 33).toString("base64"))];
  const before = { type: "text", text: "before" }, after = { type: "text", text: "after" };
  const result = await normalizeToolResultImages([before, ...broken, image(), after], signal());
  expect(result.failures.map(failure => failure.imageIndex)).toEqual([1, 2, 3, 4]);
  expect(result.content[0]).toEqual(before);
  expect(result.content.slice(-2)).toEqual([image(), after]);
  for (const failure of result.failures) expect(result.content[failure.imageIndex]?.text).toContain(failure.error.message);
  expect(result.content[4]?.text).toContain("ERR_IMAGE_DECODE_FAILED");
  expect(JSON.stringify(result.content)).not.toContain("YWJj");
});

test("reports the actual encoding budget failure without returning the original image", async () => {
  const failure = new ModelImageError("ERR_IMAGE_OUTPUT_TOO_LARGE", "smallest candidate exceeds fixture budget");
  const process = spyOn(ModelImageProcessor.prototype, "process").mockRejectedValueOnce(failure);
  try {
    expect(await normalizeToolResultImages([image()], signal())).toEqual({
      content: [{ type: "text", text: "[Tool image 1 omitted: ERR_IMAGE_OUTPUT_TOO_LARGE: smallest candidate exceeds fixture budget]" }],
      failures: [{ imageIndex: 1, error: failure }],
    });
  } finally { process.mockRestore(); }
});

test("propagates cancellation instead of recording it as a bad image", async () => {
  const controller = new AbortController();
  const reason = new DOMException("fixture cancelled", "AbortError");
  const process = spyOn(ModelImageProcessor.prototype, "process").mockImplementationOnce(async () => {
    controller.abort(reason);
    throw reason;
  });
  try { await expect(normalizeToolResultImages([image()], controller.signal)).rejects.toBe(reason); }
  finally { process.mockRestore(); }
});

test("non-vision tool results explain omission, while switching back preserves images", () => {
  const messages = [{ role: "tool" as const, content: [{ type: "tool_result", tool_call_id: "t", content: [image()] }] }];
  expect(adaptMessagesForCompletions(messages, false)).toEqual([
    { role: "tool", tool_call_id: "t", content: "[image omitted: the selected model does not support image content]" },
  ]);
  expect(JSON.stringify(adaptMessagesForCompletions(messages, true))).toContain(png);
  expect(messages[0]!.content[0]!.content).toEqual([image()]);
});

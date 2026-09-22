import { describe, expect, test } from "bun:test";
import { buildToolDisplayStep } from "../../src/tooling/tool-display";

describe("tool display", () => {
  test("keeps complete exec commands without redaction, path shortening, or truncation", () => {
    const command = [
      "TOKEN=raw-secret run /private/workspace/script.sh --password visible-password",
      `--payload ${"x".repeat(300)}`,
    ].join("\n");

    for (const status of ["running", "success", "error"] as const) {
      const step = buildToolDisplayStep(`tool-exec-${status}`, "exec", { command }, status, 1);
      expect(step.detail).toBe(command);
      expect(step.detail.length).toBeGreaterThan(240);
    }
  });

  test("summarizes batched send_files paths", () => {
    const step = buildToolDisplayStep(
      "tool-1",
      "send_files",
      { paths: ["artifacts/first.xlsx", "artifacts/second.pdf"] },
      "running",
      0,
    );

    expect(step.title).toBe("Send files");
    expect(step.detail).toBe("artifacts/first.xlsx artifacts/second.pdf");
  });

  test("shortens every batched absolute path outside the desktop display", () => {
    const step = buildToolDisplayStep(
      "tool-1",
      "send_files",
      { paths: ["/private/artifacts/first.xlsx", "/private/artifacts/second.pdf"] },
      "running",
      0,
    );

    expect(step.detail).toBe(".../first.xlsx .../second.pdf");
  });

  test("keeps the legacy send_file title for historical transcripts", () => {
    const step = buildToolDisplayStep(
      "tool-1",
      "send_file",
      { path: "artifacts/legacy.xlsx" },
      "success",
      1,
    );

    expect(step.title).toBe("Send file");
    expect(step.detail).toBe("artifacts/legacy.xlsx");
  });
});

test("image details retain text and metadata without serializing model image bytes", () => {
  const content = [
    { type: "text", text: "Read image file [image/png]" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "image-bytes-fixture" } },
  ];
  const image_view = { view_id: "view-1", name: "image.png", media_type: "image/png" };
  const step = buildToolDisplayStep("call-1", "read", { path: "image.png" }, "success", 1,
    { showResultDetails: true, result: content, image_view });
  expect(step.image_view).toEqual(image_view);
  expect(step.result_block?.content).toContain("Read image file");
  expect(step.result_block?.content).not.toContain("image-bytes-fixture");
  expect(content[1]?.source?.data).toBe("image-bytes-fixture");
});

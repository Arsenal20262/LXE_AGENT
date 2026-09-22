import type { JsonObject } from "@lxe/protocol";
import { ModelImageError, ModelImageProcessor } from "../providers/model-image";

const processor = new ModelImageProcessor();

/** Normalize tool images once, before persistence; a bad image does not discard sibling results. */
export async function normalizeToolResultImages(content: JsonObject[], signal: AbortSignal): Promise<{
  content: JsonObject[];
  failures: Array<{ imageIndex: number; error: Error }>;
}> {
  if (!content.some(block => block.type === "image")) return { content, failures: [] };
  const normalized: JsonObject[] = [];
  const failures: Array<{ imageIndex: number; error: Error }> = [];
  let imageIndex = 0;
  for (const block of content) {
    signal.throwIfAborted();
    if (block.type !== "image") {
      normalized.push(block);
      continue;
    }
    imageIndex++;
    try {
      const source = block.source as JsonObject | undefined;
      const data = source?.data;
      if (source?.type !== "base64" || typeof data !== "string" || !data.length
        || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(data)) {
        throw new Error("invalid tool image Base64 data: expected a non-empty Base64 source with valid padding");
      }
      const bytes = Buffer.from(data, "base64");
      const prepared = await processor.process(bytes, "read");
      signal.throwIfAborted();
      if (prepared.bytes === bytes) {
        // metadata() only reads headers. Decode the full image before trusting passthrough bytes.
        try { await new Bun.Image(bytes).png({ compressionLevel: 0 }).bytes(); }
        catch (cause) {
          throw new ModelImageError("ERR_IMAGE_DECODE_FAILED", cause instanceof Error ? cause.message : String(cause), { cause });
        }
      }
      signal.throwIfAborted();
      normalized.push({ ...block, source: {
        type: "base64", media_type: prepared.mediaType, data: Buffer.from(prepared.bytes).toString("base64"),
      } });
      const { original, processed } = prepared;
      if (original.width !== processed.width || original.height !== processed.height) {
        normalized.push({ type: "text", text: `[Tool image ${imageIndex}: original ${original.width}x${original.height}, displayed at ${processed.width}x${processed.height}. Multiply x coordinates by ${(original.width / processed.width).toFixed(4)} and y coordinates by ${(original.height / processed.height).toFixed(4)} to map to the original image.]` });
      }
    } catch (cause) {
      signal.throwIfAborted();
      const error = cause instanceof Error ? cause : new Error(String(cause));
      failures.push({ imageIndex, error });
      const code = error instanceof ModelImageError ? `${error.code}: ` : "";
      normalized.push({ type: "text", text: `[Tool image ${imageIndex} omitted: ${code}${error.message}]` });
    }
  }
  return { content: normalized, failures };
}

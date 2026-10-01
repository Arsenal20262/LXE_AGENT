import { createReadStream } from "node:fs";
import type { PreviewTextPage, TextPageRequest } from "@lxe/desktop-protocol";

export const TEXT_PAGE_BYTES = 2 * 1024 * 1024;
export const TEXT_PAGE_LINES = 5000;

/** Decode incrementally, preserving line endings and refusing partial or binary pages. */
export async function readTextPage(path: string, range: TextPageRequest = {}, signal?: AbortSignal): Promise<Omit<PreviewTextPage, "version">> {
  const offset = range.offset ?? 1, limit = range.limit ?? TEXT_PAGE_LINES;
  if (!Number.isSafeInteger(offset) || offset < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > TEXT_PAGE_LINES) throw new Error("Invalid text page range");
  const stream = createReadStream(path, { highWaterMark: 65536, signal });
  let decoder: TextDecoder | undefined, prefix = Buffer.alloc(0);
  let line = 1, lines = 0, bytes = 0, pendingLine = false;
  const parts: string[] = [];
  const consume = (chunk: string): boolean => {
    let start = 0;
    while (start < chunk.length) {
      if (line >= offset + limit) return false;
      const newline = chunk.indexOf("\n", start), end = newline < 0 ? chunk.length : newline + 1;
      const segment = chunk.slice(start, end);
      if (line >= offset) {
        if (segment.includes("\0")) throw new Error("Text preview contains NUL bytes");
        bytes += Buffer.byteLength(segment, "utf8");
        if (bytes > TEXT_PAGE_BYTES) throw new Error(`Text page exceeds 2 MiB (lines ${offset}–${offset + limit - 1})`);
        parts.push(segment); pendingLine = newline < 0;
        if (newline >= 0) lines++;
      }
      if (newline >= 0) line++;
      start = end;
    }
    return true;
  };
  const result = (eof: boolean) => {
    const count = lines + (pendingLine ? 1 : 0);
    return { text: parts.join(""), offset, lines: count, next: offset + count, eof };
  };
  try {
    for await (const raw of stream) {
      signal?.throwIfAborted();
      let chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (!decoder) {
        prefix = Buffer.concat([prefix, chunk]);
        if (prefix.length < 3) continue;
        decoder = new TextDecoder(prefix[0] === 255 && prefix[1] === 254 ? "utf-16le" : prefix[0] === 254 && prefix[1] === 255 ? "utf-16be" : "utf-8", { fatal: true });
        chunk = prefix;
      }
      if (!consume(decoder.decode(chunk, { stream: true }))) return result(false);
    }
    if (!decoder) {
      decoder = new TextDecoder(prefix[0] === 255 && prefix[1] === 254 ? "utf-16le" : prefix[0] === 254 && prefix[1] === 255 ? "utf-16be" : "utf-8", { fatal: true });
      if (!consume(decoder.decode(prefix, { stream: true }))) return result(false);
    }
    if (!consume(decoder.decode())) return result(false);
    return result(true);
  } finally { stream.destroy(); }
}

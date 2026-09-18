const COMMAND = "tms philippines products-export";
const MAX_LINE_CHARS = 2_048;
const COMMON = ["protocol_version", "type", "command", "stage"];

const integer = (value: unknown, minimum: number, maximum: number): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value : undefined;

/** Accept only the small, nonsecret progress contract emitted by the Zhihui CLI. */
export function zhihuiProgressMessage(line: string): string | undefined {
  if (!line || line.length > MAX_LINE_CHARS) return undefined;
  let value: unknown;
  try { value = JSON.parse(line); } catch { return undefined; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.protocol_version !== "1" || record.type !== "progress" || record.command !== COMMAND) return undefined;
  const stage = record.stage;
  const stageFields: Record<string, string[]> = {
    login_started: [], authenticated: [],
    listed: ["page", "page_records", "total_records"],
    exported: ["page", "page_records"],
    delivery_started: ["total_pages"],
    downloaded: ["page", "total_pages", "rows"],
    merged: ["total_pages", "rows"],
  };
  if (typeof stage !== "string" || !Object.hasOwn(stageFields, stage)) return undefined;
  const expected = [...COMMON, ...stageFields[stage]!].sort();
  if (Object.keys(record).sort().join("\0") !== expected.join("\0")) return undefined;
  const page = integer(record.page, 1, 100);
  const pageRecords = integer(record.page_records, 0, 1_000);
  const totalRecords = integer(record.total_records, 0, 100_000);
  const totalPages = integer(record.total_pages, 0, 100);
  const rows = integer(record.rows, 0, 100_000);
  switch (stage) {
    case "login_started": return "智汇 TMS：正在登录";
    case "authenticated": return "智汇 TMS：登录成功";
    case "listed": return page !== undefined && pageRecords !== undefined && totalRecords !== undefined
      ? `智汇 TMS：第${page}页读取${pageRecords}条，累计${totalRecords}条` : undefined;
    case "exported": return page !== undefined && pageRecords !== undefined
      ? `智汇 TMS：第${page}页已请求导出${pageRecords}条` : undefined;
    case "delivery_started": return totalPages !== undefined
      ? `智汇 TMS：开始下载${totalPages}页` : undefined;
    case "downloaded": return page !== undefined && totalPages !== undefined && rows !== undefined
      ? `智汇 TMS：第${page}/${totalPages}页已保存，${rows}行` : undefined;
    case "merged": return totalPages !== undefined && rows !== undefined
      ? `智汇 TMS：${totalPages}页已合并，${rows}行` : undefined;
    default: return undefined;
  }
}

/** Decodes stdout incrementally without retaining long or malformed lines. */
export class ZhihuiProgressDecoder {
  private readonly decoder = new TextDecoder();
  private line = "";
  private overflow = false;

  push(chunk: Uint8Array): string[] {
    const messages: string[] = [];
    for (const character of this.decoder.decode(chunk, { stream: true })) {
      if (character === "\n") {
        if (!this.overflow) {
          const message = zhihuiProgressMessage(this.line.replace(/\r$/u, ""));
          if (message) messages.push(message);
        }
        this.line = "";
        this.overflow = false;
      } else if (!this.overflow) {
        if (this.line.length < MAX_LINE_CHARS) this.line += character;
        else { this.line = ""; this.overflow = true; }
      }
    }
    return messages;
  }
}

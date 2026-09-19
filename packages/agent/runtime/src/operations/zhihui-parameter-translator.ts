import type { RuntimeProvider, RuntimeMessage } from "../engine/types";
import { parseZhihuiProductRequest, type ZhihuiProductRequest } from "./zhihui-parameters";

const ZHIHUI_PLATFORM_NAME = /(?:智汇|zhihui|\btms\b)/iu;
const OTHER_PLATFORM_NAME = /(?:雅仓|yacang|智慧|shangman|马帮|mabang|巴西)/iu;

export const isExplicitZhihuiRequest = (request: string): boolean =>
  ZHIHUI_PLATFORM_NAME.test(request) && !OTHER_PLATFORM_NAME.test(request);

const SYSTEM_PROMPT = [
  "Translate the user's request into the exact JSON contract below.",
  'Return only JSON or null. Never return markdown, explanations, commands, URLs, credentials, cookies, or tokens.',
  'The only valid object is {"platform":"zhihui_tms","warehouse":"PH","intent":"product_export","fields":[...]}',
  "Allowed fields: product, sku, sales, inventory, inbound, listing.",
  "Return null unless the request explicitly names Zhihui or TMS and refers to its product data. Philippines alone is ambiguous with other platforms. Return null for any request also naming Yacang, Shangman/Wisdom, or Mabang/Brazil.",
].join(" ");

export interface ZhihuiParameterTranslator {
  translate(request: string, signal: AbortSignal): Promise<ZhihuiProductRequest | undefined>;
}

const textFromResponse = (response: Awaited<ReturnType<RuntimeProvider["turn"]>>): string => response.content
  .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
  .map(block => block.text)
  .join("")
  .trim();

export class ProviderZhihuiParameterTranslator implements ZhihuiParameterTranslator {
  constructor(private readonly provider: Pick<RuntimeProvider, "turn">) {}

  async translate(request: string, signal: AbortSignal): Promise<ZhihuiProductRequest | undefined> {
    if (signal.aborted || !isExplicitZhihuiRequest(request) || request.length > 2_000) return undefined;
    const message: RuntimeMessage = { role: "user", content: request.trim() };
    try {
      const response = await this.provider.turn({
        system: SYSTEM_PROMPT,
        messages: [message],
        tools: [],
        toolChoice: "none",
        temperature: 0,
        signal,
      });
      if (response.error || response.stopReason !== "stop") return undefined;
      return parseZhihuiProductRequest(JSON.parse(textFromResponse(response)));
    } catch {
      if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      return undefined;
    }
  }
}

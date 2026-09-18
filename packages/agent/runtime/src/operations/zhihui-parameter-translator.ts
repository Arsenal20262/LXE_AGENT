import type { RuntimeProvider, RuntimeMessage } from "../engine/types";
import { parseZhihuiProductRequest, type ZhihuiProductRequest } from "./zhihui-parameters";

const SYSTEM_PROMPT = [
  "Translate the user's request into the exact JSON contract below.",
  'Return only JSON or null. Never return markdown, explanations, commands, URLs, credentials, cookies, or tokens.',
  'The only valid object is {"platform":"zhihui_tms","warehouse":"PH","intent":"product_export","fields":[...]}',
  "Allowed fields: product, sku, sales, inventory, inbound, listing.",
  "Return null when the request is not explicitly about Zhihui TMS or the Philippines warehouse product data, or when intent is uncertain.",
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
    if (signal.aborted || !request.trim() || request.length > 2_000) return undefined;
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

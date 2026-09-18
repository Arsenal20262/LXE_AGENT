export const ZHIHUI_PRODUCT_FIELDS = ["product", "sku", "sales", "inventory", "inbound", "listing"] as const;

export type ZhihuiProductField = typeof ZHIHUI_PRODUCT_FIELDS[number];

export interface ZhihuiProductRequest {
  platform: "zhihui_tms";
  warehouse: "PH";
  intent: "product_export";
  fields: ZhihuiProductField[];
}

const fieldSet = new Set<string>(ZHIHUI_PRODUCT_FIELDS);

export function parseZhihuiProductRequest(value: unknown): ZhihuiProductRequest | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4
    || record.platform !== "zhihui_tms"
    || record.warehouse !== "PH"
    || record.intent !== "product_export"
    || !Array.isArray(record.fields)
    || record.fields.length === 0) return undefined;
  const fields = record.fields;
  if (fields.some(field => typeof field !== "string" || !fieldSet.has(field))) return undefined;
  const normalized = fields as string[];
  if (new Set(normalized).size !== normalized.length) return undefined;
  return { platform: "zhihui_tms", warehouse: "PH", intent: "product_export", fields: [...normalized] as ZhihuiProductField[] };
}

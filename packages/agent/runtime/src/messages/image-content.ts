import type { JsonValue } from "@lxe/protocol";

/** Render images as text for display and summaries, without changing model history. */
export function omitImageData(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(omitImageData);
  if (value && typeof value === "object") {
    if (["image", "image_url", "input_image"].includes(String(value.type))) {
      return { type: "text", text: "[image omitted]" };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, omitImageData(item)]));
  }
  return typeof value === "string" && /^data:image\//iu.test(value) ? "[image omitted]" : value;
}

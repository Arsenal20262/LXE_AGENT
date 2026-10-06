import type { SkillCatalogSnapshot } from "./skills";

export interface SkillPreselectionAttachment {
  readonly extensions: readonly string[];
  readonly probeCommandId: string;
  readonly followupPhrases: readonly string[];
}

export interface SkillPreselectionDeclaration {
  readonly name: string;
  readonly textPhrases: readonly string[];
  readonly attachment?: SkillPreselectionAttachment;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every(key => allowed.includes(key));

const literalList = (value: unknown, maximum: number, label: string): string[] => {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`invalid ${label}`);
  const values = value.map(item => {
    if (typeof item !== "string" || item !== item.trim()
      || item.length < 2 || item.length > 80 || /[\r\n\p{Cc}]/u.test(item)) {
      throw new Error(`invalid ${label}`);
    }
    return item;
  });
  if (new Set(values).size !== values.length) throw new Error(`duplicate ${label}`);
  return values;
};

/** Parse bounded literal metadata; Skill files cannot declare predicates or executable patterns. */
export const parseSkillPreselection = (
  value: unknown,
  name: string,
): SkillPreselectionDeclaration => {
  const raw = record(value);
  if (!raw || !hasOnlyKeys(raw, ["text_phrases", "attachment"])) {
    throw new Error("invalid skill preselect declaration");
  }
  const textPhrases = raw.text_phrases === undefined ? [] : literalList(raw.text_phrases, 16, "skill preselect text_phrases");
  let attachment: SkillPreselectionAttachment | undefined;
  if (raw.attachment !== undefined) {
    const item = record(raw.attachment);
    if (!item || !hasOnlyKeys(item, ["extensions", "probe_command_id", "followup_phrases"])) {
      throw new Error("invalid skill preselect attachment");
    }
    const extensions = item.extensions;
    if (!Array.isArray(extensions) || extensions.length < 1 || extensions.length > 4
      || extensions.some(extension => typeof extension !== "string" || !/^\.[a-z0-9]{1,10}$/u.test(extension))
      || new Set(extensions).size !== extensions.length) {
      throw new Error("invalid skill preselect extensions");
    }
    if (typeof item.probe_command_id !== "string" || !/^[a-z][a-z0-9_]{0,79}$/u.test(item.probe_command_id)) {
      throw new Error("invalid skill preselect probe_command_id");
    }
    const followupPhrases = literalList(item.followup_phrases, 8, "skill preselect followup_phrases");
    attachment = { extensions, probeCommandId: item.probe_command_id, followupPhrases };
  }
  if (textPhrases.length === 0 && !attachment) throw new Error("invalid skill preselect empty declaration");
  return { name, textPhrases, ...(attachment ? { attachment } : {}) };
};

type PreselectionSnapshot = { readonly preselection?: SkillCatalogSnapshot["preselection"] };

/** Selects only an unambiguous, literal text match. */
export const matchSkillPreselectionText = (
  snapshot: PreselectionSnapshot,
  text: string,
): string | undefined => {
  const matches = (snapshot.preselection ?? []).filter(item => item.textPhrases.some(phrase => text.includes(phrase)));
  return matches.length === 1 ? matches[0]?.name : undefined;
};

/** Returns the sole declaration eligible for a local attachment probe. */
export const matchSkillPreselectionAttachment = (
  snapshot: PreselectionSnapshot,
  extension: string,
  followupText?: string,
): SkillPreselectionDeclaration | undefined => {
  const normalizedExtension = extension.toLowerCase();
  const reply = followupText?.trim() ?? "";
  const matches = (snapshot.preselection ?? []).filter(item => item.attachment?.extensions.includes(normalizedExtension)
    && (!reply || item.attachment.followupPhrases.includes(reply)));
  return matches.length === 1 ? matches[0] : undefined;
};

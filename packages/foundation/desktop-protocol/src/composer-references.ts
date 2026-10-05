// Adapted from DeepSeek Harness file-reference/grammar.ts (MIT).
/**
 * Browser-safe `@file` token grammar shared by terminal and web clients.
 *
 * @module @deepseek-ai/dsh-file-reference/grammar
 */

export interface FileReferenceCandidate { path: string; kind: "file" | "directory" }

/** Active `@` token ending at the editor cursor. */
export interface ActiveAtToken {
  /** Complete token replaced when the user accepts a completion. */
  prefix: string
  /** Path query after `@` or `@"`. */
  query: string
  /** Whether the user opened a quoted path. */
  quoted: boolean
}

/**
 * Extract an `@path` or `@"path with spaces` token at the cursor. An `@`
 * inside another token, such as an email address, is not a completion trigger.
 * @param line - current editor line.
 * @param cursorCol - cursor column within that line.
 * @returns the active token, or `undefined` outside an `@` token.
 */
export function activeAtToken(line: string, cursorCol: number): ActiveAtToken | undefined {
  const beforeCursor = line.slice(0, cursorCol)
  const quoted = /(?:^|\s)(@"([^"]*))$/u.exec(beforeCursor)
  if (quoted?.[1] !== undefined && quoted[2] !== undefined) {
    return { prefix: quoted[1], query: quoted[2], quoted: true }
  }
  const plain = /(?:^|\s)(@([^\s]*))$/u.exec(beforeCursor)
  if (plain?.[1] === undefined || plain[2] === undefined) return undefined
  return { prefix: plain[1], query: plain[2], quoted: false }
}

/**
 * Format a selected path as prompt text. Whitespace uses the quoted
 * `@"path"` grammar; a quoted directory keeps that quote open after its
 * trailing slash so completion can descend another level.
 * @param candidate - selected file or directory.
 * @param preserveQuote - retain an explicitly opened quote even when unnecessary.
 * @returns the insertion value, or `undefined` for a path the editor grammar cannot represent safely.
 */
export function formatFileMention(
  candidate: FileReferenceCandidate,
  preserveQuote: boolean,
): string | undefined {
  const path = candidate.kind === 'directory' ? `${candidate.path}/` : candidate.path
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return undefined
  const quoted = preserveQuote || /\s/u.test(path)
  if (!quoted) return `@${path}`
  if (candidate.kind === 'directory') return `@"${path}`
  return `@"${path}"`
}

/**
 * Shared ranking for `/` menu candidates: the query must be a
 * case-insensitive ordered subsequence of the candidate name or, when the
 * candidate carries one, of its display label (a localized title). Prefix
 * hits rank first, then the strongest alignment score over either key, then
 * the source order of the input. Decision record:
 * .agents/notes/archived/feature/2026-08-04-web-slash-command-fuzzy-discovery.md
 */

/** One match with its stable source position. */
interface Ranked<T> {
  readonly item: T
  readonly index: number
  readonly prefix: boolean
  readonly score: number
}

/** Extra weight for name starts and separator boundaries. */
function boundaryBonus(name: string, index: number): number {
  return index === 0 || name.charAt(index - 1) === '-' || name.charAt(index - 1) === '_' ? 8 : 0
}

/**
 * Score the strongest ordered-subsequence alignment in O(name × query).
 * Boundary and adjacent matches earn weight; skipped and leading characters
 * cost weight. Undefined when the query is not a subsequence of the name.
 */
function alignmentScore(name: string, query: string): number | undefined {
  if (query.length > name.length) return undefined
  const noMatch = Number.NEGATIVE_INFINITY
  let previous = Array<number>(name.length).fill(noMatch)
  for (let index = 0; index < name.length; index++) {
    if (name.charAt(index) === query.charAt(0)) previous[index] = 1 + boundaryBonus(name, index) - index
  }
  for (let queryIndex = 1; queryIndex < query.length; queryIndex++) {
    const current = Array<number>(name.length).fill(noMatch)
    // Sweep the previous row once: `left` is its score one character back
    // (the adjacent continuation), `leftLeft` two back (the earliest gapped one).
    let left = noMatch
    let leftLeft = noMatch
    let bestGapped = noMatch
    for (const [index, prior] of previous.entries()) {
      if (leftLeft !== noMatch) bestGapped = Math.max(bestGapped, leftLeft + index - 2)
      if (name.charAt(index) === query.charAt(queryIndex)) {
        const bonus = 1 + boundaryBonus(name, index)
        let score = noMatch
        if (left !== noMatch) score = left + bonus + 4
        if (bestGapped !== noMatch) score = Math.max(score, bestGapped + bonus + 1 - index)
        current[index] = score
      }
      leftLeft = left
      left = prior
    }
    previous = current
  }
  let best = noMatch
  for (const score of previous) best = Math.max(best, score)
  return best === noMatch ? undefined : best
}

/**
 * Rank named items by a menu query.
 * @param items - candidates in source order (a host catalog, then client
 * contributions); an item's optional `label` is a second search key beside
 * its name.
 * @param rawQuery - the text typed after the trigger, matched case-insensitively.
 * @returns the matching items: prefix hits first, then by alignment score,
 * then in source order. The input list itself for an empty query.
 */
export function rankSkills<T extends { readonly name: string; readonly label?: string }>(
  items: readonly T[],
  rawQuery: string,
): readonly T[] {
  const query = rawQuery.toLowerCase()
  if (query === '') return items
  const ranked: Ranked<T>[] = []
  items.forEach((item, index) => {
    const keys = item.label === undefined ? [item.name] : [item.name, item.label]
    let prefix = false
    let score: number | undefined
    for (const key of keys) {
      const lower = key.toLowerCase()
      const keyScore = alignmentScore(lower, query)
      if (keyScore === undefined) continue
      prefix ||= lower.startsWith(query)
      score = score === undefined ? keyScore : Math.max(score, keyScore)
    }
    if (score !== undefined) ranked.push({ item, index, prefix, score })
  })
  ranked.sort((left, right) =>
    Number(right.prefix) - Number(left.prefix) || right.score - left.score || left.index - right.index)
  return ranked.map(match => match.item)
}

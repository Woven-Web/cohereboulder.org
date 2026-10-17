/**
 * Hosts paste text that was hard-wrapped mid-sentence. A line that stops without punctuation and is
 * followed by a lowercase word is one sentence, so it is rejoined; lists, times and real line breaks stay.
 */
export function rejoinWrappedLines(text: string): string {
  return text.replace(/([\p{L},;:])[ \t]*\n[ \t]*(?=\p{Ll})/gu, "$1 ");
}

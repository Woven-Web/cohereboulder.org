// The pure pieces of an .ics file, shared by the browser's "Add to calendar"
// (src/lib/ics.ts) and the Worker's RSVP confirmation (worker/src/rsvps.ts),
// so the two can't drift. No DOM, no imports: both runtimes load this as is.

/** RFC 5545 §3.3.11: escape backslash, semicolon, comma, then newlines. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC instant in `YYYYMMDDTHHmmssZ` form. */
export function icsTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

const encoder = new TextEncoder();

/**
 * RFC 5545 §3.1: fold lines longer than 75 OCTETS (not characters — an accented
 * letter is two, an emoji four). Continuation lines start with one space, which
 * counts toward their 75. Never splits inside a character.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let used = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (used + size > limit) {
      parts.push(current);
      current = "";
      used = 0;
      limit = 74;
    }
    current += char;
    used += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Fold every line and join with CRLF, ending in one (RFC 5545 §3.1). */
export function icsJoin(lines: string[]): string {
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

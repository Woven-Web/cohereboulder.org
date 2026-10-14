import { initials } from "@/lib/board";

const TONES = ["deep", "water", "sun", "leaf", "berry"] as const;

/** Same person, same tone: derived from the DID so it never shifts between screens. */
function toneOf(did: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of did) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function Avatar({ did, name, size, ghost = false }: { did: string; name: string; size?: "sm" | "lg"; ghost?: boolean }) {
  return (
    <span className={`avatar${size ? ` avatar--${size}` : ""}`} data-tone={ghost ? "ghost" : toneOf(did)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

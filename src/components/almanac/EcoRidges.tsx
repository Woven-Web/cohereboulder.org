/**
 * The Ecology look's landscape: pale far ridges, deep near ridges, a sun disc,
 * the creek and a strip of meadow. Decorative only. Colours come from CSS
 * (.eco-ridges in ecology.css) so the palette stays in index.css.
 */
export function EcoRidges({ variant = "page" }: { variant?: "page" | "hero" | "trail" }) {
  return (
    <div className={`eco-ridges eco-ridges--${variant}`} aria-hidden="true">
      <span className="eco-ridges__sun" />
      <svg viewBox="0 0 390 110" preserveAspectRatio="none" focusable="false">
        <path className="eco-far" d="M0 62 L40 38 L70 54 L112 14 L150 46 L188 28 L238 60 L290 34 L340 56 L390 36 V110 H0Z" />
        <path className="eco-near" d="M0 80 L60 58 L104 72 L160 44 L222 76 L280 56 L336 76 L390 62 V110 H0Z" />
        <path className="eco-creek" d="M0 96 C60 82 110 104 180 92 S320 80 390 94 V110 H0Z" />
        <path className="eco-meadow" d="M0 104 C70 94 120 110 200 100 S330 92 390 102 V110 H0Z" />
      </svg>
    </div>
  );
}

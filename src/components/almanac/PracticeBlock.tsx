import type { ReactNode } from "react";

/** Today's practice: eyebrow, serif title, body with a drop cap. */
export function PracticeBlock({ eyebrow, title, children, headingId }: { eyebrow: string; title: string; children: ReactNode; headingId?: string }) {
  return (
    <section className="practice" aria-labelledby={headingId}>
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="h1 practice__title" id={headingId}>{title}</h1>
      <p className="practice__body whitespace-pre-wrap">{children}</p>
    </section>
  );
}

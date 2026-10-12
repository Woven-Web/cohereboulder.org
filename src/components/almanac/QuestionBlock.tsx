import type { ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  question: string;
  /** Reveals the reply form. Omitted on the sample day. */
  onWrite?: () => void;
  writing?: boolean;
  onShare?: () => void;
  /** The reply form (existing /api/companion/replies flow). */
  children?: ReactNode;
}

/** The question of the day, with a way to answer it and to send it to someone. */
export function QuestionBlock({ question, onWrite, writing = false, onShare, children }: Props) {
  const { tr } = useLanguage();
  return (
    <section className="question" id="q" aria-labelledby="q-eyebrow">
      <div className="eyebrow" id="q-eyebrow">{tr("almanac.questionEyebrow")}</div>
      <blockquote>{question}</blockquote>
      {!writing && (onWrite || onShare) && (
        <div className="question__acts">
          {onWrite && <button type="button" className="link" onClick={onWrite}>{tr("almanac.writeAnswer")}</button>}
          {onShare && <button type="button" className="link" onClick={onShare}>{tr("almanac.sendToSomeone")}</button>}
        </div>
      )}
      {writing && children}
    </section>
  );
}

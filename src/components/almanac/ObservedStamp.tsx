import { useLanguage } from "@/contexts/LanguageContext";

/** The berry "Observed" stamp. One 0.3s stamp-down; reduced motion removes it. */
export function ObservedStamp({ dateLabel, small = false }: { dateLabel?: string; small?: boolean }) {
  const { tr } = useLanguage();
  return (
    <div className={`stamp${small ? " stamp--sm" : ""}`} aria-hidden="true">
      <b>{small ? tr("almanac.observedShort") : tr("almanac.observed")}</b>
      {!small && dateLabel && <span>{dateLabel}</span>}
    </div>
  );
}

/** The stamp with its line of text and the way into the reflection. */
export function ObservedRow({ dateLabel, onReflect }: { dateLabel: string; onReflect?: () => void }) {
  const { tr } = useLanguage();
  // tabIndex -1: focus lands here when the install sheet closes over the button that opened it.
  return (
    <div className="sealrow" data-testid="observed-row" tabIndex={-1}>
      <ObservedStamp dateLabel={dateLabel} />
      <div>
        <p>{tr("almanac.observedNote")}</p>
        {onReflect && <button type="button" className="link" onClick={onReflect}>{tr("almanac.addThought")}</button>}
      </div>
    </div>
  );
}

import { useLanguage } from "@/contexts/LanguageContext";
import { fill } from "./format";
import singingCirclePhoto from "@/assets/photos/singing-circle.webp";

/**
 * The Calendar page's look back at the festival, above its events by day. The heading is a page
 * heading when the festival is the page, and a section heading under anything upcoming.
 */
export function HappenedHead({ count, sub = false }: { count: number; sub?: boolean }) {
  const { tr } = useLanguage();
  return (
    <section className={`happened${sub ? " happened--sub" : ""}`} data-testid="calendar-happened">
      <div className="happened__words">
        <h2 className="h2 happened__title">{tr("almanac.happenedTitle")}</h2>
        <p className="lede">{fill(tr("almanac.happenedLede"), { n: count })}</p>
        {!sub && <p className="small">{tr("almanac.happenedNext")}</p>}
      </div>
      {!sub && (
        <figure className="happened__photo">
          <img src={singingCirclePhoto} alt={tr("almanac.happenedPhotoAlt")} width={1400} height={933} />
        </figure>
      )}
    </section>
  );
}

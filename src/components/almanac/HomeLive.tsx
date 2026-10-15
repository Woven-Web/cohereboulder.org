import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCompanionToday } from "@/lib/useCompanionToday";
import { companionEvents } from "@/lib/api";
import { useMyEvents } from "@/lib/myEvents";
import { currentDenverDate } from "@/lib/companion";
import { dayNumber, formatDay, practiceDoneDays } from "@/lib/festival";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { BOARD_POSTS_QUERY_KEY, fetchPosts, postPath, splitFeed } from "@/lib/board";
import { UpcomingEventsHome } from "@/components/UpcomingEventsHome";
import { RegistrationAction } from "@/components/RegistrationAction";
import { HexTrail } from "./HexTrail";
import { YourNextStrip, type NextItem } from "./YourNextStrip";
import { seatOf } from "./seat";
import { fill } from "./format";
import readingQuestionsPhoto from "@/assets/photos/reading-questions.webp";
import hatConversationPhoto from "@/assets/photos/hat-conversation.webp";
import { isEcoLook } from "@/lib/look";

/**
 * Home, once the app is the point (signed in, or the gathering is on): today's
 * practice and question, the trail, your next event and the newest Board posts,
 * each one a way into Today, Calendar or Board.
 */
export function HomeLive({ signedIn }: { signedIn: boolean }) {
  const { tr, language } = useLanguage();
  const today = currentDenverDate();
  const { data } = useCompanionToday();
  const events = useQuery({ queryKey: ["companion-events"], queryFn: companionEvents, retry: 1 });
  const mine = useMyEvents(events.data);
  const access = useCircleAccess();
  const member = access.status === "member";
  const posts = useQuery({ queryKey: [...BOARD_POSTS_QUERY_KEY, access.collective ?? ""], queryFn: () => fetchPosts(access.collective ?? ""), enabled: member, staleTime: 15_000 });
  const latest = splitFeed(posts.data ?? []).roots.slice(0, 3);
  const pick = (en?: string, es?: string) => (language === "es" ? es || en || "" : en || "");
  const daily = data?.daily;
  const n = dayNumber(today);
  const next: NextItem[] = mine.items
    .filter((i) => i.event.status !== "cancelled" && i.event.startsAt && Date.parse(i.event.endsAt ?? i.event.startsAt) > Date.now())
    .map((i) => ({ event: i.event, seat: seatOf(i) }));

  return (
    <section className="homelive" data-testid="home-live">
      <p className="folio">{n >= 1 && n <= 11 ? `${fill(tr("almanac.dayOf"), { n })} · ` : ""}{formatDay(today, language)}</p>
      <h1 className="h1 homelive__title">{tr("look.home.title")}</h1>
      {/* Signed out the one ask stays within reach, above the fold; signed in, your next event takes its place. */}
      {signedIn
        ? <YourNextStrip items={next} total={mine.items.length} today={today} />
        : <RegistrationAction className="btn btn--primary homelive__register" anonymousKey="hero.registerHere" />}
      {isEcoLook() ? (
        <figure className="plate plate--hero">
          <img src={hatConversationPhoto} alt={tr("photos.hatConversation")} width={1600} height={907} />
        </figure>
      ) : null}
      <HexTrail variant="fit" today={today} done={practiceDoneDays()} />
      <UpcomingEventsHome />
      <div className={`homelive__cols${member && latest.length > 0 ? "" : " homelive__cols--one"}`}>
        <div className="homelive__main">
          <div className="eyebrow">{tr("almanac.practiceEyebrow")}</div>
          {daily ? <>
            <h2 className="h2 practice__title">{pick(daily.title, daily.title_es)}</h2>
            <p className="practice__body whitespace-pre-wrap">{pick(daily.body, daily.body_es)}</p>
            {daily.question && <blockquote className="question__q">{pick(daily.question, daily.question_es)}</blockquote>}
          </> : <p className="lede">{tr("look.home.noPractice")}</p>}
          <Link className="list-link" to="/today"><span>{tr("look.home.openToday")}</span><span aria-hidden="true">→</span></Link>
        </div>
        {member && latest.length > 0 && (
        <div className="homelive__side">
          {(
            <section className="homeboard" aria-labelledby="homeboard-h">
              <div className="eyebrow" id="homeboard-h">{tr("look.home.latestBoard")}</div>
              <ul>
                {latest.map((post) => (
                  <li key={post.uri}>
                    <Link to={postPath(post)}>
                      <b>{access.nameOf(post.author)}</b>
                      <span>{post.record.title || post.record.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link className="list-link" to="/board"><span>{tr("look.home.openBoard")}</span><span aria-hidden="true">→</span></Link>
            </section>
          )}
        </div>
        )}
      </div>
    </section>
  );
}

/** Before the gathering, or signed out: the trail and what Today will be, under the hero. */
export function HomePreview() {
  const { tr } = useLanguage();
  return (
    <section className="homepreview" aria-labelledby="homepreview-h" data-testid="home-preview">
      <h2 className="h2" id="homepreview-h">{tr("look.home.previewTitle")}</h2>
      <p className="lede">{tr("look.home.previewBody")}</p>
      <HexTrail variant="fit" today={currentDenverDate()} done={[]} />
      <Link className="list-link" to="/today"><span>{tr("look.home.seeToday")}</span><span aria-hidden="true">→</span></Link>
      <img className="photo" src={readingQuestionsPhoto} alt={tr("photos.readingQuestions")} loading="lazy" width={1600} height={884} />
    </section>
  );
}

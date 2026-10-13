import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink } from "lucide-react";
import { RegistrationAction } from "@/components/RegistrationAction";
import { SuggestAdditionForm } from "@/components/SuggestAdditionForm";
import { UpcomingEventsHome } from "@/components/UpcomingEventsHome";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWide } from "@/hooks/useWide";
import { useLook } from "@/lib/look";
import { AlmanacShell } from "./AlmanacShell";
import { EcoRidges } from "./EcoRidges";
import { HomeLive, HomePreview } from "./HomeLive";
import { duringGathering } from "./format";
import { Ridgeline } from "./Folio";
// Stills from the two Woven Web films — real gatherings, not stock imagery.
import gatheringPhoto from "@/assets/photos/gathering.webp";
import altarPhoto from "@/assets/photos/altar.webp";
import coCreatingPhoto from "@/assets/photos/co-creating.webp";
import singingCirclePhoto from "@/assets/photos/singing-circle.webp";
// Eileen's photos (ecology look).
import hatConversationPhoto from "@/assets/photos/hat-conversation.webp";
import tableCirclePhoto from "@/assets/photos/table-circle.webp";
import eveningGatheringPhoto from "@/assets/photos/evening-gathering.webp";

const Hex = () => <span className="hexmark" aria-hidden="true" />;

/**
 * The homepage in the Almanac look (?look=almanac). Same copy, same photos,
 * same sections and the same single call to action as the classic page; only
 * the dress changes: paper ground, ruled sections, Newsreader, a ridgeline and
 * a few hexagons.
 */
export function AlmanacHome({ signedIn }: { signedIn: boolean }) {
  const { tr } = useLanguage();
  const wide = useWide();
  const eco = useLook() === "ecology";
  const live = eco && (signedIn || duringGathering());
  const cta = `btn ${signedIn ? "btn--line" : "btn--primary"} btn--block`;

  return (
    <AlmanacShell site ridges={false}>
      <main className="page home">
        {live && <HomeLive signedIn={signedIn} />}
        {!live && <section className="home__hero">
          <p className="eyebrow">{tr("hero.themeLabel")}</p>
          <h1 className="home__title">[CO]<i>here</i></h1>
          <p className="home__theme">{tr("hero.theme")}</p>
          <p className="lede home__tagline">{tr("hero.tagline")}</p>
          {eco && <EcoRidges variant="hero" />}

          <div className="regcard">
            <h2 className="folio">{tr("hero.mainEvent")}</h2>
            <p className="regcard__dates mono">{tr("hero.dates")}</p>
            <p className="small">{tr("hero.tenDayContainer")}</p>
            {/* A week out, registering is the one call to action here; the
                email-only subscribe lives in the footer. */}
            <RegistrationAction className={cta} anonymousKey="hero.registerHere" />
          </div>

          {/* Eileen's first big photo, under the registration card (beside it on wide screens). Not lazy: it is the hero. */}
          {eco && (
            <figure className="plate plate--hero">
              <img src={hatConversationPhoto} alt={tr("photos.hatConversation")} width={1600} height={907} fetchPriority="high" />
            </figure>
          )}

          {/* The film still and the one-line description sit lower under the ecology look. */}
          {!eco && <>
            <figure className="plate">
              <img src={gatheringPhoto} alt="Community members gathering during COhere Boulder" width={1280} height={720} />
            </figure>
            <p className="lede home__desc">{tr("hero.description")}</p>
          </>}
        </section>}
        {eco && !live && <HomePreview />}

        {!live && <Ridgeline minutes={11 * 60} rise={7 * 60} set={18 * 60} wide={wide} label={tr("look.ridgeline")} />}

        {/* What's coming up - real events, hidden entirely when there are none.
            HomeLive carries its own, between the trail and the practice. */}
        {!live && <UpcomingEventsHome />}

        {/* What is COhere. The ecology look says it once and shows the gathering. */}
        <section className="band">
          <h2 className="h2">{tr("whatIs.title")}</h2>
          {eco ? (
            <div className="cols cols--even">
              <div className="stack">
                <p className="lede">{tr("whatIs.p1")}</p>
                <p>{tr("whatIs.p2")}</p>
              </div>
              <img className="photo" src={tableCirclePhoto} alt={tr("photos.tableCircle")} loading="lazy" width={1600} height={836} />
            </div>
          ) : (
            <div className="band__prose">
              <p className="lede">{tr("whatIs.p1")}</p>
              <p>{tr("whatIs.p2")}</p>
              <p>{tr("whatIs.p3")}</p>
            </div>
          )}
        </section>

        {/* This year's theme, stated over the land it comes from (the ecology hero already says it in words) */}
        <figure className="plate plate--theme">
          <img src={altarPhoto} alt="An altar of feathers, fruit, stone and candlelight on a woven blanket" loading="lazy" width={1280} height={720} />
          {!eco && <figcaption>
            <span className="folio">{tr("hero.themeLabel")}</span>
            <span className="plate__big">{tr("hero.theme")}</span>
          </figcaption>}
        </figure>

        {/* The Community Calendar - co-created, not programmed */}
        <section className="band cols cols--even">
          {eco
            ? <img className="photo" src={eveningGatheringPhoto} alt={tr("photos.eveningGathering")} loading="lazy" width={1600} height={864} />
            : <img className="photo" src={coCreatingPhoto} alt="People gathered around a table of printed event listings" loading="lazy" width={1280} height={720} />}
          <div className="stack">
            <h2 className="h2">{tr("communityCalendar.title")}</h2>
            <p className="lede home__sub">{tr("communityCalendar.subtitle")}</p>
            {/* Under the ecology look Choose-your-adventure carries the "calendar the community builds" line, so this keeps the second paragraph. */}
            {!eco && <p>{tr("communityCalendar.p1")}</p>}
            <p>{tr("communityCalendar.p2")}</p>
            <div className="home__acts">
              <Link className="btn btn--primary" to="/calendar">{tr("communityCalendar.explore")}</Link>
              <Link className="btn btn--line" to="/co-create">{tr("nav.participate")} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          </div>
        </section>

        {/* Choose your own adventure */}
        <section className="band">
          <div className="cols cols--even">
            <div className="stack">
              <h2 className="h2">{tr("chooseAdventure.title")}</h2>
              <p className="lede">{tr("chooseAdventure.p1")}</p>
              {!eco && <p>{tr("chooseAdventure.p2")}</p>}
            </div>
            <img className="photo" src={singingCirclePhoto} alt="People standing arm in arm, singing together from song sheets" loading="lazy" width={1280} height={720} />
          </div>
          {/* Three depths of involvement — pick the one that fits this year */}
          <ul className="depths">
            {["participate", "contribute", "lead"].map((key) => (
              <li key={key}>
                <h3 className="h3"><Hex />{tr(`chooseAdventure.${key}.title`)}</h3>
                <p>{tr(`chooseAdventure.${key}.description`)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* COhere Videos */}
        <section className="band">
          <h2 className="h2">{tr("videos.title")}</h2>
          <p className="lede">{tr("videos.description")}</p>
          <div className="cols cols--even films">
            {[
              { id: "lgDT45Te-lE", title: tr("videos.filmTitle") },
              { id: "wMDpVsSGY5M", title: tr("videos.recap2024Title") },
            ].map((film) => (
              <figure key={film.id}>
                <div className="film">
                  <iframe
                    src={`https://www.youtube.com/embed/${film.id}`}
                    title={film.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <figcaption className="small">{film.title}</figcaption>
              </figure>
            ))}
          </div>
          <p>{tr("videos.summary")}</p>
        </section>

        {/* The Spirit of COhere */}
        <section className="band">
          <h2 className="h2">{tr("spirit.title")}</h2>
          <ul className="depths">
            {["participation", "interdependence", "abundance"].map((key) => (
              <li key={key}>
                <h3 className="h3"><Hex />{tr(`spirit.${key}.title`)}</h3>
                <p>{tr(`spirit.${key}.description`)}</p>
              </li>
            ))}
          </ul>
          <blockquote className="pull">{tr("spirit.quote")}</blockquote>
        </section>

        {/* Boulder's Regenerative Ecosystem */}
        <section className="band">
          <h2 className="h2">{tr("ecosystem.title")}</h2>
          <div className="mapframe">
            <iframe src={`${import.meta.env.BASE_URL}Ecosystem.pdf`} title="Boulder Regenerative Ecosystem Map" loading="lazy" />
          </div>
          <p>{tr("ecosystem.description")}</p>
          <div className="home__acts">
            <a className="btn btn--line" href={`${import.meta.env.BASE_URL}Ecosystem.pdf`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {tr("ecosystem.exploreMap")}
            </a>
            <SuggestAdditionForm />
          </div>
        </section>

        {/* Join the Weaving */}
        <section className="band band--close">
          <h2 className="h2">{tr("join.title")}</h2>
          <p className="lede">{tr("join.p1")}</p>
          <p className="lede">{tr("join.p2")}</p>
          <RegistrationAction className={`${cta} home__last`} anonymousKey="hero.registerHere" />
        </section>
      </main>
    </AlmanacShell>
  );
}

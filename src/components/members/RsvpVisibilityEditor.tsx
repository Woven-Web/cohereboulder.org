import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { fill } from "@/components/almanac/format";
import { MEMBER_RSVPS_KEY, MY_PROFILE_RSVPS_KEY, useRsvpVisibility } from "@/hooks/useRsvpVisibility";
import { fetchMemberRsvps, fetchMyProfileRsvps, type RsvpVisibilityMode } from "@/lib/api";
import { formatDay } from "@/lib/festival";
import { denverDateKey } from "@/lib/events";
import { ProfileRsvpList } from "./ProfileRsvpList";

/** "Who sees my RSVPs" in the profile editor: the setting, each RSVP with a hide toggle, and a live preview. */
export function RsvpVisibilityEditor({ did }: { did: string }) {
  const { tr, language } = useLanguage();
  const { visibility, setMode, setHidden } = useRsvpVisibility(true);
  const mine = useQuery({ queryKey: MY_PROFILE_RSVPS_KEY, queryFn: fetchMyProfileRsvps, staleTime: 15_000, retry: 1 });
  const preview = useQuery({ queryKey: [...MEMBER_RSVPS_KEY, did], queryFn: () => fetchMemberRsvps(did), staleTime: 0, retry: 1 });
  const mode = visibility?.mode ?? mine.data?.visibility.mode ?? "members";
  const nobody = mode === "nobody";
  const pick = (next: RsvpVisibilityMode) => next !== mode && setMode.mutate(next);

  return (
    <section id="rsvps" style={{ marginTop: "2rem" }} aria-labelledby="rsvps-title" data-testid="rsvp-visibility">
      <h2 className="h2" id="rsvps-title">{tr("members.rsvp.editorTitle")}</h2>
      <p className="lede" style={{ color: "var(--ink-2)", margin: ".4rem 0 .8rem" }}>{tr("members.rsvp.editorLede")}</p>

      <div className="mode" role="group" aria-label={tr("members.rsvp.editorTitle")}>
        {(["members", "nobody"] as const).map((value) => (
          <button type="button" key={value} aria-pressed={mode === value} data-testid={`rsvp-mode-${value}`} disabled={setMode.isPending} onClick={() => pick(value)}>
            <span className="mode__dot" aria-hidden="true" />
            <span><b>{tr(`members.rsvp.${value}`)}</b><small>{tr(`members.rsvp.${value}Help`)}</small></span>
          </button>
        ))}
      </div>
      {setMode.isError && <p className="field__error" style={{ display: "block" }} role="alert">{tr("members.rsvp.saveFailed")}</p>}

      <h3 className="eyebrow" style={{ marginTop: "1.4rem" }}>{tr("members.rsvp.mineHeading")}</h3>
      {mine.isLoading ? (
        <p className="small" role="status">{tr("members.loading")}</p>
      ) : mine.isError ? (
        <p className="small">{tr("members.rsvp.mineError")}</p>
      ) : mine.data && mine.data.rsvps.length === 0 ? (
        <p className="small">{tr("members.rsvp.mineNone")}</p>
      ) : (
        <ul className="going-list" style={{ listStyle: "none", padding: 0 }}>
          {mine.data?.rsvps.map((rsvp) => {
            const day = denverDateKey(rsvp.startsAt);
            return (
              <li key={rsvp.uri} className="vis" data-testid="my-rsvp" data-hidden={rsvp.hidden}>
                <div>
                  <b className="ev__title">{rsvp.name}</b>
                  {day && <p>{formatDay(day, language)}</p>}
                </div>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={rsvp.hidden || nobody}
                  disabled={nobody || setHidden.isPending}
                  aria-label={fill(tr("members.rsvp.hideOneLabel"), { name: rsvp.name })}
                  onClick={() => setHidden.mutate({ uri: rsvp.uri, hidden: !rsvp.hidden })}
                >
                  {tr(rsvp.hidden || nobody ? "members.rsvp.hiddenOne" : "members.rsvp.hideOne")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="eyebrow" style={{ marginTop: "1.4rem" }}>{tr("members.rsvp.preview")}</h3>
      <div data-testid="rsvp-preview" aria-live="polite">
        {preview.isLoading ? <p className="small" role="status">{tr("members.loading")}</p>
          : preview.isError ? <p className="small">{tr("members.rsvp.profileError")}</p>
          : preview.data && preview.data.rsvps.length ? <ProfileRsvpList rsvps={preview.data.rsvps} />
          : <p className="small">{tr("members.rsvp.previewNone")}</p>}
      </div>

      <p className="note">{tr("members.rsvp.honest")}</p>
      <p className="note" style={{ borderTop: "none", marginTop: ".4rem", paddingTop: 0 }}>{tr("members.rsvp.emailNote")}</p>
    </section>
  );
}

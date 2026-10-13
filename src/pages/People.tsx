import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { fill } from "@/components/almanac/format";
import { Avatar } from "@/components/members/Avatar";
import { MembersGate } from "@/components/members/MembersGate";
import { MembersNav } from "@/components/members/MembersNav";
import { SourceMark } from "@/components/members/SourceMark";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchMemberProfileExtras, type ExtraKey } from "@/lib/api";
import { EXTRA_KEYS, PEOPLE_EXTRAS_KEY, entryName, matchesSearch } from "@/lib/people";

export default function People() {
  return (
    <AlmanacShell>
      <PeopleView />
    </AlmanacShell>
  );
}

function PeopleView() {
  const { tr } = useLanguage();
  const access = useCircleAccess();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const member = access.status === "member";
  const entries = access.directory.data;
  const fieldParam = params.get("in");
  const field = EXTRA_KEYS.find((key) => key === fieldParam) ?? null;
  // The extra lines are a nicety: if they can't be read, People still works without them.
  const extrasQuery = useQuery({ queryKey: PEOPLE_EXTRAS_KEY, queryFn: fetchMemberProfileExtras, enabled: member, staleTime: 30_000, retry: 1 });
  const extras = extrasQuery.data?.extras;
  const setSearch = (next: { q?: string; field?: ExtraKey | null }) => {
    const nq = next.q ?? q;
    const nf = next.field === undefined ? field : next.field;
    setParams({ ...(nq ? { q: nq } : {}), ...(nf ? { in: nf } : {}) }, { replace: true });
  };

  const shown = useMemo(
    () => (entries ?? [])
      .map((entry) => ({ entry, name: entryName(entry, access.nameOf(entry.author)) }))
      .filter(({ entry, name }) => matchesSearch(entry, name, q, extras?.[entry.author], field))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // nameOf closes over the roster and directory, both of which change `entries`
    // or the roster identity; recompute when either does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, q, field, extras, access.roster],
  );
  const publicCount = shown.filter(({ entry }) => entry.profileSource === "publicFallback").length;

  let body;
  if (access.directory.isLoading) body = <p className="small" role="status" style={{ padding: "2rem 0" }}>{tr("members.loading")}</p>;
  else if (access.directory.isError) {
    body = <div className="gate"><p className="lede">{tr("members.loadError")}</p><button type="button" className="btn btn--line btn--sm" onClick={() => access.directory.refetch()}>{tr("members.retry")}</button></div>;
  } else if (!entries?.length) {
    body = (
      <div className="empty"><span className="empty__mark" aria-hidden="true" />
        <h2 className="h3">{tr("members.people.noneTitle")}</h2><p className="small">{tr("members.people.noneBody")}</p>
        <Link className="btn btn--primary" to="/profile">{tr("members.people.makeMine")}</Link></div>
    );
  } else if (!shown.length) {
    body = (
      <div className="empty" style={{ marginTop: ".6rem" }}><span className="empty__mark" aria-hidden="true" />
        <h2 className="h3">{tr("members.people.emptyTitle")}</h2>
        <p className="small">{fill(tr("members.people.emptyBody"), { q: q || (field ? tr(`members.extras.${field}`) : "") })}</p>
        <button type="button" className="link" onClick={() => setParams({}, { replace: true })}>{tr("members.people.clear")}</button></div>
    );
  } else {
    body = (
      <div className="people-grid" data-testid="people-list">
        {shown.map(({ entry, name }) => (
          <Link key={entry.author} className="row row--person" to={`/people/${encodeURIComponent(entry.author)}`} data-testid="person-row">
            <Avatar did={entry.author} name={name} ghost={entry.profileSource === "publicFallback"} />
            <div style={{ minWidth: 0 }}>
              <div className="row__title">{name}{entry.author === access.did && <span className="badge" style={{ marginLeft: ".3rem" }}>{tr("members.people.you")}</span>}</div>
              <div className="row__line" style={entry.profileSource === "publicFallback" ? { fontStyle: "italic", color: "var(--ink-2)" } : undefined}>
                {entry.record.bio || tr("members.people.noBio")}
              </div>
              {EXTRA_KEYS.map((key) => extras?.[entry.author]?.[key] ? (
                <div className="row__line" key={key} data-testid={`line-${key}`}><b>{tr(`members.extras.${key}`)}</b> {extras[entry.author][key]}</div>
              ) : null)}
              <div className="row__src"><SourceMark source={entry.profileSource} /></div>
            </div>
            <span className="row__end" aria-hidden="true">&rarr;</span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <main className="page">
      <div className="folio"><span>{tr("members.folio")}</span></div>
      <h1 className="h1" style={{ margin: ".2rem 0 .1rem" }}>{tr("members.people.title")}</h1>
      {!member ? (
        <MembersGate status={access.status as Exclude<typeof access.status, "member">} onRetry={access.retry} />
      ) : (
        <>
          <MembersNav current="people" />
          <p className="lede" style={{ color: "var(--ink-2)", margin: ".6rem 0 .9rem", maxWidth: "36rem" }}>{tr("members.people.lede")}</p>
          <div className="search">
            <label className="sr" htmlFor="q">{tr("members.people.search")}</label>
            <Search size={18} aria-hidden="true" />
            <input className="field__input" id="q" type="search" value={q} autoComplete="off" placeholder={tr("members.people.placeholder")}
              onChange={(e) => setSearch({ q: e.target.value })} />
          </div>
          <div role="group" aria-label={tr("members.people.filterBy")} style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: ".5rem" }}>
            {EXTRA_KEYS.map((key) => (
              <button type="button" key={key} className="chip" aria-pressed={field === key} data-testid={`chip-${key}`} onClick={() => setSearch({ field: field === key ? null : key })}>
                {tr(`members.extras.${key}`)}
              </button>
            ))}
          </div>
          {entries?.length ? (
            <div className="people-count" style={{ marginTop: ".4rem", borderBottom: "var(--rule-heavy)" }} aria-live="polite">
              <span>{shown.length === 1 ? tr("members.people.countOne") : fill(tr("members.people.count"), { n: shown.length })}</span>
              <span>{publicCount ? fill(tr("members.people.publicCount"), { n: publicCount }) : ""}</span>
            </div>
          ) : null}
          {body}
          <p className="note">
            <b>{tr("members.people.noteCohereLabel")}</b> {tr("members.people.noteCohere")} <b>{tr("members.people.notePublicLabel")}</b> {tr("members.people.notePublic")}
          </p>
        </>
      )}
    </main>
  );
}

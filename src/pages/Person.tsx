import { Link, useParams } from "react-router-dom";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { Avatar } from "@/components/members/Avatar";
import { MembersGate } from "@/components/members/MembersGate";
import { MembersNav } from "@/components/members/MembersNav";
import { SourceMark } from "@/components/members/SourceMark";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { useLanguage } from "@/contexts/LanguageContext";
import { entryName, linkLabel, safeLink } from "@/lib/people";

export default function Person() {
  return (
    <AlmanacShell>
      <PersonView />
    </AlmanacShell>
  );
}

function PersonView() {
  const { tr } = useLanguage();
  const { did = "" } = useParams();
  const access = useCircleAccess();
  const member = access.status === "member";
  const entry = access.entryOf(did);
  const mine = Boolean(access.did) && did === access.did;
  const name = entry ? entryName(entry, access.nameOf(did)) : access.nameOf(did);
  const links = (entry?.record.links ?? []).flatMap((href) => {
    const safe = safeLink(href);
    return safe ? [safe] : [];
  });

  let body;
  if (!member) body = <MembersGate status={access.status as Exclude<typeof access.status, "member">} onRetry={access.retry} />;
  else if (access.directory.isLoading) body = <p className="small" role="status" style={{ padding: "2rem 0" }}>{tr("members.loading")}</p>;
  else if (!entry) {
    body = (
      <div className="empty" style={{ marginTop: "1rem" }} data-testid="person-missing"><span className="empty__mark" aria-hidden="true" />
        <h1 className="h3">{tr(mine ? "members.people.makeMine" : "members.people.notHereTitle")}</h1>
        <p className="small">{tr(mine ? "members.people.mineEmpty" : "members.people.notHereBody")}</p>
        {mine && <Link className="btn btn--primary" to="/profile">{tr("members.people.makeMine")}</Link>}
      </div>
    );
  } else {
    body = (
      <article data-testid="person" className="profile">
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "1rem" }}>
          <Avatar did={did} name={name} size="lg" ghost={entry.profileSource === "publicFallback"} />
          <div style={{ minWidth: 0 }}>
            <h1 className="h2" style={{ overflowWrap: "anywhere" }}>{name}</h1>
            <SourceMark source={entry.profileSource} />
          </div>
        </div>
        {entry.profileSource === "publicFallback" && <p className="small" style={{ marginTop: ".8rem", fontStyle: "italic" }}>{tr("members.people.publicSays")}</p>}
        <p className="lede" style={{ marginTop: "1rem", whiteSpace: "pre-line" }}>{entry.record.bio || tr("members.people.noBio")}</p>
        {links.length > 0 && (
          <section style={{ marginTop: "1rem" }}>
            <h2 className="eyebrow">{tr("members.people.links")}</h2>
            <div className="linkrow">
              {links.map((href) => <a key={href} href={href} target="_blank" rel="noopener noreferrer nofollow">{linkLabel(href)}</a>)}
            </div>
          </section>
        )}
        {mine && <p style={{ marginTop: "1.2rem" }}><Link className="btn btn--line btn--sm" to="/profile">{tr("members.people.editMine")}</Link></p>}
        <p className="vis-note" style={{ marginTop: "1.4rem" }}><span><b>{tr("members.people.privacy")}</b></span></p>
      </article>
    );
  }

  return (
    <main className="page">
      <Link className="link" to="/people">&larr; {tr("members.people.back")}</Link>
      {member && <MembersNav current={mine ? "me" : "people"} />}
      {body}
    </main>
  );
}

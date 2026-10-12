import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { BottomSheet } from "@/components/almanac/BottomSheet";
import { useShell } from "@/components/almanac/shell-context";
import { fill } from "@/components/almanac/format";
import { MembersGate } from "@/components/members/MembersGate";
import { MembersNav } from "@/components/members/MembersNav";
import { SourceMark } from "@/components/members/SourceMark";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { useLanguage } from "@/contexts/LanguageContext";
import { BIO_MAX, LINKS_MAX, NAME_MAX, PEOPLE_QUERY_KEY, cleanLinks, deleteProfile, graphemes, putProfile } from "@/lib/people";

export default function ProfileEdit() {
  return (
    <AlmanacShell>
      <EditView />
    </AlmanacShell>
  );
}

function EditView() {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const queryClient = useQueryClient();
  const access = useCircleAccess();
  const member = access.status === "member";
  const collective = access.collective ?? "";
  const mine = access.did ? access.entryOf(access.did) : undefined;

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Start from what members already see — their COhere profile, or the public one they'd begin from.
  useEffect(() => {
    if (seeded || !member || access.directory.isLoading) return;
    setName(mine?.record.displayName ?? "");
    setBio(mine?.record.bio ?? "");
    setLinks(mine?.record.links?.length ? mine.record.links : [""]);
    setSeeded(true);
  }, [seeded, member, access.directory.isLoading, mine]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: PEOPLE_QUERY_KEY });
  const save = useMutation({
    mutationFn: () => {
      const cleaned = cleanLinks(links);
      return putProfile(collective, { displayName: name, bio, links: cleaned.links });
    },
    onSuccess: async () => { await refresh(); toast(tr("members.profile.saved")); },
    onError: () => toast(tr("members.profile.saveFailed")),
  });
  const usePublic = useMutation({
    mutationFn: () => deleteProfile(collective),
    onSuccess: async () => { setConfirmPublic(false); await refresh(); setSeeded(false); toast(tr("members.profile.usePublicDone")); },
    onError: () => toast(tr("members.profile.saveFailed")),
  });

  function submit() {
    const { rejected } = cleanLinks(links);
    if (!name.trim()) { setProblem(tr("members.profile.needName")); return; }
    if (graphemes(name) > NAME_MAX || graphemes(bio) > BIO_MAX) return;
    if (rejected.length) { setProblem(fill(tr("members.profile.linkBad"), { bad: rejected.join(", ") })); return; }
    setProblem(null);
    save.mutate();
  }

  const nameOver = graphemes(name) > NAME_MAX;
  const bioOver = graphemes(bio) > BIO_MAX;
  const onPublic = mine?.profileSource === "publicFallback";

  return (
    <main className="page editor">
      <div className="folio"><span>{tr("members.folio")}</span></div>
      <h1 className="h1" style={{ margin: ".2rem 0 .1rem" }}>{tr("members.profile.title")}</h1>
      {!member ? (
        <MembersGate status={access.status as Exclude<typeof access.status, "member">} onRetry={access.retry} />
      ) : (
        <>
          <MembersNav current="me" />
          <p className="lede" style={{ color: "var(--ink-2)", margin: ".6rem 0" }}>{tr("members.profile.lede")}</p>
          {mine && <p style={{ margin: ".2rem 0 .8rem" }}><SourceMark source={mine.profileSource} /></p>}

          <div className="mode" role="group" aria-label={tr("members.profile.mode")}>
            <button type="button" aria-pressed={!onPublic} data-testid="mode-cohere">
              <span className="mode__dot" aria-hidden="true" /><span><b>{tr("members.profile.modeCohere")}</b><small>{tr("members.profile.modeCohereHelp")}</small></span>
            </button>
            <button type="button" aria-pressed={onPublic} data-testid="mode-public" onClick={() => !onPublic && setConfirmPublic(true)}>
              <span className="mode__dot" aria-hidden="true" /><span><b>{tr("members.profile.modePublic")}</b><small>{tr("members.profile.modePublicHelp")}</small></span>
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <div className={`field${problem === tr("members.profile.needName") ? " has-error" : ""}`}>
              <label className="field__label" htmlFor="pf-name">{tr("members.profile.name")}</label>
              <input className="field__input" id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <p className="field__help">{tr("members.profile.nameHelp")}</p>
              <div className={`counter${nameOver ? " is-over" : ""}`}>{fill(tr("members.profile.nameCount"), { n: graphemes(name) })}</div>
              <p className="field__error">{tr("members.profile.needName")}</p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="pf-bio">{tr("members.profile.bio")}</label>
              <textarea className="field__input" id="pf-bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
              <div className={`counter${bioOver ? " is-over" : ""}`} data-testid="bio-count">{fill(tr("members.profile.bioCount"), { n: graphemes(bio) })}</div>
            </div>
            <div className="field">
              <span className="field__label" id="pf-links">{tr("members.profile.linksLabel")}</span>
              <p className="field__help">{tr("members.profile.linksHelp")}</p>
              {links.map((value, i) => (
                <div key={i} style={{ display: "flex", gap: ".5rem", marginTop: ".4rem" }}>
                  <input className="field__input" aria-labelledby="pf-links" inputMode="url" placeholder="https://" value={value}
                    onChange={(e) => setLinks((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))} />
                  <button type="button" className="btn btn--quiet btn--sm" aria-label={fill(tr("members.profile.removeLink"), { n: i + 1 })}
                    onClick={() => setLinks((cur) => (cur.length > 1 ? cur.filter((_, j) => j !== i) : [""]))}>&times;</button>
                </div>
              ))}
              {links.length < LINKS_MAX && (
                <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setLinks((cur) => [...cur, ""])}>{tr("members.profile.addLink")}</button>
              )}
            </div>
            <p className="small" style={{ fontStyle: "italic", marginTop: ".6rem" }}>{tr("members.profile.photo")}</p>
            {problem && <p className="field__error" style={{ display: "block", marginTop: ".6rem" }} role="alert">{problem}</p>}
            <p className="vis-note" style={{ margin: "1rem 0" }}><span><b>{tr("members.people.privacy")}</b></span></p>
            <button type="submit" className="btn btn--primary btn--block" disabled={save.isPending || nameOver || bioOver} aria-busy={save.isPending}>
              {tr(save.isPending ? "members.profile.saving" : "members.profile.save")}
            </button>
            {access.did && <p style={{ marginTop: ".8rem", textAlign: "center" }}><Link className="link" to={`/people/${encodeURIComponent(access.did)}`}>{tr("members.profile.viewMine")}</Link></p>}
          </form>

          <BottomSheet open={confirmPublic} onOpenChange={setConfirmPublic} title={tr("members.profile.usePublicTitle")} description={tr("members.profile.usePublicBody")}>
            <button type="button" className="btn btn--primary btn--block" disabled={usePublic.isPending} onClick={() => usePublic.mutate()}>{tr("members.profile.usePublicYes")}</button>
            <button type="button" className="btn btn--quiet btn--block" onClick={() => setConfirmPublic(false)}>{tr("members.profile.keep")}</button>
          </BottomSheet>
        </>
      )}
    </main>
  );
}

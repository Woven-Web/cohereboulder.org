import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { useShell } from "@/components/almanac/shell-context";
import { MembersGate } from "@/components/members/MembersGate";
import { MembersNav } from "@/components/members/MembersNav";
import { PostCard } from "@/components/members/PostCard";
import { ComposeSheet, DeleteSheet, ReportSheet } from "@/components/members/BoardSheets";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { useLanguage } from "@/contexts/LanguageContext";
import { BOARD_POSTS_QUERY_KEY, BOARD_TAGS, fetchPosts, groupByDay, splitFeed, tagCounts, tagLabel, type BoardPost } from "@/lib/board";
import { currentDenverDate } from "@/lib/companion";
import { formatDay } from "@/lib/festival";

export default function Board() {
  return (
    <AlmanacShell>
      <BoardView />
    </AlmanacShell>
  );
}

function dayLabel(day: string, language: "en" | "es", tr: (key: string) => string): string {
  const today = currentDenverDate();
  if (day === today) return tr("members.board.today");
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  if (day === yesterday) return tr("members.board.yesterday");
  return day ? formatDay(day, language) : "";
}

function BoardView() {
  const { tr, language } = useLanguage();
  const { setHasBar } = useShell();
  const queryClient = useQueryClient();
  const access = useCircleAccess();
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag");
  const member = access.status === "member";
  const collective = access.collective ?? "";

  const posts = useQuery({
    queryKey: [...BOARD_POSTS_QUERY_KEY, collective],
    queryFn: () => fetchPosts(collective),
    enabled: member,
    staleTime: 15_000,
  });
  const [composing, setComposing] = useState(false);
  const [deleting, setDeleting] = useState<BoardPost | null>(null);
  const [reporting, setReporting] = useState<BoardPost | null>(null);

  useEffect(() => {
    setHasBar(member);
    return () => setHasBar(false);
  }, [member, setHasBar]);

  const { roots, replyCounts } = useMemo(() => splitFeed(posts.data ?? []), [posts.data]);
  const counts = useMemo(() => tagCounts(roots), [roots]);
  const shown = tag ? roots.filter((p) => p.record.tags?.includes(tag)) : roots;
  const refresh = () => queryClient.invalidateQueries({ queryKey: BOARD_POSTS_QUERY_KEY });
  const setTag = (next: string | null) => setParams(next ? { tag: next } : {}, { replace: true });

  const chip = (value: string | null, label: string, n: number) => (
    <button type="button" key={value ?? "all"} className="chip" aria-pressed={tag === value} onClick={() => setTag(value)}>
      {label}<span className="count">{n}</span>
    </button>
  );

  let body;
  if (posts.isLoading) body = <p className="small" role="status" style={{ padding: "2rem 0" }}>{tr("members.loading")}</p>;
  else if (posts.isError) {
    body = (
      <div className="gate"><p className="lede">{tr("members.loadError")}</p>
        <button type="button" className="btn btn--line btn--sm" onClick={() => posts.refetch()}>{tr("members.retry")}</button></div>
    );
  } else if (roots.length === 0) {
    body = (
      <div className="empty" data-testid="board-empty"><span className="empty__mark" aria-hidden="true" />
        <h2 className="h3">{tr("members.board.emptyTitle")}</h2>
        <p className="lede" style={{ color: "var(--ink-2)" }}>{tr("members.board.emptyBody")}</p>
        <button type="button" className="btn btn--primary" onClick={() => setComposing(true)}>{tr("members.board.emptyFirst")}</button></div>
    );
  } else if (shown.length === 0) {
    body = (
      <div className="empty"><span className="empty__mark" aria-hidden="true" />
        <h2 className="h3">{tr("members.board.noMatchTitle")}</h2>
        <p className="small">{tr("members.board.noMatchBody")}</p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setComposing(true)}>{tr("members.board.write")}</button>
          <button type="button" className="link" onClick={() => setTag(null)}>{tr("members.board.showAll")}</button></div></div>
    );
  } else {
    body = groupByDay(shown).map((group) => (
      <section className="daygroup" style={{ marginTop: "1.6rem" }} key={group.day}>
        <div className="eyebrow">{dayLabel(group.day, language, tr)}</div>
        {group.posts.map((post) => (
          <PostCard key={post.uri} post={post} clip name={access.nameOf(post.author)} mine={post.author === access.did}
            replyCount={replyCounts.get(post.uri) ?? 0}
            onDelete={() => setDeleting(post)} onReport={() => setReporting(post)} />
        ))}
      </section>
    ));
  }

  return (
    <main className="page">
      <div className="folio" style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <span>{tr("members.folio")}</span>
      </div>
      <h1 className="h1" style={{ margin: ".2rem 0 .1rem" }}>{tr("members.board.title")}</h1>
      {!member ? (
        <MembersGate status={access.status as Exclude<typeof access.status, "member">} onRetry={access.retry} />
      ) : (
        <>
        <MembersNav current="board" />
        <div className="board" style={{ marginTop: ".6rem" }}>
          <aside className="board__side" aria-label={tr("members.board.filter")}>
            <div className="eyebrow">{tr("members.board.filter")}</div>
            <div className="hscroll" role="group" aria-label={tr("members.board.filterByTag")}>
              {chip(null, tr("members.board.everything"), roots.length)}
              {BOARD_TAGS.map((t) => chip(t, `#${tagLabel(t, language)}`, counts.get(t) ?? 0))}
            </div>
            <button type="button" className="btn btn--primary btn--block only-wide" style={{ marginTop: "1.2rem" }} onClick={() => setComposing(true)}>{tr("members.board.write")}</button>
            <p className="vis-note only-wide" style={{ marginTop: ".8rem" }}><span><b>{tr("members.visible")}</b> {tr("members.board.sideNote")}</span></p>
          </aside>
          <div className="board__feed" data-testid="board-feed">{body}</div>
        </div>
        </>
      )}
      {member && (
        <>
          <div className="actionbar phone-only"><button type="button" className="btn btn--primary" onClick={() => setComposing(true)}>{tr("members.board.write")}</button></div>
          <ComposeSheet open={composing} onOpenChange={setComposing} collective={collective} onPosted={refresh} />
          <DeleteSheet open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)} collective={collective} post={deleting} onDeleted={refresh} />
          <ReportSheet open={reporting !== null} onOpenChange={(open) => !open && setReporting(null)} post={reporting} />
        </>
      )}
    </main>
  );
}


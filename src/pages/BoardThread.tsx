import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { useShell } from "@/components/almanac/shell-context";
import { fill } from "@/components/almanac/format";
import { MembersGate } from "@/components/members/MembersGate";
import { PostCard } from "@/components/members/PostCard";
import { DeleteSheet, ReportSheet } from "@/components/members/BoardSheets";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { useLanguage } from "@/contexts/LanguageContext";
import { BOARD_POSTS_QUERY_KEY, createPost, fetchThread, threadReplies, type BoardPost } from "@/lib/board";

export default function BoardThread() {
  return (
    <AlmanacShell>
      <ThreadView />
    </AlmanacShell>
  );
}

function ThreadView() {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const queryClient = useQueryClient();
  const { did: authorDid = "", rkey = "" } = useParams();
  const access = useCircleAccess();
  const member = access.status === "member";
  const collective = access.collective ?? "";
  const rootUri = `at://${authorDid}/coop.lexicon.post/${rkey}`;
  const threadKey = ["board-thread", collective, rootUri];

  const thread = useQuery({ queryKey: threadKey, queryFn: () => fetchThread(collective, rootUri), enabled: member, staleTime: 10_000 });
  const [text, setText] = useState("");
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState<BoardPost | null>(null);
  const [reporting, setReporting] = useState<BoardPost | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: threadKey });
    queryClient.invalidateQueries({ queryKey: BOARD_POSTS_QUERY_KEY });
  };
  const root = thread.data?.find((p) => p.uri === rootUri) ?? null;
  const replies = thread.data ? threadReplies(thread.data, rootUri) : [];

  const send = useMutation({
    mutationFn: () => {
      if (!root) throw new Error("no root");
      const ref = { uri: root.uri, cid: root.cid };
      return createPost(collective, { text, lang: root.record.langs?.[0] ?? "en", reply: { root: ref, parent: ref } });
    },
    onSuccess: () => { setText(""); refresh(); toast(tr("members.board.replyPosted")); },
    onError: () => toast(tr("members.board.postFailed")),
  });

  const back = <Link className="link" to="/board">&larr; {tr("members.board.back")}</Link>;

  let body;
  if (!member) body = <MembersGate status={access.status as Exclude<typeof access.status, "member">} onRetry={access.retry} />;
  else if (thread.isLoading) body = <p className="small" role="status" style={{ padding: "2rem 0" }}>{tr("members.loading")}</p>;
  else if (thread.isError) {
    body = <div className="gate"><p className="lede">{tr("members.loadError")}</p><button type="button" className="btn btn--line btn--sm" onClick={() => thread.refetch()}>{tr("members.retry")}</button></div>;
  } else if (!root) {
    body = (
      <div className="empty" style={{ marginTop: "1rem" }} data-testid="thread-gone"><span className="empty__mark" aria-hidden="true" />
        <h1 className="h3">{tr("members.board.goneTitle")}</h1><p className="small">{tr("members.board.goneBody")}</p></div>
    );
  } else {
    body = (
      <>
        <PostCard post={root} root name={access.nameOf(root.author)} mine={root.author === access.did}
          onDelete={() => setDeleting(root)} onReport={() => setReporting(root)} />
        <div className="eyebrow" style={{ marginTop: ".6rem" }}>
          {replies.length ? fill(tr(replies.length > 1 ? "members.board.replyMany" : "members.board.replyOne"), { n: replies.length }) : tr("members.board.replies")}
        </div>
        {replies.length ? replies.map(({ post, parent }) => (
          <PostCard key={post.uri} post={post} reply={{ parentName: parent ? access.nameOf(parent.author) : null }} name={access.nameOf(post.author)}
            mine={post.author === access.did} onDelete={() => setDeleting(post)} onReport={() => setReporting(post)} />
        )) : <p className="small" style={{ padding: "1rem 0" }}>{tr("members.board.noReplies")}</p>}
        <form className="replybox" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) { setMissing(true); return; } send.mutate(); }}>
          <div className={`field${missing ? " has-error" : ""}`}>
            <label className="field__label" htmlFor="rt">{tr("members.board.reply_label")}</label>
            <textarea className="field__input" id="rt" rows={3} value={text} onChange={(e) => { setText(e.target.value); setMissing(false); }} />
            <p className="field__error" role={missing ? "alert" : undefined}>{tr("members.board.needText")}</p>
          </div>
          <p className="vis-note"><span><b>{tr("members.visible")}</b></span></p>
          <button type="submit" className="btn btn--primary btn--block" disabled={send.isPending}>{tr("members.board.postReply")}</button>
        </form>
        <DeleteSheet open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)} collective={collective} post={deleting}
          onDeleted={(post) => { if (post.uri === rootUri) window.history.back(); else refresh(); }} />
        <ReportSheet open={reporting !== null} onOpenChange={(open) => !open && setReporting(null)} post={reporting} />
      </>
    );
  }

  return <main className="page">{back}{body}</main>;
}

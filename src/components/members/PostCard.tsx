import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { fill } from "@/components/almanac/format";
import { postPath, rkeyOf, tagLabel, type BoardPost } from "@/lib/board";
import { Avatar } from "./Avatar";

function timeOf(iso: string, language: "en" | "es"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }).format(d);
}

interface Props {
  post: BoardPost;
  name: string;
  mine: boolean;
  /** Root post in the feed: title links to the thread, text is clamped. */
  clip?: boolean;
  /** Root post at the top of a thread page. */
  root?: boolean;
  /** A reply inside a thread. */
  reply?: { parentName: string | null };
  replyCount?: number;
  /** Shown as plain text (not a link) when on the thread page itself. */
  onDelete?: () => void;
  onReport?: () => void;
}

/** One post or reply, with Report on others' and Delete on your own. */
export function PostCard({ post, name, mine, clip, root, reply, replyCount = 0, onDelete, onReport }: Props) {
  const { tr, language } = useLanguage();
  const { record } = post;
  const lang = record.langs?.[0];
  const mark = post.cohereModeration;
  const classes = reply
    ? `thread-reply${reply.parentName ? " thread-reply--nested" : ""}${mine ? " post--own" : ""}`
    : `post${mine ? " post--own" : ""}${clip ? " post--clip" : ""}${root ? " post--root" : ""}`;
  const Heading = root ? "h1" : "h2";

  return (
    <article className={classes} id={rkeyOf(post.uri)} data-testid={reply ? "board-reply" : "board-post"} data-moderation={mark}>
      <div className="post__by">
        <Avatar did={post.author} name={name} size="sm" />
        <b data-you={tr("members.board.you")}>{name}</b>
        <time dateTime={record.createdAt}>{timeOf(record.createdAt, language)}</time>
      </div>
      {mark && (
        <p className="vis-note" data-testid="mod-mark">
          <span><b>{tr(mark === "hidden" ? "members.board.markHidden" : mark === "removed" ? "members.board.markRemoved" : "members.board.markPending")}</b></span>
        </p>
      )}
      {reply?.parentName && <div className="thread-reply__to">{tr("members.board.replyingTo")} {reply.parentName}</div>}
      {record.title && (
        <Heading className="post__title">
          {root || reply ? record.title : <Link to={postPath(post)}>{record.title}</Link>}
        </Heading>
      )}
      <p className="post__text" {...(lang && lang !== language ? { lang } : {})}>{record.text}</p>
      <div className="post__foot">
        <span className="hash">{(record.tags ?? []).map((t) => `#${tagLabel(t, language)}`).join(" ")}</span>
        {!root && !reply && (
          <Link className="link" to={postPath(post)}>
            {replyCount ? fill(tr(replyCount > 1 ? "members.board.replyMany" : "members.board.replyOne"), { n: replyCount }) : tr("members.board.reply")}
          </Link>
        )}
        {mine && onDelete && <button type="button" className="link" onClick={onDelete}>{tr("members.board.delete")}</button>}
        {!mine && onReport && <button type="button" className="link" onClick={onReport}>{tr("members.board.report")}</button>}
      </div>
    </article>
  );
}

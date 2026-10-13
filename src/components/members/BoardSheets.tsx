import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BottomSheet } from "@/components/almanac/BottomSheet";
import { useShell } from "@/components/almanac/shell-context";
import { fill } from "@/components/almanac/format";
import { useLanguage } from "@/contexts/LanguageContext";
import { XrpcError } from "@/lib/regenos";
import {
  BOARD_TAGS, POST_TEXT_MAX, POST_TITLE_MAX, REPORT_NOTE_MAX, REPORT_REASONS, createPost, deletePost, excerptOf, reportPost,
  tagLabel, type BoardPost, type NewPost, type ReportReason,
} from "@/lib/board";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeSheet({ open, onOpenChange, collective, onPosted }: SheetProps & { collective: string; onPosted: () => void }) {
  const { tr, language } = useLanguage();
  const { toast } = useShell();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [lang, setLang] = useState<"en" | "es">(language);
  const [missing, setMissing] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: NewPost) => createPost(collective, input),
    onSuccess: () => {
      setTitle(""); setText(""); setTags([]);
      onOpenChange(false);
      onPosted();
      toast(tr("members.board.posted"));
    },
    onError: () => toast(tr("members.board.postFailed")),
  });

  function submit() {
    if (!text.trim()) { setMissing(true); return; }
    mutation.mutate({ text, title, tags, lang });
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={tr("members.compose.title")}>
      <form className="stack" style={{ marginTop: ".8rem" }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="field">
          <label className="field__label" htmlFor="c-title">{tr("members.compose.titleLabel")}</label>
          <input className="field__input" id="c-title" maxLength={POST_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("members.compose.titlePlaceholder")} />
        </div>
        <div className={`field${missing ? " has-error" : ""}`}>
          <label className="field__label" htmlFor="c-text">{tr("members.compose.textLabel")}</label>
          <textarea className="field__input" id="c-text" rows={5} maxLength={POST_TEXT_MAX} value={text} aria-invalid={missing} aria-describedby="c-text-err"
            onChange={(e) => { setText(e.target.value); setMissing(false); }} />
          <p className="field__error" id="c-text-err" role={missing ? "alert" : undefined}>{tr("members.board.needText")}</p>
        </div>
        <div>
          <div className="field__label" id="c-tags">{tr("members.compose.tags")}</div>
          <div className="chips" role="group" aria-labelledby="c-tags" style={{ marginTop: ".4rem" }}>
            {BOARD_TAGS.map((tag) => (
              <button type="button" key={tag} className="chip" aria-pressed={tags.includes(tag)}
                onClick={() => setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]))}>
                #{tagLabel(tag, language)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="field__label" id="c-lang">{tr("members.compose.language")}</div>
          <div className="seg" role="group" aria-labelledby="c-lang" style={{ marginTop: ".4rem", maxWidth: "14rem" }}>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
            <button type="button" aria-pressed={lang === "es"} onClick={() => setLang("es")}>Español</button>
          </div>
        </div>
        <p className="vis-note"><span><b>{tr("members.visible")}</b> {tr("members.compose.note")}</span></p>
        <button type="submit" className="btn btn--primary btn--block" disabled={mutation.isPending} aria-busy={mutation.isPending}>
          {tr(mutation.isPending ? "members.compose.posting" : "members.compose.submit")}
        </button>
        <button type="button" className="btn btn--quiet btn--block" onClick={() => onOpenChange(false)}>{tr("members.compose.cancel")}</button>
      </form>
    </BottomSheet>
  );
}

export function DeleteSheet({ open, onOpenChange, collective, post, onDeleted }: SheetProps & { collective: string; post: BoardPost | null; onDeleted: (post: BoardPost) => void }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const mutation = useMutation({
    mutationFn: (target: BoardPost) => deletePost(collective, target.uri),
    onSuccess: (_, target) => { onOpenChange(false); onDeleted(target); toast(tr("members.board.deleted")); },
    onError: () => toast(tr("members.board.deleteFailed")),
  });
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={tr("members.del.title")} description={tr("members.del.body")}>
      <button type="button" className="btn btn--primary btn--block" disabled={!post || mutation.isPending} onClick={() => post && mutation.mutate(post)}>{tr("members.del.yes")}</button>
      <button type="button" className="btn btn--quiet btn--block" onClick={() => onOpenChange(false)}>{tr("members.del.keep")}</button>
    </BottomSheet>
  );
}

/** What a report is about: a Board post, or any `{uri, excerpt}` (a harvest). */
export interface ReportTarget {
  uri: string;
  excerpt: string;
}

export function ReportSheet({ open, onOpenChange, post, target }: SheetProps & { post?: BoardPost | null; target?: ReportTarget | null }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const mutation = useMutation({
    mutationFn: (subject: ReportTarget) => reportPost({ uri: subject.uri, reason: reason as ReportReason, note: note.trim() || undefined, excerpt: subject.excerpt }),
    onSuccess: () => { setReason(null); setNote(""); onOpenChange(false); toast(tr("members.report.thanks")); },
    onError: (err) => toast(tr(err instanceof XrpcError && err.status === 429 ? "members.report.tooMany" : "members.report.failed")),
  });
  function submit() {
    if (!reason) { setMissing(true); return; }
    const subject = target ?? (post ? { uri: post.uri, excerpt: excerptOf(post) } : null);
    if (subject) mutation.mutate(subject);
  }
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={tr("members.report.title")} description={tr("members.report.lede")}>
      <form className="stack" style={{ marginTop: ".8rem" }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className={`field${missing ? " has-error" : ""}`}>
          <div className="field__label" id="rp-reason">{tr("members.report.reason")}</div>
          <div className="chips" role="group" aria-labelledby="rp-reason" style={{ marginTop: ".4rem" }}>
            {REPORT_REASONS.map((r) => (
              <button type="button" key={r} className="chip" aria-pressed={reason === r} onClick={() => { setReason(r); setMissing(false); }}>{tr(`members.report.${r}`)}</button>
            ))}
          </div>
          <p className="field__error" role={missing ? "alert" : undefined}>{tr("members.report.needReason")}</p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="rp-note">{tr("members.report.note")}</label>
          <textarea className="field__input" id="rp-note" rows={3} maxLength={REPORT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="counter">{fill(tr("members.report.noteCount"), { n: note.length })}</div>
        </div>
        <button type="submit" className="btn btn--primary btn--block" disabled={mutation.isPending}>{tr("members.report.submit")}</button>
        <button type="button" className="btn btn--quiet btn--block" onClick={() => onOpenChange(false)}>{tr("members.compose.cancel")}</button>
      </form>
    </BottomSheet>
  );
}

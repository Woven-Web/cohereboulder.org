// "RSVP · remind me" on an event's detail page.
//
// Signed in on regenOS (the lane is on and getSession has a DID): RSVP on
// regenOS itself through the /xrpc proxy — social.scenius.rsvp, read back
// via getEventAttendance.mySeat. regenOS reminds those people itself (24h and
// 1h before), so we say so and send nothing.
//
// Anonymous: an inline name + email form posting to /api/rsvp
// (worker/src/rsvps.ts), which confirms by email and reminds the morning
// before. With the lane on, a secondary link opens the nav's sign-in dialog.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openSignInDialog } from "@/lib/signin";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { createEmailRsvp } from "@/lib/api";
import { fetchMySeat, rsvpOnRegenos } from "@/lib/regenos";
import type { CommunityEvent } from "@/lib/events";

export function EventRsvp({ event }: { event: CommunityEvent }) {
  const { tr } = useLanguage();
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session, isLoading: sessionLoading } = useRegenosSession(laneOn);
  const signedIn = laneOn && Boolean(session?.did);

  // ScrollToTop resets to the top on navigation; bring an #rsvp arrival
  // (from an event card) to the panel once it's on screen.
  useEffect(() => {
    if (window.location.hash !== "#rsvp") return;
    const timer = window.setTimeout(() => document.getElementById("rsvp")?.scrollIntoView({ block: "center" }), 50);
    return () => window.clearTimeout(timer);
  }, []);

  // Only events that haven't started yet and aren't cancelled take RSVPs.
  const upcoming =
    Boolean(event.startsAt) && event.status !== "cancelled" && new Date(event.startsAt ?? 0).getTime() > Date.now();
  if (!upcoming) return null;

  return (
    <section
      id="rsvp"
      aria-labelledby="rsvp-title"
      className="mb-8 rounded-lg border border-primary/30 bg-primary/5 p-5 scroll-mt-24"
      data-testid="event-rsvp"
    >
      <h2 id="rsvp-title" className="flex items-center gap-2 text-lg font-semibold text-foreground mb-3">
        <BellRing className="h-5 w-5 text-primary" aria-hidden />
        {tr("calendar.rsvp.title")}
      </h2>
      {laneOn && sessionLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      ) : signedIn ? (
        <RegenosRsvp event={event} />
      ) : (
        <EmailRsvpForm event={event} offerSignIn={laneOn} />
      )}
    </section>
  );
}

function RegenosRsvp({ event }: { event: CommunityEvent }) {
  const { tr } = useLanguage();
  const queryClient = useQueryClient();
  const key = ["regenos-my-seat", event.did, event.rkey];
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => fetchMySeat(event.did, event.rkey),
    staleTime: 30 * 1000,
  });
  const mutation = useMutation({
    mutationFn: (intent: "going" | "notgoing") =>
      rsvpOnRegenos(event.did, event.rkey, intent, data?.attendance ?? "approval"),
    onSuccess: (state) => {
      queryClient.setQueryData(key, { seat: state, attendance: data?.attendance ?? "approval" });
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />;

  const seat = data?.seat ?? null;
  const active = seat === "confirmed" || seat === "requested" || seat === "waitlisted";
  const statusLine =
    seat === "confirmed" ? tr("calendar.rsvp.going") : seat === "requested" ? tr("calendar.rsvp.requested") : tr("calendar.rsvp.waitlisted");

  return (
    <div className="space-y-3">
      {active ? (
        <>
          <Button variant="going" title={tr("calendar.events.cancelHint")} aria-label={`${seat === "confirmed" ? tr("calendar.events.cardGoing") : statusLine}. ${tr("calendar.events.cancelHint")}`} className="h-11 min-w-[88px] px-4 w-full lg:w-auto shadow-none" data-testid="rsvp-state" disabled={mutation.isPending} onClick={() => mutation.mutate("notgoing")}>
            {seat === "confirmed" && <Check className="h-4 w-4" aria-hidden />}
            {seat === "confirmed" ? tr("calendar.events.cardGoing").replace(/^✓ /, "") : statusLine}
          </Button>
          <p className="text-sm text-muted-foreground">{tr("calendar.rsvp.reminderNote")}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("notgoing")}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {tr("calendar.rsvp.cancelRsvp")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{tr("calendar.rsvp.reminderNote")}</p>
          <Button
            variant="rsvp"
            className="h-11 min-w-[88px] px-4 w-full lg:w-auto gap-2"
            disabled={mutation.isPending || isError}
            onClick={() => mutation.mutate("going")}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {tr("calendar.rsvp.button")}
          </Button>
        </>
      )}
      <p className="text-sm text-muted-foreground">{tr("membership.visible")}</p>
      {(mutation.isError || isError) && <p className="text-sm text-destructive">{tr("calendar.rsvp.error")}</p>}
    </div>
  );
}

function EmailRsvpForm({ event, offerSignIn }: { event: CommunityEvent; offerSignIn: boolean }) {
  const { tr, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [result, setResult] = useState<"done" | "already" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arriving from an event card's "RSVP · remind me" (…#rsvp) opens the form.
  useEffect(() => {
    if (window.location.hash === "#rsvp") setOpen(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { already } = await createEmailRsvp({
        did: event.did,
        rkey: event.rkey,
        email: email.trim(),
        name: name.trim() || undefined,
        language,
        website,
      });
      setResult(already ? "already" : "done");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : tr("calendar.rsvp.error"));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-1" role="status" data-testid="rsvp-done">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
          {tr("calendar.rsvp.doneTitle")}
        </p>
        <p className="text-sm text-muted-foreground">
          {result === "already" ? tr("calendar.rsvp.alreadyBody") : tr("calendar.rsvp.doneBody")}
        </p>
      </div>
    );
  }

  const signInLink = offerSignIn && (
    <button type="button" onClick={openSignInDialog} className="text-sm text-primary hover:underline">
      {tr("calendar.rsvp.orSignIn")}
    </button>
  );

  if (!open) {
    return (
      <div className="space-y-2">
        <Button variant="rsvp" className="h-11 min-w-[88px] px-4 w-full lg:w-auto gap-2" onClick={() => setOpen(true)}>
          {tr("calendar.rsvp.button")}
        </Button>
        <p className="text-sm text-muted-foreground">{tr("calendar.rsvp.emailHint")}</p>
        {signInLink}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="rsvp-form">
      <p className="text-sm text-muted-foreground">{tr("calendar.rsvp.emailIntro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rsvp-name">{tr("calendar.rsvp.nameLabel")}</Label>
          <Input id="rsvp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rsvp-email">{tr("calendar.rsvp.emailLabel")}</Label>
          <Input
            id="rsvp-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="rsvp-website">Website</label>
        <input
          id="rsvp-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="rsvp" disabled={busy} className="h-11 min-w-[88px] px-4 w-full lg:w-auto gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? tr("calendar.rsvp.sending") : tr("calendar.rsvp.submit")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {tr("calendar.rsvp.cancelForm")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{tr("calendar.rsvp.privacy")}</p>
      {signInLink}
    </form>
  );
}

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { LumaCalendar } from "@/components/LumaCalendar";
import { RegenosSignInPanel } from "@/components/RegenosSignInPanel";
import { CommunityEventForm } from "@/components/CommunityEventForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarPlus, Clock, Loader2, LogOut, MapPin, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { useInvalidateRegenosSession, useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { describeWriteError, signOut, xrpcPost } from "@/lib/regenos";
import { buildDeleteEventInput } from "@/lib/eventForm";
import {
  eventPath,
  fetchCommunityCalendar,
  formatEventDate,
  formatEventTimeRange,
  locationLine,
  type CommunityEvent,
} from "@/lib/events";

/** The statuses worth a badge; anything else renders as a plain event. */
const BADGED_STATUSES = new Set(["cancelled", "postponed", "rescheduled"]);

/** The modes we have words for; an unknown upstream fragment renders no badge. */
const KNOWN_MODES = new Set(["inperson", "virtual", "hybrid"]);

function EventCard({ event }: { event: CommunityEvent }) {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);

  const date = formatEventDate(event.startsAt, language);
  const time = formatEventTimeRange(event.startsAt, event.endsAt, language);
  const where = locationLine(event.location);
  const badged = event.status && BADGED_STATUSES.has(event.status);
  const cancelled = event.status === "cancelled";

  return (
    <Link to={eventPath(event)} className="block group">
      <Card className="hover:shadow-warm transition-shadow">
        <CardHeader className="pb-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {date ?? tr("calendar.events.undated")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle
              className={`text-xl group-hover:underline ${cancelled ? "line-through opacity-70" : ""}`}
            >
              {event.name}
            </CardTitle>
            {badged && (
              <Badge variant={cancelled ? "destructive" : "secondary"}>
                {tr(`calendar.events.status.${event.status}`)}
              </Badge>
            )}
            {event.mode && event.mode !== "inperson" && KNOWN_MODES.has(event.mode) && (
              <Badge variant="outline">{tr(`calendar.events.mode.${event.mode}`)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {time && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              {time}
            </p>
          )}
          {where && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              {where}
            </p>
          )}
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
              {event.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function CalendarPage() {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["community-calendar"],
    queryFn: fetchCommunityCalendar,
  });

  // The regenOS hosting lane — entirely absent until the Worker's
  // REGENOS_LOGIN_ENABLED flag is on (useSiteConfig reads /api/config), so
  // this page renders its pre-phase-2 self by default.
  const { data: config } = useSiteConfig();
  const hostingOn = config?.regenosLoginEnabled === true;
  const { data: session } = useRegenosSession(hostingOn);
  const invalidateSession = useInvalidateRegenosSession();
  const signedIn = Boolean(session?.did);

  /** Which host surface is open: the sign-in panel, the create form, or an edit. */
  const [panel, setPanel] = useState<"none" | "signIn" | "create">("none");
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [deletingRkey, setDeletingRkey] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  /**
   * Whether to OFFER manage controls: their own events, or anything on the
   * collective's calendar. The AppView re-decides on every write (Builder+ of
   * the authority), so this is a courtesy, not a gate — an over-offer ends in
   * the honest "ask the organizers" message, never a silent failure.
   */
  const canManage = (event: CommunityEvent): boolean =>
    signedIn && (event.did === session?.did || event.did === config?.collectiveDid);

  async function handleDelete(event: CommunityEvent) {
    if (!window.confirm(tr("calendar.host.confirmDelete"))) return;
    setDeletingRkey(event.rkey);
    setManageError(null);
    try {
      await xrpcPost(
        "social.scenius.deleteEvent",
        buildDeleteEventInput({ authority: event.did, rkey: event.rkey }),
      );
      if (editing?.rkey === event.rkey) setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["community-calendar"] });
    } catch (err) {
      setManageError(describeWriteError(err, tr));
    } finally {
      setDeletingRkey(null);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // The cookie may already be gone; re-asking below settles it either way.
    }
    setPanel("none");
    setEditing(null);
    invalidateSession();
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              {tr("calendar.events.title")}
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {tr("calendar.events.subtitle")}
            </p>
          </div>

          {/* Propose an event — no account needed, lands in the organizers'
              approval queue. Kept in the header area, separate from the
              subscribe/hosting controls below. */}
          <Card className="max-w-2xl mx-auto mb-10 border-dashed">
            <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <Sparkles className="h-6 w-6 text-primary shrink-0" aria-hidden="true" />
              <p className="text-sm text-muted-foreground flex-1">{tr("calendar.proposeCallout.text")}</p>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/propose">{tr("calendar.proposeCallout.button")}</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Hosting — only exists when the regenOS lane is enabled. */}
          {hostingOn && (
            <div className="mb-10 space-y-4">
              {signedIn ? (
                <>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {tr("calendar.host.signedInAs")}{" "}
                      <span className="font-medium text-foreground">
                        {session?.handle ?? session?.did}
                      </span>
                    </p>
                    {/* No collective DID means nothing to create an event
                        under — the form below would never render, so don't
                        offer a button that does nothing. */}
                    {panel !== "create" && !editing && config?.collectiveDid && (
                      <Button
                        variant="community"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          setEditing(null);
                          setPanel("create");
                        }}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        {tr("calendar.host.addEvent")}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-2" onClick={handleSignOut}>
                      <LogOut className="h-4 w-4" />
                      {tr("calendar.host.signOut")}
                    </Button>
                  </div>
                  {panel === "create" && config?.collectiveDid && (
                    <CommunityEventForm
                      authority={config.collectiveDid}
                      event={null}
                      onDone={() => setPanel("none")}
                      onCancel={() => setPanel("none")}
                    />
                  )}
                  {editing && (
                    <CommunityEventForm
                      authority={editing.did}
                      event={editing}
                      onDone={() => setEditing(null)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                  {manageError && (
                    <p className="text-sm text-destructive text-center">{manageError}</p>
                  )}
                </>
              ) : panel === "signIn" ? (
                <RegenosSignInPanel />
              ) : (
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {tr("calendar.host.signInPrompt")}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setPanel("signIn")}>
                    {tr("calendar.host.signInButton")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <p className="text-center text-muted-foreground py-16">
              {tr("calendar.events.loading")}
            </p>
          ) : data?.source === "regenos" ? (
            <>
              {data.icsUrl && (
                <div className="text-center mb-8">
                  <Button asChild variant="community" size="lg" className="gap-2">
                    <a href={data.icsUrl}>
                      <CalendarPlus className="h-4 w-4" />
                      {tr("calendar.events.subscribe")}
                    </a>
                  </Button>
                </div>
              )}
              <div className="max-w-3xl mx-auto space-y-6">
                {data.events.map((event) => (
                  <div key={`${event.did}/${event.rkey}`}>
                    <EventCard event={event} />
                    {canManage(event) && (
                      <div className="flex justify-end gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            setPanel("none");
                            setEditing(event);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {tr("calendar.host.editButton")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 text-destructive"
                          disabled={deletingRkey === event.rkey}
                          onClick={() => handleDelete(event)}
                        >
                          {deletingRkey === event.rkey ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          {tr("calendar.host.deleteButton")}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <LumaCalendar />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

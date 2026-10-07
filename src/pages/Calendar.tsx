import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { LumaCalendar } from "@/components/LumaCalendar";
import { RegenosSignInPanel } from "@/components/RegenosSignInPanel";
import { CommunityEventForm } from "@/components/CommunityEventForm";
import { EventCard } from "@/components/EventCard";
import { CalendarMonthView } from "@/components/CalendarMonthView";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarPlus, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { describeWriteError, fetchSceneRoster, xrpcPost } from "@/lib/regenos";
import { canHostScene } from "@/lib/hostAccess";
import { buildDeleteEventInput } from "@/lib/eventForm";
import { fetchCommunityCalendar, type CommunityEvent, denverDateKey } from "@/lib/events";

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
  const signedIn = Boolean(session?.did);
  const today = denverDateKey(new Date().toISOString())!;
  const tomorrow = denverDateKey(new Date(Date.now() + 86400000).toISOString());
  const todayEvents = today >= "2026-10-15" && today <= "2026-10-25"
    ? (data?.events ?? []).filter(event => [today, tomorrow].includes(denverDateKey(event.startsAt))) : [];
  const { data: roster } = useQuery({
    queryKey: ["scene-roster", config?.collectiveDid, session?.did],
    queryFn: () => fetchSceneRoster(config!.collectiveDid!),
    enabled: hostingOn && signedIn && Boolean(config?.collectiveDid),
    staleTime: 30_000,
  });
  const canHostCollective = canHostScene(session?.did ?? null, roster);
  const canCreate = hostingOn && signedIn && Boolean(config?.collectiveDid) && canHostCollective;

  /** Which host surface is open: the sign-in panel, the create form, or an edit. */
  const [panel, setPanel] = useState<"none" | "signIn" | "create">("none");
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [deletingRkey, setDeletingRkey] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  // The public "Propose an event" path is available to everyone. Only
  // builders and stewards of the collective see direct create/edit controls;
  // the AppView remains the final authority on writes.
  const canManage = (event: CommunityEvent): boolean =>
    signedIn && canHostCollective && (event.did === session?.did || event.did === config?.collectiveDid);

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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-12 [&_button]:min-h-11">
        <div className="max-w-[800px] mx-auto px-4">
          {/* Eileen, 2026-09-30: events come first. Only the title and the
              subscribe button sit above them; propose + hosting live below. */}
          <div className="text-center mb-8 space-y-4">
            <h1 className="text-4xl font-bold text-foreground">
              {tr("calendar.events.title")}
            </h1>
            {data?.source === "regenos" && data.icsUrl && (
              <CalendarSubscribe feedUrl={data.icsUrl} />
            )}
          </div>

          {/* A host's create/edit form stays on top: Edit scrolls here. */}
          {hostingOn && signedIn && (panel === "create" || editing) && (
            <div className="mb-10 space-y-4">
              {panel === "create" && config?.collectiveDid && canCreate && (
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
            </div>
          )}

          {isLoading ? (
            <p className="text-center text-muted-foreground py-16">
              {tr("calendar.events.loading")}
            </p>
          ) : data?.source === "regenos" ? (
            <>
              {todayEvents.length > 0 && (
                <section className="max-w-3xl mx-auto mb-10 space-y-4">
                  <h2 className="text-2xl font-bold">{tr("app.today")}</h2>
                  <p>{tr("app.todayBody")}</p>
                  {todayEvents.map(event => (
                    <EventCard key={`${event.did}/${event.rkey}`} event={event} />
                  ))}
                </section>
              )}
              <Tabs defaultValue="upcoming" className="max-w-3xl mx-auto">
                <TabsList className="mx-auto mb-6 grid h-auto w-full grid-cols-2 gap-1 p-1 border border-slate-400">
                  <TabsTrigger className="min-h-11 text-slate-600 data-[state=active]:font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="upcoming">{tr("calendar.events.tabUpcoming")}</TabsTrigger>
                  <TabsTrigger className="min-h-11 text-slate-600 data-[state=active]:font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="month">{tr("calendar.events.tabMonth")}</TabsTrigger>
                </TabsList>

                <TabsContent value="upcoming">
                  <div className="space-y-6">
                    {data.events.map((event) => (
                      <div key={`${event.did}/${event.rkey}`}>
                        <EventCard event={event} hostControls={canManage(event) && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-11 gap-2"
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
                              className="min-h-11 gap-2 text-destructive"
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
                          </>
                        )} />
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="month">
                  <CalendarMonthView events={data.events} />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <LumaCalendar />
          )}

          {/* Propose an event: no account needed, lands in the organizers'
              approval queue. */}
          {!canCreate && <Card className="w-full mx-auto mt-12">
            <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <Sparkles className="h-6 w-6 text-primary shrink-0" aria-hidden="true" />
              <p className="text-sm text-muted-foreground flex-1">{tr(signedIn ? "calendar.proposeCallout.signedInText" : "calendar.proposeCallout.text")}</p>
              <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0">
                <Link to="/propose">{tr("calendar.proposeCallout.button")}</Link>
              </Button>
            </CardContent>
          </Card>}

          {/* Hosting — only exists when the regenOS lane is enabled. */}
          {hostingOn && (
            <div className={signedIn ? "mt-12 space-y-4" : "mt-2 space-y-4"}>
              {signedIn ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* No collective DID means nothing to create an event
                        under — the form below would never render, so don't
                        offer a button that does nothing. */}
                    {panel !== "create" && !editing && canCreate && (
                      <Button
                        variant="community"
                        size="sm"
                        className="min-h-11 gap-2"
                        onClick={() => {
                          setEditing(null);
                          setPanel("create");
                        }}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        {tr("calendar.host.addEvent")}
                      </Button>
                    )}

                  </div>
                  {manageError && (
                    <p className="text-sm text-destructive text-center">{manageError}</p>
                  )}
                </>
              ) : panel === "signIn" ? (
                <RegenosSignInPanel />
              ) : (
                <div className="text-center space-y-2">
                  <span className="text-sm">{tr("calendar.proposeCallout.accountPrompt")}</span>{" "}
                  <Button variant="link" size="sm" className="min-h-11 px-1 underline font-semibold" onClick={() => setPanel("signIn")}>
                    {tr("calendar.proposeCallout.signIn")}
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}

// Accountless "propose an event" form: any community member can suggest
// something for the calendar without a regenOS sign-in — the whole point,
// since the organizers themselves only have email-link access to /admin, not
// regenOS accounts (see worker/src/regenos-service.ts). A submission lands as
// a `pending` row and an organizer approves or rejects it from the admin
// portal's Proposals tab; nothing here talks to regenOS directly.
//
// Field shapes and datetime handling mirror CommunityEventForm.tsx /
// src/lib/eventForm.ts (the signed-in host form) so the two stay consistent,
// but this posts to the public POST /api/events/propose route instead.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { proposeEvent } from "@/lib/api";
import { EMPTY_EVENT_FORM, localInputToIso, type EventFormValues, type EventMode } from "@/lib/eventForm";

const MODES: EventMode[] = ["inperson", "virtual", "hybrid"];

interface ProposerFields {
  proposerName: string;
  proposerEmail: string;
  /** Hidden honeypot — bots fill it, people never see it. */
  website: string;
}

const EMPTY_PROPOSER: ProposerFields = { proposerName: "", proposerEmail: "", website: "" };

const ProposeEvent = () => {
  const { tr } = useLanguage();

  const [form, setForm] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [proposer, setProposer] = useState<ProposerFields>(EMPTY_PROPOSER);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set<K extends keyof EventFormValues>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value as EventFormValues[K] }));
  }
  function setProposerField<K extends keyof ProposerFields>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setProposer((p) => ({ ...p, [key]: e.target.value }));
  }

  function resetForm() {
    setForm(EMPTY_EVENT_FORM);
    setProposer(EMPTY_PROPOSER);
    setDone(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const startsAt = localInputToIso(form.startsAt);
      if (!startsAt) {
        setError(tr("proposeEvent.genericError"));
        setSubmitting(false);
        return;
      }
      const endsAt = localInputToIso(form.endsAt);
      await proposeEvent({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        startsAt,
        endsAt: endsAt || undefined,
        mode: form.mode,
        placeName: form.placeName.trim() || undefined,
        street: form.street.trim() || undefined,
        locality: form.locality.trim() || undefined,
        region: form.region.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        proposerName: proposer.proposerName.trim() || undefined,
        proposerEmail: proposer.proposerEmail.trim() || undefined,
        website: proposer.website,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("proposeEvent.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold text-foreground">{tr("proposeEvent.title")}</h1>
            <p className="text-muted-foreground">{tr("proposeEvent.subtitle")}</p>
          </div>

          {done ? (
            <Card>
              <CardContent className="p-8 text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 mx-auto text-nature-green" />
                <h2 className="text-2xl font-semibold text-foreground">{tr("proposeEvent.successTitle")}</h2>
                <p className="text-muted-foreground">{tr("proposeEvent.successBody")}</p>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <Button asChild variant="community">
                    <Link to="/calendar">{tr("proposeEvent.backToCalendar")}</Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {tr("proposeEvent.proposeAnother")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Honeypot — hidden from people, catnip for bots. */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="propose-website">Website</label>
                    <input
                      id="propose-website"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={proposer.website}
                      onChange={setProposerField("website")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pe-name">{tr("proposeEvent.nameLabel")}</Label>
                    <Input id="pe-name" value={form.name} onChange={set("name")} required maxLength={200} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pe-description">{tr("proposeEvent.descriptionLabel")}</Label>
                    <Textarea
                      id="pe-description"
                      value={form.description}
                      onChange={set("description")}
                      rows={4}
                      maxLength={5000}
                    />
                    <p className="text-xs text-muted-foreground">{tr("proposeEvent.descriptionHelp")}</p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pe-starts">{tr("proposeEvent.startsLabel")}</Label>
                      <Input
                        id="pe-starts"
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={set("startsAt")}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pe-ends">{tr("proposeEvent.endsLabel")}</Label>
                      <Input id="pe-ends" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pe-mode">{tr("proposeEvent.modeLabel")}</Label>
                    <select
                      id="pe-mode"
                      value={form.mode}
                      onChange={set("mode")}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {tr(`calendar.events.mode.${mode}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pe-place">{tr("proposeEvent.placeLabel")}</Label>
                    <Input id="pe-place" value={form.placeName} onChange={set("placeName")} maxLength={200} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pe-street">{tr("proposeEvent.streetLabel")}</Label>
                    <Input id="pe-street" value={form.street} onChange={set("street")} maxLength={200} />
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pe-locality">{tr("proposeEvent.localityLabel")}</Label>
                      <Input id="pe-locality" value={form.locality} onChange={set("locality")} maxLength={100} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pe-region">{tr("proposeEvent.regionLabel")}</Label>
                      <Input id="pe-region" value={form.region} onChange={set("region")} maxLength={100} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pe-postal">{tr("proposeEvent.postalLabel")}</Label>
                      <Input id="pe-postal" value={form.postalCode} onChange={set("postalCode")} maxLength={20} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{tr("proposeEvent.addressNote")}</p>

                  <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div className="space-y-2 pt-4">
                      <Label htmlFor="pe-proposer-name">{tr("proposeEvent.proposerNameLabel")}</Label>
                      <Input
                        id="pe-proposer-name"
                        value={proposer.proposerName}
                        onChange={setProposerField("proposerName")}
                        maxLength={200}
                      />
                    </div>
                    <div className="space-y-2 pt-4">
                      <Label htmlFor="pe-proposer-email">{tr("proposeEvent.proposerEmailLabel")}</Label>
                      <Input
                        id="pe-proposer-email"
                        type="email"
                        value={proposer.proposerEmail}
                        onChange={setProposerField("proposerEmail")}
                        maxLength={320}
                      />
                      <p className="text-xs text-muted-foreground">{tr("proposeEvent.proposerEmailHelp")}</p>
                    </div>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    id="pe-submit"
                    type="submit"
                    variant="community"
                    disabled={submitting}
                    className="gap-2 w-full sm:w-auto"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? tr("proposeEvent.submitting") : tr("proposeEvent.submitButton")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ProposeEvent;

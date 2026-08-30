// The on-site event create/edit form, for signed-in hosts on the calendar
// page. Field set per community.lexicon.calendar.event; the payload shapes
// live in src/lib/eventForm.ts (see there for why edits resend everything and
// why the address face is "exact").
//
// Every write goes through the Worker's same-origin /xrpc proxy; the regenOS
// session cookie rides along by itself. The AppView re-decides permission on
// every write — creating under the collective needs Builder+ standing there,
// and a 403 gets the honest "ask the organizers" message, not a crash.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CommunityEvent } from "@/lib/events";
import { describeWriteError, xrpcPost } from "@/lib/regenos";
import {
  EMPTY_EVENT_FORM,
  buildCreateEventInput,
  buildUpdateEventInput,
  eventToFormValues,
  mintRkey,
  type EventFormValues,
  type EventMode,
} from "@/lib/eventForm";

const MODES: EventMode[] = ["inperson", "virtual", "hybrid"];

export function CommunityEventForm({
  authority,
  event,
  onDone,
  onCancel,
}: {
  /** For a NEW event: the collective DID. For an edit: unused (the event's own DID rules). */
  authority: string;
  /** The event being edited, or null for the create form. */
  event: CommunityEvent | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { tr } = useLanguage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EventFormValues>(
    event ? eventToFormValues(event) : EMPTY_EVENT_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof EventFormValues>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value as EventFormValues[K] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (event) {
        // An edit writes to the repo the event already lives in.
        await xrpcPost(
          "social.scenius.updateEvent",
          buildUpdateEventInput(form, { authority: event.did, rkey: event.rkey }),
        );
      } else {
        await xrpcPost(
          "social.scenius.createEvent",
          buildCreateEventInput(form, { authority, rkey: mintRkey() }),
        );
      }
      // The Worker drops its edge cache on a landed write; this drops ours.
      await queryClient.invalidateQueries({ queryKey: ["community-calendar"] });
      onDone();
    } catch (err) {
      setError(describeWriteError(err, tr));
    } finally {
      setSaving(false);
    }
  }

  const editing = event !== null;

  return (
    <Card className="max-w-3xl mx-auto">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">
              {editing ? tr("calendar.host.editEventTitle") : tr("calendar.host.newEventTitle")}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label={tr("calendar.host.cancelButton")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-name">{tr("calendar.host.nameLabel")}</Label>
            <Input id="ev-name" value={form.name} onChange={set("name")} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-description">{tr("calendar.host.descriptionLabel")}</Label>
            <Textarea
              id="ev-description"
              value={form.description}
              onChange={set("description")}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{tr("calendar.host.descriptionHelp")}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ev-starts">{tr("calendar.host.startsLabel")}</Label>
              <Input
                id="ev-starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={set("startsAt")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-ends">{tr("calendar.host.endsLabel")}</Label>
              <Input id="ev-ends" type="datetime-local" value={form.endsAt} onChange={set("endsAt")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-mode">{tr("calendar.host.modeLabel")}</Label>
            <select
              id="ev-mode"
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
            <Label htmlFor="ev-place">{tr("calendar.host.placeLabel")}</Label>
            <Input id="ev-place" value={form.placeName} onChange={set("placeName")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-street">{tr("calendar.host.streetLabel")}</Label>
            <Input id="ev-street" value={form.street} onChange={set("street")} />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ev-locality">{tr("calendar.host.localityLabel")}</Label>
              <Input id="ev-locality" value={form.locality} onChange={set("locality")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-region">{tr("calendar.host.regionLabel")}</Label>
              <Input id="ev-region" value={form.region} onChange={set("region")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-postal">{tr("calendar.host.postalLabel")}</Label>
              <Input id="ev-postal" value={form.postalCode} onChange={set("postalCode")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{tr("calendar.host.addressNote")}</p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" variant="community" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? tr("calendar.host.saving")
                : editing
                  ? tr("calendar.host.saveButton")
                  : tr("calendar.host.createButton")}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              {tr("calendar.host.cancelButton")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

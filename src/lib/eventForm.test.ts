import { describe, expect, it } from "vitest";
import {
  buildCreateEventInput,
  buildDeleteEventInput,
  buildUpdateEventInput,
  EMPTY_EVENT_FORM,
  eventToFormValues,
  isoToLocalInput,
  localInputToIso,
  mintRkey,
  type EventFormValues,
} from "./eventForm";
import type { CommunityEvent } from "./events";

describe("localInputToIso", () => {
  it("converts a datetime-local string to an RFC 3339 UTC instant", () => {
    const iso = localInputToIso("2026-10-16T18:00");
    expect(iso).not.toBeNull();
    // Round-trips through Date in the local zone; just prove it parses to
    // the same instant as `new Date(...)` would, not a hard-coded offset.
    expect(new Date(iso as string).getTime()).toBe(new Date("2026-10-16T18:00").getTime());
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("returns null for an empty or blank string", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("   ")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(localInputToIso("not a date")).toBeNull();
  });
});

describe("isoToLocalInput", () => {
  it("is the inverse of localInputToIso for a round-trippable instant", () => {
    const local = "2026-10-16T18:00";
    const iso = localInputToIso(local);
    expect(isoToLocalInput(iso)).toBe(local);
  });

  it("returns an empty string for null, undefined, or unparseable input", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("not a date")).toBe("");
  });

  it("pads single-digit month, day, hour, and minute", () => {
    // 2026-01-02T03:04 local, expressed as its own ISO reading.
    const iso = new Date(2026, 0, 2, 3, 4).toISOString();
    expect(isoToLocalInput(iso)).toBe("2026-01-02T03:04");
  });
});

describe("mintRkey", () => {
  it("stays inside atproto's rkey charset and is prefixed", () => {
    const rkey = mintRkey();
    expect(rkey).toMatch(/^ev-[A-Za-z0-9._:~-]+$/);
  });

  it("mints a different key on each call", () => {
    expect(mintRkey()).not.toBe(mintRkey());
  });
});

const target = { authority: "did:plc:mockscene", rkey: "ev-test1" };

const filledForm: EventFormValues = {
  name: "  Ecology Walk  ",
  description: "A slow walk along the creek.",
  startsAt: "2026-10-16T18:00",
  endsAt: "2026-10-16T20:00",
  mode: "inperson",
  placeName: "Chautauqua Ranger Cottage",
  street: "900 Baseline Rd",
  locality: "Boulder",
  region: "CO",
  postalCode: "80302",
};

describe("buildCreateEventInput", () => {
  it("assembles the full wire shape, trims the name, and marks it public", () => {
    const input = buildCreateEventInput(filledForm, target);
    expect(input).toMatchObject({
      authority: target.authority,
      rkey: target.rkey,
      name: "Ecology Walk",
      mode: "inperson",
      publicFace: "exact",
      description: "A slow walk along the creek.",
      placeName: "Chautauqua Ranger Cottage",
      street: "900 Baseline Rd",
      locality: "Boulder",
      region: "CO",
      postalCode: "80302",
      country: "US",
      visibility: "public",
    });
    expect(typeof input.startsAt).toBe("string");
    expect(typeof input.endsAt).toBe("string");
  });

  it("omits blank optional fields rather than sending empty strings", () => {
    const input = buildCreateEventInput(EMPTY_EVENT_FORM, target);
    expect(input.description).toBeUndefined();
    expect(input.startsAt).toBeUndefined();
    expect(input.endsAt).toBeUndefined();
    expect(input.placeName).toBeUndefined();
    expect(input.street).toBeUndefined();
    expect(input.postalCode).toBeUndefined();
    // locality/region default to "Boulder"/"CO" in EMPTY_EVENT_FORM, so an
    // address IS present and country must still be set.
    expect(input.locality).toBe("Boulder");
    expect(input.region).toBe("CO");
    expect(input.country).toBe("US");
  });

  it("omits country entirely when no address field is present at all", () => {
    const noAddress: EventFormValues = {
      ...EMPTY_EVENT_FORM,
      name: "Bare event",
      locality: "",
      region: "",
    };
    const input = buildCreateEventInput(noAddress, target);
    expect(input.country).toBeUndefined();
  });
});

describe("buildUpdateEventInput", () => {
  it("matches buildCreateEventInput minus visibility", () => {
    const created = buildCreateEventInput(filledForm, target);
    const updated = buildUpdateEventInput(filledForm, target);
    const { visibility: _visibility, ...createdWithoutVisibility } = created;
    expect(updated).toEqual(createdWithoutVisibility);
    expect(updated).not.toHaveProperty("visibility");
  });

  it("resends every field even for an edit — an omitted field is a deleted field", () => {
    // The whole point of describedEvent: updateEvent reuses the create
    // fan-out, so a value not present here would be dropped upstream.
    const input = buildUpdateEventInput(filledForm, target);
    for (const key of ["name", "mode", "publicFace", "description", "placeName", "street"]) {
      expect(input).toHaveProperty(key);
    }
  });
});

describe("buildDeleteEventInput", () => {
  it("carries only authority and rkey", () => {
    expect(buildDeleteEventInput(target)).toEqual({
      authority: target.authority,
      rkey: target.rkey,
    });
  });
});

describe("eventToFormValues", () => {
  const stored: CommunityEvent = {
    did: "did:plc:mockscene",
    rkey: "ev-test1",
    name: "Ecology Walk",
    startsAt: "2026-10-16T18:00:00.000Z",
    endsAt: "2026-10-16T20:00:00.000Z",
    description: "A slow walk along the creek.",
    status: "scheduled",
    mode: "inperson",
    location: {
      name: "Chautauqua Ranger Cottage",
      street: "900 Baseline Rd",
      locality: "Boulder",
      region: "CO",
      postalCode: "80302",
    },
  };

  it("round-trips a stored event into editable form values", () => {
    const values = eventToFormValues(stored);
    expect(values.name).toBe("Ecology Walk");
    expect(values.description).toBe("A slow walk along the creek.");
    expect(values.mode).toBe("inperson");
    expect(values.placeName).toBe("Chautauqua Ranger Cottage");
    expect(values.street).toBe("900 Baseline Rd");
    expect(values.locality).toBe("Boulder");
    expect(values.region).toBe("CO");
    expect(values.postalCode).toBe("80302");
    expect(values.startsAt).toBe(isoToLocalInput(stored.startsAt));
    expect(values.endsAt).toBe(isoToLocalInput(stored.endsAt));
  });

  it("falls back to inperson for an unrecognized mode, and blanks a missing location", () => {
    const values = eventToFormValues({ ...stored, mode: "teleported", location: null });
    expect(values.mode).toBe("inperson");
    expect(values.placeName).toBe("");
    expect(values.street).toBe("");
    expect(values.locality).toBe("");
    expect(values.region).toBe("");
    expect(values.postalCode).toBe("");
  });

  it("feeding the round-trip back into buildUpdateEventInput reproduces the same address", () => {
    const values = eventToFormValues(stored);
    const input = buildUpdateEventInput(values, { authority: stored.did, rkey: stored.rkey });
    expect(input.placeName).toBe(stored.location?.name);
    expect(input.street).toBe(stored.location?.street);
    expect(input.locality).toBe(stored.location?.locality);
    expect(input.region).toBe(stored.location?.region);
    expect(input.postalCode).toBe(stored.location?.postalCode);
    expect(input.startsAt).toBe(stored.startsAt);
    expect(input.endsAt).toBe(stored.endsAt);
  });
});

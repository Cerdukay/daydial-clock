import { describe, expect, it } from "vitest";
import { expandDay, makeOccurrenceId, parseOccurrenceId, resolveInstance } from "./recurrence";
import { makeEvent } from "./testing";
import type { EventException } from "./types";

const MONDAY = new Date("2026-03-16T00:00:00"); // series start day
const TUESDAY = new Date("2026-03-17T00:00:00");
const SATURDAY = new Date("2026-03-21T00:00:00");
const NEXT_MONDAY = new Date("2026-03-23T00:00:00");

function daily() {
  return makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", { repeat: "daily" });
}

describe("occurrence ids", () => {
  it("round-trips a series id and start", () => {
    const iso = new Date("2026-03-17T09:00:00").toISOString();
    expect(parseOccurrenceId(makeOccurrenceId("a", iso))).toEqual({
      baseId: "a",
      originalStartAt: iso,
    });
  });

  it("treats a plain id as non-recurring", () => {
    expect(parseOccurrenceId("a")).toEqual({ baseId: "a", originalStartAt: null });
  });
});

describe("expandDay", () => {
  it("passes non-repeating events through when they overlap the day", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00");
    expect(expandDay([event], [], MONDAY).map((item) => item.id)).toEqual(["a"]);
    expect(expandDay([event], [], TUESDAY)).toHaveLength(0);
  });

  it("repeats daily events on later days at the same time", () => {
    const [occurrence] = expandDay([daily()], [], TUESDAY);
    expect(occurrence).toBeDefined();
    expect(occurrence!.seriesId).toBe("a");
    expect(new Date(occurrence!.startAt).getHours()).toBe(9);
    expect(new Date(occurrence!.endAt).getHours()).toBe(10);
  });

  it("never repeats before the series start", () => {
    expect(expandDay([daily()], [], new Date("2026-03-15T00:00:00"))).toHaveLength(0);
  });

  it("skips weekends for the weekday rule", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "weekdays",
    });
    expect(expandDay([event], [], TUESDAY)).toHaveLength(1);
    expect(expandDay([event], [], SATURDAY)).toHaveLength(0);
  });

  it("keeps the weekday for the weekly rule", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "weekly",
    });
    expect(expandDay([event], [], NEXT_MONDAY)).toHaveLength(1);
    expect(expandDay([event], [], TUESDAY)).toHaveLength(0);
  });

  it("keeps the day of month for the monthly rule", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "monthly",
    });
    expect(expandDay([event], [], new Date("2026-04-16T00:00:00"))).toHaveLength(1);
    expect(expandDay([event], [], new Date("2026-04-17T00:00:00"))).toHaveLength(0);
  });

  it("repeats biweekly on the same weekday every 2 weeks", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "biweekly",
    });
    // Mar 16 (Mon) = start, should match
    expect(expandDay([event], [], MONDAY)).toHaveLength(1);
    // Mar 23 (next Mon) = 1 week later, should NOT match
    expect(expandDay([event], [], NEXT_MONDAY)).toHaveLength(0);
    // Mar 30 (Mon) = 2 weeks later, should match
    expect(expandDay([event], [], new Date("2026-03-30T00:00:00"))).toHaveLength(1);
  });

  it("repeats annually on the same month+day", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "annually",
    });
    expect(expandDay([event], [], new Date("2027-03-16T00:00:00"))).toHaveLength(1);
    expect(expandDay([event], [], new Date("2027-03-17T00:00:00"))).toHaveLength(0);
    expect(expandDay([event], [], new Date("2027-04-16T00:00:00"))).toHaveLength(0);
  });

  it("stops after repeatCount occurrences", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "daily",
      repeatCount: 3,
    });
    // Day 1 (Mar 16), Day 2 (Mar 17), Day 3 (Mar 18) — should all match
    expect(expandDay([event], [], MONDAY)).toHaveLength(1);
    expect(expandDay([event], [], TUESDAY)).toHaveLength(1);
    expect(expandDay([event], [], new Date("2026-03-18T00:00:00"))).toHaveLength(1);
    // Day 4 (Mar 19) — should NOT match (count exceeded)
    expect(expandDay([event], [], new Date("2026-03-19T00:00:00"))).toHaveLength(0);
  });

  it("stops repeating after the repeat-until date", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "daily",
      repeatUntil: new Date("2026-03-17T00:00:00").toISOString(),
    });
    expect(expandDay([event], [], TUESDAY)).toHaveLength(1);
    expect(expandDay([event], [], new Date("2026-03-18T00:00:00"))).toHaveLength(0);
  });

  it("hides a cancelled occurrence but keeps the rest of the series", () => {
    const original = new Date("2026-03-17T09:00:00").toISOString();
    const exception: EventException = {
      id: "x1",
      eventId: "a",
      originalStartAt: original,
      replacementStartAt: null,
      replacementEndAt: null,
      isCancelled: true,
    };
    expect(expandDay([daily()], [exception], TUESDAY)).toHaveLength(0);
    expect(expandDay([daily()], [exception], NEXT_MONDAY)).toHaveLength(1);
  });

  it("applies a moved occurrence's replacement times", () => {
    const original = new Date("2026-03-17T09:00:00").toISOString();
    const exception: EventException = {
      id: "x1",
      eventId: "a",
      originalStartAt: original,
      replacementStartAt: new Date("2026-03-17T14:00:00").toISOString(),
      replacementEndAt: new Date("2026-03-17T15:30:00").toISOString(),
      isCancelled: false,
    };
    const [occurrence] = expandDay([daily()], [exception], TUESDAY);
    expect(new Date(occurrence!.startAt).getHours()).toBe(14);
    expect(new Date(occurrence!.endAt).getMinutes()).toBe(30);
    expect(occurrence!.occurrenceStartAt).toBe(original);
  });

  it("returns instances sorted by start time", () => {
    const morning = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00", {
      repeat: "daily",
    });
    const evening = makeEvent("b", "2026-03-16T19:00:00", "2026-03-16T20:00:00", {
      repeat: "daily",
    });
    expect(expandDay([evening, morning], [], TUESDAY).map((item) => item.seriesId)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("resolveInstance", () => {
  it("materializes an occurrence from its id", () => {
    const iso = new Date("2026-03-19T09:00:00").toISOString();
    const instance = resolveInstance(makeOccurrenceId("a", iso), [daily()], []);
    expect(instance?.startAt).toBe(iso);
    expect(instance?.seriesId).toBe("a");
  });

  it("returns undefined for a cancelled occurrence", () => {
    const iso = new Date("2026-03-19T09:00:00").toISOString();
    const instance = resolveInstance(
      makeOccurrenceId("a", iso),
      [daily()],
      [
        {
          id: "x",
          eventId: "a",
          originalStartAt: iso,
          replacementStartAt: null,
          replacementEndAt: null,
          isCancelled: true,
        },
      ],
    );
    expect(instance).toBeUndefined();
  });

  it("returns the plain event for a non-occurrence id", () => {
    const event = makeEvent("a", "2026-03-16T09:00:00", "2026-03-16T10:00:00");
    expect(resolveInstance("a", [event], [])?.id).toBe("a");
  });
});

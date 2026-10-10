import { describe, expect, it } from "vitest";

import {
  MAX_LANES,
  assignLanes,
  dayItems,
  firstFreeLane,
  laneConflicts,
  laneOccupants,
  segmentsForDay,
  snapMinutes,
  minutesToAngle,
  angleToMinutes,
} from "./radial";
import { DAY, at, makeEvent } from "./testing";

describe("segmentsForDay", () => {
  it("splits an event that crosses noon into two pieces", () => {
    const pieces = segmentsForDay(makeEvent("a", at("11:30"), at("12:30")), DAY);
    expect(pieces.map((p) => p.half)).toEqual([0, 1]);
    expect(pieces[0]!.endMin).toBe(720);
    expect(pieces[1]!.startMin).toBe(720);
  });

  it("keeps a single piece for an event inside one half", () => {
    expect(segmentsForDay(makeEvent("a", at("09:00"), at("10:00")), DAY)).toHaveLength(1);
  });

  it("returns nothing for an event on another day", () => {
    expect(
      segmentsForDay(makeEvent("a", "2026-03-17T09:00:00", "2026-03-17T10:00:00"), DAY),
    ).toHaveLength(0);
  });

  it("clips an overnight event to the displayed day and flags continuation", () => {
    const pieces = segmentsForDay(
      makeEvent("a", "2026-03-14T22:00:00", "2026-03-15T02:00:00"),
      DAY,
    );
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.startMin).toBe(0);
    expect(pieces[0]!.endMin).toBe(120);
    expect(pieces[0]!.continuesBefore).toBe(true);
  });
});

describe("assignLanes — one event, one lane", () => {
  it("gives a noon-crossing event a single lane for every segment", () => {
    const event = makeEvent("cross", at("11:00"), at("14:00"));
    const { segments, placement } = assignLanes([event], DAY);
    expect(segments).toHaveLength(2);
    const lanes = new Set(segments.map((s) => s.lane));
    expect(lanes.size).toBe(1);
    expect(placement.get("cross")!.lane).toBe(segments[0]!.lane);
  });

  it("never records more than one placement per event id", () => {
    const events = [
      makeEvent("a", at("08:00"), at("13:00")),
      makeEvent("b", at("11:00"), at("15:00")),
      makeEvent("c", at("11:30"), at("12:30")),
    ];
    const { segments, placement } = assignLanes(events, DAY);
    for (const id of ["a", "b", "c"]) {
      const lanes = new Set(segments.filter((s) => s.event.id === id).map((s) => s.lane));
      expect(lanes.size).toBe(1);
      expect(placement.has(id)).toBe(true);
    }
  });

  it("produces unique render keys for every segment", () => {
    const events = [
      makeEvent("a", at("11:00"), at("13:00")),
      makeEvent("b", at("11:15"), at("12:45")),
    ];
    const keys = assignLanes(events, DAY).segments.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is stable when the input order changes", () => {
    const a = makeEvent("a", at("09:00"), at("11:00"));
    const b = makeEvent("b", at("10:00"), at("12:00"));
    const c = makeEvent("c", at("10:30"), at("11:30"));
    const forward = assignLanes([a, b, c], DAY).placement;
    const reversed = assignLanes([c, b, a], DAY).placement;
    for (const id of ["a", "b", "c"]) {
      expect(reversed.get(id)!.lane).toBe(forward.get(id)!.lane);
    }
  });
});

describe("assignLanes — interval partitioning", () => {
  it("keeps non-overlapping events in the innermost lane", () => {
    const events = [
      makeEvent("a", at("08:00"), at("09:00")),
      makeEvent("b", at("09:00"), at("10:00")),
      makeEvent("c", at("10:00"), at("11:00")),
    ];
    const { placement } = assignLanes(events, DAY);
    expect([...placement.values()].every((p) => p.lane === 0)).toBe(true);
  });

  it("pushes each overlapping event to the first free lane", () => {
    const events = [
      makeEvent("a", at("09:00"), at("12:00")),
      makeEvent("b", at("09:30"), at("11:00")),
      makeEvent("c", at("10:00"), at("10:45")),
    ];
    const { placement } = assignLanes(events, DAY);
    expect(placement.get("a")!.lane).toBe(0);
    expect(placement.get("b")!.lane).toBe(1);
    expect(placement.get("c")!.lane).toBe(2);
  });

  it("reuses a freed lane once the earlier event has ended", () => {
    const events = [
      makeEvent("a", at("09:00"), at("10:00")),
      makeEvent("b", at("09:30"), at("10:30")),
      makeEvent("c", at("10:15"), at("11:00")),
    ];
    const { placement } = assignLanes(events, DAY);
    expect(placement.get("c")!.lane).toBe(0);
  });

  it("overflows only what cannot fit in the visible lanes", () => {
    const events = Array.from({ length: MAX_LANES + 2 }, (_, i) =>
      makeEvent(`e${i}`, at("09:00"), at("11:00")),
    );
    const { placement, overflow } = assignLanes(events, DAY);
    expect(placement.size).toBe(MAX_LANES);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]!.events).toHaveLength(2);
  });

  it("never lets two events share a lane and sub-track at the same time", () => {
    const events = [
      makeEvent("a", at("08:00"), at("13:00")),
      makeEvent("b", at("09:00"), at("12:30")),
      makeEvent("c", at("11:00"), at("14:00")),
      makeEvent("d", at("11:30"), at("13:30")),
      makeEvent("e", at("15:00"), at("16:00")),
    ];
    const { placement } = assignLanes(events, DAY);
    const items = dayItems(events, DAY).filter((item) => placement.has(item.event.id));
    for (const x of items) {
      for (const y of items) {
        if (x.event.id >= y.event.id) continue;
        const px = placement.get(x.event.id)!;
        const py = placement.get(y.event.id)!;
        const sameTrack = px.lane === py.lane && px.subTrack === py.subTrack;
        const timeOverlap = x.startMin < y.endMin && y.startMin < x.endMin;
        expect(sameTrack && timeOverlap).toBe(false);
      }
    }
  });
});

describe("assignLanes — manual lanes", () => {
  it("honours a manual lane even when inner lanes are free", () => {
    const events = [
      makeEvent("m", at("09:00"), at("10:00"), { laneMode: "manual", manualLane: 3 }),
    ];
    expect(assignLanes(events, DAY).placement.get("m")!.lane).toBe(2);
  });

  it("clamps an out-of-range manual lane into the visible bands", () => {
    const events = [
      makeEvent("m", at("09:00"), at("10:00"), {
        laneMode: "manual",
        manualLane: 9 as unknown as 4,
      }),
    ];
    expect(assignLanes(events, DAY).placement.get("m")!.lane).toBe(MAX_LANES - 1);
  });

  it("puts a conflicting manual event on the lane's second sub-track", () => {
    const events = [
      makeEvent("a", at("09:00"), at("11:00"), { laneMode: "manual", manualLane: 1 }),
      makeEvent("b", at("09:30"), at("10:30"), { laneMode: "manual", manualLane: 1 }),
    ];
    const { placement, segments } = assignLanes(events, DAY);
    expect(placement.get("a")).toEqual({ lane: 0, subTrack: 0 });
    expect(placement.get("b")).toEqual({ lane: 0, subTrack: 1 });
    expect(segments.every((s) => (s.lane === 0 ? s.split : true))).toBe(true);
  });

  it("never opens a third sub-track in one lane", () => {
    const events = ["a", "b", "c"].map((id) =>
      makeEvent(id, at("09:00"), at("11:00"), { laneMode: "manual", manualLane: 2 }),
    );
    const { placement, overflow } = assignLanes(events, DAY);
    expect(placement.size).toBe(2);
    expect(overflow[0]!.events.map((e) => e.id)).toEqual(["c"]);
  });

  it("lets manual pins claim their lane before auto events", () => {
    const events = [
      makeEvent("auto", at("09:00"), at("11:00")),
      makeEvent("pinned", at("09:00"), at("11:00"), { laneMode: "manual", manualLane: 1 }),
    ];
    const { placement } = assignLanes(events, DAY);
    expect(placement.get("pinned")!.lane).toBe(0);
    expect(placement.get("auto")!.lane).toBe(1);
  });
});

describe("lane helpers", () => {
  it("reports conflicts in a lane and ignores the excluded event", () => {
    const events = [makeEvent("a", at("09:00"), at("11:00"))];
    expect(laneConflicts(events, DAY, 0, 600, 630).map((e) => e.id)).toEqual(["a"]);
    expect(laneConflicts(events, DAY, 0, 600, 630, "a")).toEqual([]);
    expect(laneConflicts(events, DAY, 1, 600, 630)).toEqual([]);
  });

  it("finds the first free lane and returns null when every lane is busy", () => {
    const busy = Array.from({ length: MAX_LANES }, (_, i) =>
      makeEvent(`e${i}`, at("09:00"), at("11:00")),
    );
    expect(firstFreeLane(busy.slice(0, 2), DAY, 600, 630)).toBe(2);
    expect(firstFreeLane(busy, DAY, 600, 630)).toBeNull();
  });

  it("groups occupants per lane for the arrange-layers view", () => {
    const events = [
      makeEvent("a", at("09:00"), at("11:00")),
      makeEvent("b", at("09:30"), at("10:30")),
    ];
    const lanes = laneOccupants(events, DAY);
    expect(lanes).toHaveLength(MAX_LANES);
    expect(lanes[0]!.map((e) => e.id)).toEqual(["a"]);
    expect(lanes[1]!.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("angle maths", () => {
  it("round-trips minutes through angles on the 12-hour dial", () => {
    for (const minutes of [0, 90, 359, 719]) {
      expect(Math.round(angleToMinutes(minutesToAngle(minutes)))).toBe(minutes);
    }
  });

  it("maps a full day around one 24-hour dial", () => {
    expect(minutesToAngle(0, 1440)).toBe(0);
    expect(minutesToAngle(720, 1440)).toBe(180);
    expect(minutesToAngle(1080, 1440)).toBe(270);
    expect(angleToMinutes(180, 1440)).toBe(720);
  });

  it("snaps to the nearest increment", () => {
    expect(snapMinutes(7, 15)).toBe(0);
    expect(snapMinutes(8, 15)).toBe(15);
    expect(snapMinutes(37, 15)).toBe(30);
  });
});

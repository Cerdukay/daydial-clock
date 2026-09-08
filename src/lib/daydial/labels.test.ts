import { describe, expect, it } from "vitest";

import {
  FULL_LABEL_MINUTES,
  MIN_LABEL_MINUTES,
  planInsideLabels,
  planLabels,
  sanitizeTitle,
  shortenTitle,
} from "./labels";
import { assignLanes } from "./radial";
import { DAY, at, makeEvent } from "./testing";

const plan = (events: Parameters<typeof assignLanes>[0]) =>
  planLabels(assignLanes(events, DAY), DAY, "12h");

const inside = (events: Parameters<typeof assignLanes>[0]) =>
  planInsideLabels(assignLanes(events, DAY));

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < (a.height + b.height) / 2
  );
}

describe("sanitizeTitle", () => {
  it("collapses whitespace and falls back for empty titles", () => {
    expect(sanitizeTitle("  Team   sync ")).toBe("Team sync");
    expect(sanitizeTitle("")).toBe("Untitled event");
    expect(sanitizeTitle(null)).toBe("Untitled event");
  });

  it("tames a single long machine-generated token", () => {
    const out = sanitizeTitle("15752000h4f2aaaaaaaaaaaaaaaaaaaa");
    expect(out.length).toBeLessThanOrEqual(13);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("shortenTitle", () => {
  it("keeps a title that already fits", () => {
    expect(shortenTitle("Standup", 12)).toBe("Standup");
  });

  it("prefers word boundaries over mid-word cuts", () => {
    expect(shortenTitle("Design review with team", 14)).toBe("Design review");
  });

  it("ellipsises a single long word", () => {
    const out = shortenTitle("Retrospективeeeeeee", 10)!;
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns null when nothing readable fits", () => {
    expect(shortenTitle("Workshop", 3)).toBeNull();
  });
});

describe("planLabels — duration rules", () => {
  it("labels a 60 minute event with title and time", () => {
    const { labels } = plan([makeEvent("a", at("09:00"), at("10:00"), { title: "Standup" })]);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.text).toBe("Standup");
    expect(labels[0]!.time).toContain("–");
  });

  it("omits the time line below the full-label threshold", () => {
    const { labels } = plan([makeEvent("a", at("09:00"), at("09:35"), { title: "Call" })]);
    if (labels.length) expect(labels[0]!.time).toBeUndefined();
  });

  it("never labels a 30 minute or shorter event", () => {
    expect(plan([makeEvent("a", at("09:00"), at("09:30"))]).labels).toHaveLength(0);
    expect(plan([makeEvent("a", at("09:00"), at("09:10"))]).labels).toHaveLength(0);
  });

  it("keeps thresholds consistent with each other", () => {
    expect(MIN_LABEL_MINUTES).toBeLessThan(FULL_LABEL_MINUTES);
  });

  it("labels a noon-crossing event exactly once", () => {
    const { labels, labeledIds } = plan([
      makeEvent("cross", at("11:00"), at("14:00"), { title: "Workshop" }),
    ]);
    expect(labels.filter((l) => l.eventId === "cross")).toHaveLength(1);
    expect(labeledIds.has("cross")).toBe(true);
  });

  it("marks completed events as muted", () => {
    const { labels } = plan([makeEvent("a", at("09:00"), at("10:00"), { isCompleted: true })]);
    expect(labels[0]!.muted).toBe(true);
  });
});

describe("planLabels — collision handling", () => {
  it("never emits two overlapping label cards", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent(`e${i}`, at(`0${i}:00`.slice(-5)), at(`0${i}:59`.slice(-5)), {
        title: `Meeting ${i}`,
      }),
    );
    const { labels } = plan(events);
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        expect(boxesOverlap(labels[i]!, labels[j]!)).toBe(false);
      }
    }
  });

  it("keeps every card inside the viewBox", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent(`e${i}`, at(`1${i}:00`), at(`1${i}:50`), { title: "Long event name here" }),
    );
    for (const label of plan(events).labels) {
      expect(label.x - label.width / 2).toBeGreaterThanOrEqual(0);
      expect(label.y - label.height / 2).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width / 2).toBeLessThanOrEqual(400);
      expect(label.y + label.height / 2).toBeLessThanOrEqual(400);
    }
  });

  it("prefers the longer event when two labels compete for one spot", () => {
    const events = [
      makeEvent("long", at("09:00"), at("12:00"), { title: "Deep work block" }),
      makeEvent("short", at("10:20"), at("11:05"), { title: "Quick chat" }),
    ];
    const { labeledIds } = plan(events);
    expect(labeledIds.has("long")).toBe(true);
  });

  it("still returns arcs for events whose label was dropped", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent(`e${i}`, at("09:00"), at("11:00"), { title: `Overlap ${i}` }),
    );
    const lanes = assignLanes(events, DAY);
    const { labeledIds } = planLabels(lanes, DAY, "12h");
    expect(lanes.segments.length).toBeGreaterThan(labeledIds.size);
    expect(lanes.segments.length).toBeGreaterThan(0);
  });
});

describe("planInsideLabels", () => {
  it("shows the full title for a long event", () => {
    const { labels } = inside([makeEvent("a", at("09:00"), at("11:00"), { title: "Deep work" })]);
    expect(labels[0]!.text).toBe("Deep work");
  });

  it("shortens a medium event and never renders a time", () => {
    const { labels } = inside([
      makeEvent("a", at("09:00"), at("09:50"), { title: "Design review with team" }),
    ]);
    if (labels.length) {
      expect(labels[0]!.text.length).toBeLessThanOrEqual(10);
      expect(labels[0]! as unknown as { time?: string }).not.toHaveProperty("time");
    }
  });

  it("stays arc-only under the minimum duration", () => {
    expect(inside([makeEvent("a", at("09:00"), at("09:25"))]).labels).toHaveLength(0);
  });

  it("skips split lane bands that are too thin for text", () => {
    const events = [
      makeEvent("a", at("09:00"), at("11:00"), { laneMode: "manual", manualLane: 1 }),
      makeEvent("b", at("09:30"), at("10:30"), { laneMode: "manual", manualLane: 1 }),
    ];
    expect(inside(events).labels).toHaveLength(0);
  });

  it("labels a noon-crossing event once, on one radius", () => {
    const { labels } = inside([
      makeEvent("cross", at("10:30"), at("13:30"), { title: "Workshop" }),
    ]);
    expect(labels.filter((l) => l.eventId === "cross")).toHaveLength(1);
  });

  it("drops lower-priority titles instead of overlapping them", () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent(`e${i}`, at("09:00"), at("11:00"), { title: `Session ${i}` }),
    );
    const { labels, labeledIds } = inside(events);
    expect(labels.length).toBe(labeledIds.size);
    expect(new Set(labels.map((l) => l.eventId)).size).toBe(labels.length);
  });
});

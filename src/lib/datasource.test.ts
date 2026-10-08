import { describe, expect, it } from "vitest";
import { absolute, bucketed, bucketFor, q } from "./datasource";

describe("the width of a timeline column", () => {
  it("keeps about fifty columns whatever the range", () => {
    expect(bucketFor(300)).toBe("5s"); // five minutes
    expect(bucketFor(3600)).toBe("1m"); // an hour
    expect(bucketFor(86400)).toBe("30m"); // a day
    expect(bucketFor(604800)).toBe("3h"); // a week
  });

  it("has a floor and a ceiling rather than a gap", () => {
    expect(bucketFor(1)).toBe("1s");
    expect(bucketFor(3153600000)).toBe("1w");
  });
});

describe("what goes to a source", () => {
  it("escapes what Lucene would otherwise read as syntax", () => {
    expect(q("a:b")).toBe("a\\:b");
  });

  it("sends a range as the two instants it is", () => {
    const from = new Date("2026-09-18T11:00:00.000Z");
    const to = new Date("2026-09-18T12:00:00.000Z");
    expect(absolute(from, to)).toEqual({ type: "absolute", from: from.toISOString(), to: to.toISOString() });
  });
});

describe("counting new messages into the timeline", () => {
  const buckets = [
    { at: "2026-09-18T11:00:00.000Z", count: 5 },
    { at: "2026-09-18T11:05:00.000Z", count: 7 },
  ];

  it("counts an arrival into the bucket it belongs to", () => {
    expect(bucketed(buckets, ["2026-09-18T11:06:30.000Z"])).toEqual([
      { at: "2026-09-18T11:00:00.000Z", count: 5 },
      { at: "2026-09-18T11:05:00.000Z", count: 8 },
    ]);
  });

  it("grows rightwards as time passes, drawing the quiet in between", () => {
    const grown = bucketed(buckets, ["2026-09-18T11:16:00.000Z"]);
    expect(grown.map((b) => b.count)).toEqual([5, 7, 0, 1]);
    expect(grown[3].at).toBe("2026-09-18T11:15:00.000Z");
  });

  it("leaves what came before the timeline out of it", () => {
    expect(bucketed(buckets, ["2026-09-18T10:00:00.000Z"])).toEqual(buckets);
  });

  it("does not draw a day of quiet to reach one message", () => {
    expect(bucketed(buckets, ["2026-09-19T11:00:00.000Z"])).toEqual(buckets);
  });

  it("has nothing to do without buckets or without arrivals", () => {
    expect(bucketed([], ["2026-09-18T11:06:00.000Z"])).toEqual([]);
    expect(bucketed(buckets, [])).toEqual(buckets);
  });
});

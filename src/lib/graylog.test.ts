import { describe, expect, it } from "vitest";
import { absolute, bucketFor, q } from "./graylog";

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

describe("what goes to Graylog", () => {
  it("escapes what Lucene would otherwise read as syntax", () => {
    expect(q("a:b")).toBe("a\\:b");
  });

  it("sends a range as the two instants it is", () => {
    const from = new Date("2026-09-18T11:00:00.000Z");
    const to = new Date("2026-09-18T12:00:00.000Z");
    expect(absolute(from, to)).toEqual({ type: "absolute", from: from.toISOString(), to: to.toISOString() });
  });
});

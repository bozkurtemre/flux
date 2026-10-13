import { describe, expect, it } from "vitest";
import { finite } from "./graylog";

describe("finite", () => {
  it("keeps a number and drops Graylog's NaN for a bucket with no values", () => {
    expect(finite(240.5)).toBe(240.5);
    expect(finite("NaN")).toBeUndefined();
    expect(finite(Number.NaN)).toBeUndefined();
    expect(finite(undefined)).toBeUndefined();
  });
});

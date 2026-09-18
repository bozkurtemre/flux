import { describe, expect, it } from "vitest";
import { fromInput, toInput } from "./when";

describe("an instant in a date field", () => {
  const instant = new Date("2026-09-18T11:22:33.000Z");

  it("shows UTC as UTC", () => {
    expect(toInput(instant, "utc")).toBe("2026-09-18T11:22:33");
  });

  it("shows local time as the clock on the wall shows it", () => {
    const offset = instant.getTimezoneOffset();
    const shown = toInput(instant, "local");
    expect(new Date(`${shown}Z`).getTime()).toBe(instant.getTime() - offset * 60_000);
  });

  it("reads back what it showed, in either zone", () => {
    for (const zone of ["utc", "local"] as const) {
      expect(fromInput(toInput(instant, zone), zone)?.toISOString()).toBe(instant.toISOString());
    }
  });

  it("takes a field without seconds, which is what a picker gives", () => {
    expect(fromInput("2026-09-18T11:22", "utc")?.toISOString()).toBe("2026-09-18T11:22:00.000Z");
  });

  it("refuses what is not a moment", () => {
    expect(fromInput("", "utc")).toBeNull();
    expect(fromInput("yesterday", "utc")).toBeNull();
    expect(fromInput("2026-13-45T99:99:99", "utc")).toBeNull();
  });
});

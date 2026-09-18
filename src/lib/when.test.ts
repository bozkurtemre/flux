import { describe, expect, it } from "vitest";
import { atTime, dayKey, fromInput, monthDays, splitInput, toInput } from "./when";

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

describe("the month a calendar draws", () => {
  it("is six weeks, Monday first, around the month asked for", () => {
    const days = monthDays(2026, 8); // September 2026
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1); // Monday
    expect(days.some((d) => dayKey(d) === "2026-09-01")).toBe(true);
    expect(days.some((d) => dayKey(d) === "2026-09-30")).toBe(true);
  });

  it("starts on the first when the first is a Monday", () => {
    expect(dayKey(monthDays(2026, 5)[0])).toBe("2026-06-01"); // 1 June 2026 is a Monday
  });

  it("names a day by its own parts, whatever the zone", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("the halves of a date field", () => {
  it("splits and joins without losing the seconds", () => {
    expect(splitInput("2026-09-18T11:22:33")).toEqual({ day: "2026-09-18", time: "11:22:33" });
    expect(atTime("2026-09-18", "11:22:33")).toBe("2026-09-18T11:22:33");
  });

  it("fills in a time that was left out", () => {
    expect(splitInput("2026-09-18").time).toBe("00:00:00");
  });
});

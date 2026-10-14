import { describe, expect, it } from "vitest";
import { promoter } from "./promoter";

describe("the key promoter", () => {
  it("tips on the third click, once, and never for a shortcut already told", () => {
    const click = promoter(["⌘S"]);
    expect([click("⌘⏎"), click("⌘⏎"), click("⌘⏎"), click("⌘⏎")]).toEqual([false, false, true, false]);
    expect([click("⌘S"), click("⌘S"), click("⌘S")]).toEqual([false, false, false]);
  });
});

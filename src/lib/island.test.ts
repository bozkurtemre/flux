import { describe, expect, it } from "vitest";
import { ago, headline, lead, placement, type IslandState } from "./island";

const item = (state: IslandState, key: string = state) => ({ key, title: key, detail: "", state });

describe("what the pill says", () => {
  it("counts each kind, the one that most needs looking at first", () => {
    expect(headline([item("watching"), item("running", "a"), item("running", "b"), item("alert")])).toBe(
      "1 with new matches · 2 running · 1 watching",
    );
  });

  it("leads with the colour of whatever most needs looking at", () => {
    expect(lead([item("watching"), item("following")])).toBe("following");
    expect(lead([item("watching"), item("alert")])).toBe("alert");
  });

  it("says how long in the shortest way", () => {
    expect(ago(4_000)).toBe("4s");
    expect(ago(190_000)).toBe("3m");
    expect(ago(7_400_000)).toBe("2h");
  });
});

describe("where it sits", () => {
  it("is centred on the screen and flush with its top, the notch's height known from the menu bar", () => {
    // a 14-inch MacBook Pro at 2x: 3024 px wide, the menu bar 74 px tall
    const at = placement({ x: 0, y: 0, width: 3024, scale: 2, workTop: 74 }, { width: 300, height: 70 });
    expect(at).toEqual({ x: 606, y: 0, inset: 37 });
  });

  it("sits on a second screen where that screen is", () => {
    const at = placement({ x: 3024, y: -200, width: 3840, scale: 2, workTop: -150 }, { width: 400, height: 60 });
    expect(at.x).toBe(1512 + 760);
    expect(at.y).toBe(-100);
    expect(at.inset).toBe(25);
  });
});

import { describe, expect, it } from "vitest";
import { placeTooltip } from "./tooltip";

const view = { width: 1000, height: 600 };
const tip = { width: 120, height: 30 };

describe("placing a tooltip", () => {
  it("sits under the thing it describes, centred on it", () => {
    expect(placeTooltip({ left: 400, top: 100, width: 28, height: 28 }, tip, view)).toEqual({ left: 354, top: 134 });
  });

  it("flips above when the bottom of the window is in the way", () => {
    // the stripe buttons and the status bar live down there, which is where this matters
    expect(placeTooltip({ left: 400, top: 560, width: 28, height: 28 }, tip, view).top).toBe(524);
  });

  it("stays below when flipping would only move it off the top", () => {
    const tall = { width: 120, height: 580 };
    expect(placeTooltip({ left: 400, top: 40, width: 28, height: 28 }, tall, view).top).toBe(74);
  });

  it("never hangs off either edge", () => {
    expect(placeTooltip({ left: 980, top: 100, width: 16, height: 16 }, tip, view).left).toBe(874);
    expect(placeTooltip({ left: 2, top: 100, width: 16, height: 16 }, tip, view).left).toBe(6);
  });
});

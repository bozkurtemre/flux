import { describe, expect, it } from "vitest";
import { moveBefore } from "./reorder";

const cols = ["timestamp", "level", "source", "message"];

describe("dragging one item in front of another", () => {
  it("drops it where the line was drawn, to the left of the target", () => {
    expect(moveBefore(cols, "message", "level")).toEqual(["timestamp", "message", "level", "source"]);
  });

  it("works the other way round", () => {
    expect(moveBefore(cols, "timestamp", "message")).toEqual(["level", "source", "timestamp", "message"]);
  });

  it("leaves the order alone when there is nowhere to go", () => {
    expect(moveBefore(cols, "level", "level")).toEqual(cols);
    expect(moveBefore(cols, "level", "not_a_column")).toEqual(cols);
  });
});

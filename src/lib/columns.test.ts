import { describe, expect, it } from "vitest";
import { moveColumn } from "./columns";

const cols = ["timestamp", "level", "source", "message"];

describe("dragging a column", () => {
  it("drops it where the line was drawn, to the left of the target", () => {
    expect(moveColumn(cols, "message", "level")).toEqual(["timestamp", "message", "level", "source"]);
  });

  it("works the other way round", () => {
    expect(moveColumn(cols, "timestamp", "message")).toEqual(["level", "source", "timestamp", "message"]);
  });

  it("leaves the order alone when there is nowhere to go", () => {
    expect(moveColumn(cols, "level", "level")).toEqual(cols);
    expect(moveColumn(cols, "level", "not_a_column")).toEqual(cols);
  });
});

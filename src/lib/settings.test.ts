import { describe, expect, it } from "vitest";
import { withDefaults, type Connection } from "./settings";

describe("connections saved before they named their source", () => {
  it("are Graylog connections, with the URL and token under their new names", () => {
    const saved = [{ id: "c1", name: "prod", graylogUrl: "https://graylog.example", graylogToken: "t" }] as unknown as Connection[];
    expect(withDefaults({ connections: saved }).connections).toEqual([
      { id: "c1", name: "prod", kind: "graylog", url: "https://graylog.example", token: "t" },
    ]);
  });

  it("keep what a newer file already says", () => {
    const saved: Connection[] = [{ id: "c2", name: "logs", kind: "kibana", url: "https://kibana.example", token: "k" }];
    expect(withDefaults({ connections: saved }).connections).toEqual(saved);
  });
});

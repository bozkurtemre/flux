import { describe, expect, it } from "vitest";
import { parseQuery } from "./query";

describe("reading the console line", () => {
  it("takes the whole line as the query when nothing is grouped", () => {
    expect(parseQuery("level:ERROR AND source:api")).toEqual({ search: "level:ERROR AND source:api", groupBy: [] });
  });

  it("separates the query from the clauses that follow it", () => {
    expect(parseQuery("level:ERROR | group by source")).toEqual({ search: "level:ERROR", groupBy: ["source"] });
  });

  it("keeps one table per clause, in the order they were written", () => {
    expect(parseQuery("* | group by source | groupby route").groupBy).toEqual(["source", "route"]);
  });

  it("gives each field of a list its own table rather than one aggregation over both", () => {
    expect(parseQuery("* | group by method, route").groupBy).toEqual(["method", "route"]);
  });

  it("asks the same question once", () => {
    expect(parseQuery("* | group by source | group by source").groupBy).toEqual(["source"]);
  });

  it("leaves a pipe that belongs to the query alone", () => {
    const line = String.raw`message:/foo|bar/ | group by source`;
    expect(parseQuery(line)).toEqual({ search: String.raw`message:/foo|bar/`, groupBy: ["source"] });
  });

  it("is still a query when the clause has no field yet", () => {
    expect(parseQuery("level:ERROR | group by ")).toEqual({ search: "level:ERROR", groupBy: [] });
  });

  it("groups everything when the line is nothing but a clause", () => {
    expect(parseQuery("| group by source")).toEqual({ search: "", groupBy: ["source"] });
  });
});

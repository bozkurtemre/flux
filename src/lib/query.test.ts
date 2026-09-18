import { describe, expect, it } from "vitest";
import { fieldClause, parseQuery, withClause, withGroupBy } from "./query";

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

  it("does not ask for a pipe with nothing in front of it", () => {
    expect(parseQuery("group by source")).toEqual({ search: "", groupBy: ["source"] });
    expect(parseQuery("group by source | group by route").groupBy).toEqual(["source", "route"]);
  });

  it("leaves a query that merely begins with the word alone", () => {
    expect(parseQuery("group:by AND level:ERROR")).toEqual({ search: "group:by AND level:ERROR", groupBy: [] });
  });
});

describe("narrowing from a row", () => {
  it("quotes the value, because a log value is not a term", () => {
    expect(fieldClause("route", "/v1/wallet")).toBe('route:"/v1/wallet"');
    expect(fieldClause("message", 'he said "no"')).toBe('message:"he said \\"no\\""');
    expect(fieldClause("level", 3, true)).toBe('NOT level:"3"');
  });

  it("adds the clause to the query and not to the clauses after it", () => {
    expect(withClause("level:ERROR | group by route", 'source:"api"')).toBe('level:ERROR AND source:"api" | group by route');
  });

  it("is the whole query when there was none", () => {
    expect(withClause("", 'source:"api"')).toBe('source:"api"');
    expect(withClause("| group by route", 'source:"api"')).toBe('source:"api" | group by route');
  });

  it("asks for a table once, however many times it is clicked", () => {
    expect(withGroupBy("level:ERROR", "route")).toBe("level:ERROR | group by route");
    expect(withGroupBy("level:ERROR | group by route", "route")).toBe("level:ERROR | group by route");
    expect(withGroupBy("level:ERROR | group by route", "source")).toBe("level:ERROR | group by route | group by source");
  });

  it("groups everything when there is no query to group", () => {
    expect(withGroupBy("", "route")).toBe("group by route");
  });
});

import { describe, expect, it } from "vitest";
import { fieldClause, parseQuery, withBetween, withClause, withGroupBy, withoutBetween, withSearch } from "./query";

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

describe("a window named in the line", () => {
  it("is read off the line and taken out of the query", () => {
    const parsed = parseQuery("level:ERROR | between 2026-09-18T14:03:21Z and 2026-09-18T14:13:21Z");
    expect(parsed).toEqual({
      search: "level:ERROR",
      groupBy: [],
      between: { from: "2026-09-18T14:03:21Z", to: "2026-09-18T14:13:21Z" },
    });
  });

  it("sits beside the tables, in either order", () => {
    expect(parseQuery("* | between 2026-09-18T14:03:21Z and 2026-09-18T14:13:21Z | group by route")).toEqual({
      search: "*",
      groupBy: ["route"],
      between: { from: "2026-09-18T14:03:21Z", to: "2026-09-18T14:13:21Z" },
    });
    expect(parseQuery("* | group by route | between 2026-09-18T14:03:21Z and 2026-09-18T14:13:21Z").groupBy).toEqual(["route"]);
  });

  it("is a window on its own, with everything searched in it", () => {
    expect(parseQuery("between 2026-09-18T14:03:21Z and 2026-09-18T14:13:21Z").search).toBe("");
  });

  it("stays in the line, and out of the search, when the dates make no sense", () => {
    const parsed = parseQuery("between yesterday and tomorrow");
    expect(parsed.between).toBeUndefined();
    expect(parsed.search).toBe("between yesterday and tomorrow");
  });

  it("is written to the second, and replaces the one before it", () => {
    const from = new Date("2026-09-18T14:03:21.123Z");
    const to = new Date("2026-09-18T14:13:21.123Z");
    expect(withBetween("level:ERROR", from, to)).toBe("level:ERROR | between 2026-09-18T14:03:21Z and 2026-09-18T14:13:21Z");
    expect(withBetween("level:ERROR | between 2020-01-01T00:00:00Z and 2020-01-02T00:00:00Z", from, to)).toBe(
      "level:ERROR | between 2026-09-18T14:03:21Z and 2026-09-18T14:13:21Z",
    );
    expect(withBetween("", from, to)).toBe("between 2026-09-18T14:03:21Z and 2026-09-18T14:13:21Z");
  });
});

describe("asking for patterns", () => {
  it("is a clause like the others, and takes the field with it", () => {
    expect(parseQuery("level:ERROR | patterns")).toEqual({ search: "level:ERROR", groupBy: [], patterns: "" });
    expect(parseQuery("level:ERROR | patterns full_message").patterns).toBe("full_message");
  });

  it("sits beside a window and a table", () => {
    const line = "* | patterns | group by route | between 2026-09-18T11:00:00Z and 2026-09-18T12:00:00Z";
    const parsed = parseQuery(line);
    expect(parsed.patterns).toBe("");
    expect(parsed.groupBy).toEqual(["route"]);
    expect(parsed.between?.from).toBe("2026-09-18T11:00:00Z");
    expect(parsed.search).toBe("*");
  });

  it("is the whole line when that is all there is", () => {
    expect(parseQuery("patterns")).toEqual({ search: "", groupBy: [], patterns: "" });
  });
});

describe("taking the window off again", () => {
  it("leaves the query and the tables it had", () => {
    expect(withoutBetween("level:ERROR | group by route | between 2026-09-18T11:00:00Z and 2026-09-18T12:00:00Z")).toBe(
      "level:ERROR | group by route",
    );
  });

  it("leaves a line that never had one alone", () => {
    expect(withoutBetween("level:ERROR")).toBe("level:ERROR");
  });

  it("leaves nothing when the window was all there was", () => {
    expect(withoutBetween("between 2026-09-18T11:00:00Z and 2026-09-18T12:00:00Z")).toBe("");
  });
});

describe("replacing the query of a line", () => {
  it("keeps the clauses after it, and reads everything as an empty query, which needs no leading |", () => {
    expect(withSearch("a:1 AND b:2 | group by route", "b:2")).toBe("b:2 | group by route");
    expect(withSearch("a:1 | patterns", "*")).toBe("patterns");
  });
});

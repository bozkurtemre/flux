import { describe, expect, it } from "vitest";
import { andTerms, checkField, fieldOf, without } from "./zero";

describe("the terms of a search", () => {
  it("splits on a top-level AND, keeping a NOT with what it negates", () => {
    expect(andTerms("route:/v2/orders* AND status:500 AND NOT source:api-1")).toEqual(["route:/v2/orders*", "status:500", "NOT source:api-1"]);
  });

  it("leaves what is quoted, bracketed or grouped whole", () => {
    expect(andTerms('message:"a AND b" AND (x:1 AND y:2) AND t:[1 TO 5]')).toEqual(['message:"a AND b"', "(x:1 AND y:2)", "t:[1 TO 5]"]);
  });

  it("does not split a search with a top-level OR, nor a lowercase and", () => {
    expect(andTerms("a:1 AND b:2 OR c:3")).toEqual(["a:1 AND b:2 OR c:3"]);
    expect(andTerms("a:1 and b:2")).toEqual(["a:1 and b:2"]);
  });

  it("is everything once every term is left out", () => {
    expect(without(["a:1", "b:2"], 0)).toBe("b:2");
    expect(without(["a:1"], 0)).toBe("*");
  });
});

describe("the field a term searches", () => {
  it("is named before the colon, after a NOT, or inside _exists_", () => {
    expect(fieldOf("route:/x")).toBe("route");
    expect(fieldOf("NOT log.level:INFO")).toBe("log.level");
    expect(fieldOf("_exists_:iccid")).toBe("iccid");
    expect(fieldOf('"just text"')).toBeNull();
  });

  it("is checked against the stream's fields, with the nearest one offered", () => {
    const known = ["httpStatusCode", "route", "responseTime"];
    expect(checkField("route", known)).toEqual({ known: true });
    expect(checkField("httpstatuscode", known)).toEqual({ known: false, suggest: "httpStatusCode" });
    expect(checkField("rout", known)).toEqual({ known: false, suggest: "route" });
    expect(checkField("zzzz", known)).toEqual({ known: false });
    expect(checkField("anything", [])).toEqual({ known: true });
  });
});

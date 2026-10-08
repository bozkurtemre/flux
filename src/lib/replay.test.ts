import { describe, expect, it } from "vitest";
import { requestOf, responseOf } from "./curl";
import { asJson, headerLines, parseHeaderLines, targetOf, writes } from "./replay";

describe("the request a row describes", () => {
  const row = {
    method: "post",
    uri: "/v1/orders?x=1",
    host: "api.esim.io",
    request: { headers: { Authorization: ["Bearer live"], "Content-Type": ["application/json"], Host: ["api.esim.io"] }, body: { iccid: "8990" } },
    response: { status: 502, body: '{"error":"timeout"}' },
  };

  it("has its method, where it went, its headers with the secrets marked, and its body", () => {
    expect(requestOf(row)).toEqual({
      method: "POST",
      url: "https://api.esim.io/v1/orders?x=1",
      headers: [
        { name: "Authorization", value: "Bearer live", secret: true },
        { name: "Content-Type", value: "application/json", secret: false },
        { name: "Host", value: "api.esim.io", secret: false },
      ],
      body: '{"iccid":"8990"}',
    });
  });

  it("and the answer the log kept, from the response's own object", () => {
    expect(responseOf(row)).toEqual({ status: 502, body: '{"error":"timeout"}' });
  });

  it("reads a flat status and response field, and does not take the request body for the response", () => {
    expect(responseOf({ httpStatusCode: 200, response_body: "ok", body: "the request" })).toEqual({ status: 200, body: "ok" });
    expect(responseOf({ body: "the request" })).toEqual({});
  });
});

describe("sending it again", () => {
  it("keeps the path and the query and puts them on the base it is sent to", () => {
    expect(targetOf("https://api.esim.io/v1/orders?x=1", "https://stage.esim.io/")).toBe("https://stage.esim.io/v1/orders?x=1");
    expect(targetOf("/v1/orders", "https://stage.esim.io")).toBe("https://stage.esim.io/v1/orders");
    expect(targetOf("https://api.esim.io", "https://stage.esim.io")).toBe("https://stage.esim.io/");
  });

  it("never carries a secret from the log, and leaves out what the connection decides", () => {
    const text = headerLines([
      { name: "Authorization", value: "Bearer live", secret: true },
      { name: "Host", value: "api.esim.io", secret: false },
      { name: "Accept", value: "application/json", secret: false },
    ]);
    expect(text).toBe("Authorization: \nAccept: application/json");
    expect(parseHeaderLines(text)).toEqual({ Accept: "application/json" });
    expect(parseHeaderLines("Authorization: Bearer stage\nHost: x\nbroken line")).toEqual({ Authorization: "Bearer stage" });
  });

  it("asks twice about a method that changes something", () => {
    expect([writes("GET"), writes("post"), writes("DELETE")]).toEqual([false, true, true]);
  });

  it("reads a JSON body as structure, and anything else as nothing to compare", () => {
    expect(asJson('{"a":1}')).toEqual({ a: 1 });
    expect(asJson("[1]")).toEqual({ "": [1] });
    expect(asJson("<html>")).toBeNull();
  });
});

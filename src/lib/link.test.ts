import { describe, expect, it } from "vitest";
import { connectionFor, linkFor, linkToView, readLink } from "./link";

describe("a view as a link", () => {
  const view = {
    graylog: "https://graylog.example",
    stream: "681b3de4",
    label: "Esim App Api Logs",
    query: 'level:ERROR AND route:"/v1/wallet" | group by source',
    seconds: 3600,
  };

  it("reads back what it wrote, quotes, pipes and all", () => {
    expect(readLink(linkFor(view))).toEqual(view);
  });

  it("carries a window in the line rather than a range beside it", () => {
    const pinned = { graylog: view.graylog, stream: view.stream, query: "* | between 2026-09-18T11:00:00Z and 2026-09-18T12:00:00Z" };
    expect(readLink(linkFor(pinned))).toEqual(pinned);
  });

  it("is ours, or nothing", () => {
    expect(readLink("https://graylog.example/streams/1")).toBeNull();
    expect(readLink("flux://settings?x=1")).toBeNull();
    expect(readLink("flux://open?graylog=https://g.example")).toBeNull();
    expect(readLink("not a link")).toBeNull();
  });

  it("never has a token in it", () => {
    expect(linkFor(view)).not.toMatch(/token/i);
  });
});

describe("the connection that answers a link", () => {
  const connections = [
    { id: "a", url: "https://GRAYLOG.example/" },
    { id: "b", url: "https://other.example" },
  ];

  it("is known by its URL, whatever it is called", () => {
    expect(connectionFor(connections, "https://graylog.example")?.id).toBe("a");
  });

  it("is nobody when the Graylog is not set up here", () => {
    expect(connectionFor(connections, "https://third.example")).toBeUndefined();
  });
});

describe("a tab, a saved query or a query in the history as a link", () => {
  const connections = [{ id: "c1", url: "https://graylog.example.com" }];
  const view = { connId: "c1", streamIds: ["s1"], streamLabel: "payments", query: "level:ERROR", rangeSeconds: 3600 };

  it("names the connection by its URL, the stream, the line and the range", () => {
    expect(readLink(linkToView(connections, view)!)).toEqual({
      graylog: "https://graylog.example.com",
      stream: "s1",
      label: "payments",
      query: "level:ERROR",
      seconds: 3600,
    });
  });

  it("leaves the range out when the line names its own window", () => {
    const pinned = { ...view, query: "level:ERROR | between 2026-10-16T10:00:00Z and 2026-10-16T11:00:00Z" };
    expect(readLink(linkToView(connections, pinned)!)?.seconds).toBeUndefined();
  });

  it("is no link for several streams, or for a connection this Mac no longer has", () => {
    expect(linkToView(connections, { ...view, streamIds: ["s1", "s2"] })).toBeNull();
    expect(linkToView(connections, { ...view, connId: "gone" })).toBeNull();
  });
});

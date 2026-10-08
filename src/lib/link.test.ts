import { describe, expect, it } from "vitest";
import { connectionFor, linkFor, readLink } from "./link";

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

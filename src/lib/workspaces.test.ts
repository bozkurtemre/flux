import { describe, expect, it } from "vitest";
import { remember, shortPath, workspaceName } from "./workspaces";

describe("naming a workspace", () => {
  it("is called after the folder it is", () => {
    expect(workspaceName("/Users/me/src/esim-io-backend")).toBe("esim-io-backend");
    expect(workspaceName("/Users/me/src/esim-io-backend/")).toBe("esim-io-backend");
  });

  it("shortens a path under the home directory, and leaves others alone", () => {
    expect(shortPath("/Users/me/src/flux", "/Users/me")).toBe("~/src/flux");
    expect(shortPath("/opt/work/flux", "/Users/me")).toBe("/opt/work/flux");
  });
});

describe("the recent list", () => {
  const list = [
    { folder: "/a", openedAt: 3 },
    { folder: "/b", openedAt: 2 },
  ];

  it("puts the folder just opened at the top", () => {
    expect(remember(list, "/c", 4).map((r) => r.folder)).toEqual(["/c", "/a", "/b"]);
  });

  it("moves a folder rather than repeating it", () => {
    expect(remember(list, "/b", 4)).toEqual([
      { folder: "/b", openedAt: 4 },
      { folder: "/a", openedAt: 3 },
    ]);
  });

  it("stays short enough to be a menu", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ folder: `/f${i}`, openedAt: i }));
    expect(remember(many, "/new", 99, 8)).toHaveLength(8);
  });
});

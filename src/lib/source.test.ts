import { describe, expect, it } from "vitest";
import capability from "../../src-tauri/capabilities/default.json";
import { IDES, ideUrl, localPath, sourceRefs } from "./source";

describe("the files a log line names", () => {
  it("reads the three shapes a trace comes in", () => {
    expect(sourceRefs("at /var/www/html/app/Services/Activation.php:142")).toEqual([
      { path: "/var/www/html/app/Services/Activation.php", line: 142 },
    ]);
    expect(sourceRefs("#0 /var/www/app/Http/Kernel.php(88): handle()")).toEqual([{ path: "/var/www/app/Http/Kernel.php", line: 88 }]);
    expect(sourceRefs("Uncaught Error in /srv/app/index.php on line 7")).toEqual([{ path: "/srv/app/index.php", line: 7 }]);
  });

  it("finds a trace inside the JSON a message is, escaping and all", () => {
    const message = JSON.stringify({ exception: { trace: "#0 /var/www/html/app/Jobs/Order.php:31\n#1 /var/www/html/vendor/laravel/Queue.php:90" } });
    expect(sourceRefs(message).map((r) => r.line)).toEqual([31, 90]);
  });

  it("puts our own code before vendor code, and names each place once", () => {
    const refs = sourceRefs("vendor/a/B.php:1 app/C.php:2 app/C.php:2");
    expect(refs.map((r) => r.path)).toEqual(["app/C.php", "vendor/a/B.php"]);
  });

  it("is nothing for a line without a file in it", () => {
    expect(sourceRefs("wallet balance mismatch: 12 != 14")).toEqual([]);
    expect(sourceRefs("version 1.2.3:4")).toEqual([]);
  });
});

describe("the same file on this machine", () => {
  it("takes the server's root off and puts the checkout in its place", () => {
    expect(localPath("/var/www/html/app/Foo.php", "/Users/me/src/api")).toBe("/Users/me/src/api/app/Foo.php");
    expect(localPath("/app/src/index.ts", "/Users/me/src/web/")).toBe("/Users/me/src/web/src/index.ts");
  });

  it("uses the project's own prefix before the usual ones", () => {
    expect(localPath("/home/deploy/current/app/Foo.php", "/Users/me/api", "/home/deploy/current")).toBe("/Users/me/api/app/Foo.php");
  });

  it("joins a relative path to the checkout", () => {
    expect(localPath("app/Foo.php", "/Users/me/api")).toBe("/Users/me/api/app/Foo.php");
  });

  it("leaves an absolute path it does not recognise alone, which is right for a local run", () => {
    expect(localPath("/Users/me/api/app/Foo.php", "/Users/me/api")).toBe("/Users/me/api/app/Foo.php");
  });
});

describe("asking an IDE to open it", () => {
  it("speaks each IDE's own scheme", () => {
    expect(ideUrl("phpstorm", "/Users/me/api/app/Foo.php", 12)).toBe("phpstorm://open?file=%2FUsers%2Fme%2Fapi%2Fapp%2FFoo.php&line=12");
    expect(ideUrl("vscode", "/Users/me/api/app/Foo.php", 12)).toBe("vscode://file/Users/me/api/app/Foo.php:12");
  });

  it("is allowed to: the opener refuses a scheme the capability does not name", () => {
    // without these the call is refused by the ACL, and the link simply does nothing
    const allowed = JSON.stringify(capability.permissions);
    for (const { value } of IDES) expect(allowed).toContain(`${value}://*`);
  });
});

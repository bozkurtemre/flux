import { describe, expect, it } from "vitest";
import { blameCommand, grepCommand, literalsOf, prCommand, rank, readBlame, readGrep, readPr } from "./located";

describe("what to search the code for", () => {
  it("is the longest literal runs of the template, trimmed of a format's punctuation", () => {
    expect(literalsOf("Provider order failed for iccid <num>: timeout after <num>ms")).toEqual(["Provider order failed for iccid", "timeout after"]);
  });

  it("is nothing when the message is mostly what was filled in", () => {
    expect(literalsOf("<uuid> <num> ok <ip>")).toEqual([]);
  });
});

describe("asking git", () => {
  it("greps tracked files for the literal as it is, leaving vendored code out, quoted for a shell", () => {
    expect(grepCommand("/code/my app", "it's done")).toBe(
      "git -C '/code/my app' grep -n -I -F --full-name -e 'it'\\''s done' -- . ':!vendor' ':!node_modules' ':!*.lock' ':!*.min.js'",
    );
  });

  it("reads git grep's lines back, a colon in the text included", () => {
    expect(readGrep("app/Jobs/Order.php:42:    Log::error('Provider order failed: ' . $e);\nnot a hit\n")).toEqual([
      { file: "app/Jobs/Order.php", line: 42, text: "Log::error('Provider order failed: ' . $e);" },
    ]);
  });

  it("puts the line that writes a log first and a test last", () => {
    const hits = [
      { file: "tests/OrderTest.php", line: 9, text: "Log::error('Provider order failed')" },
      { file: "app/Doc.php", line: 3, text: "// Provider order failed" },
      { file: "app/Order.php", line: 5, text: "$this->logger->error('Provider order failed')" },
    ];
    expect(rank(hits).map((h) => h.file)).toEqual(["app/Order.php", "tests/OrderTest.php", "app/Doc.php"]);
  });

  it("blames the one line, and reads the commit as a person would", () => {
    expect(blameCommand("/code/app", { file: "app/Order.php", line: 5, text: "" })).toContain("blame -L 5,5 --porcelain -- app/Order.php");
    expect(readBlame("abc1234def\tAyşe\t2026-09-30\tfix: retry provider orders\n")).toEqual({
      sha: "abc1234def",
      author: "Ayşe",
      date: "2026-09-30",
      subject: "fix: retry provider orders",
    });
    expect(readBlame("0000000000000000000000000000000000000000\tNot Committed Yet\t\t")).toBeNull();
  });

  it("finds the pull request the commit came in with", () => {
    expect(prCommand("acme/esim", "abc1234")).toBe("gh pr list --repo acme/esim --state merged --search abc1234 --json number,title,url --limit 1");
    expect(readPr('[{"number":412,"title":"Retry","url":"https://github.com/acme/esim/pull/412"}]')).toEqual({
      number: 412,
      title: "Retry",
      url: "https://github.com/acme/esim/pull/412",
    });
    expect(readPr("[]")).toBeNull();
  });
});

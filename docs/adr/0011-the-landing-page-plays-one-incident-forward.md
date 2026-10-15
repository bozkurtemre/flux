# The landing page plays one incident forward

flux.emreb.dev used to be the usual shape: a headline, a screenshot, a grid of feature cards,
three steps, a row of trust badges, a download box. It described Flux; it did not let anyone
feel what Flux is for. The page is now one incident at a fictional shop called acme — at 10:41
`POST /v1/charges` starts timing out — told from the spike to the merged fix, and the visitor
moves it forward. A drawn Flux window, the stage, stays pinned beside the chapters, and every
chapter changes it with a gesture the app really has: ⌥-drag across the spike, ⇧⌘I on the
failing line, right-click › Investigate, the case handed to Claude Code, a saved query watched,
a merge on the radar. The header is Flux's own island, hanging from the top edge and reading the
story's clock; the footer draws the whole hour as one timeline, with the app's status bar as its
rule, the keyboard legend, the colophon and a wordmark the sky flows through.

Everything on the page is drawn from the app's own components and copy, and every capability
shown is one the docs describe. The incident is made up and says so, in the footer, next to the
hour; its numbers come from one table so the explorer, the timeline, the explain panel, the
trace, the case, the terminal, the watch and the footer never disagree. Nothing on the page
pretends to be Claude: the terminal stops where the agent would start thinking, and the
playground under it runs one real tool call with real arguments and no prose answer.

The page is still a static site — one HTML file, one stylesheet, one script, no framework and no
build step — served by the same Worker as before. Its parts were written as fragments and
concatenated once; the repository keeps only the assembled files, so an edit goes straight into
`site/public/index.html`, `site.css` or `site.js`. The legal pages and the 404 share the header
and the footer's status bar and colophon, so the island reads the page title there.

## Consequences

A feature earns a place on the page by being a chapter: a gesture, a scene for the stage, a
state machine, demo data from the story table. A feature the docs do not describe cannot be
shown, whatever the app can do; the page's "must not claim" lists are the docs' limits.

The page depends on the sources' honesty in a second way: the Download button, the version
figure and the footer's version line read `/api/latest`, the manifest the app itself reads, and
degrade to nothing when it is unreachable. Nothing on the page names a version by hand.

The interactions are vanilla DOM and work with a keyboard, a pointer and touch, and under
reduced motion every scene jumps to its end state. They were verified in Chrome with a headless
driver outside the repository; the page has no tests of its own, and a change to a chapter is
checked by hand in Safari and Chrome at desktop and phone widths, with the 390px no-horizontal-
scroll rule as the one hard gate.

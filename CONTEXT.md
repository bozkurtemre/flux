# Flux

Flux reads one company's Graylog and presents it as something you can navigate: a tree of
connections, projects, streams and endpoints, with a terminal beside it in the repository
the logs came from. This file is the vocabulary; it deliberately says nothing about how any
of it is built.

## Language

**Connection**:
One Graylog instance Flux reads, with the credentials to reach it. The window called these
"data sources" while it borrowed the word from the IDE it is modelled on; nothing does now.
_Avoid_: data source, server, instance

**Project**:
A named group of a connection's streams that belong to one service, and therefore to one
repository. A project names its repository as `owner/repo`.
_Avoid_: service, group, application

**Stream**:
A Graylog stream: the partition of a connection's logs that a project is assembled from.
_Avoid_: index, channel, log group

**Endpoint**:
A route a service answers on, derived from the logs of a stream rather than declared
anywhere.
_Avoid_: route, path, URL

**View link**:
A `flux://open?…` link to one stream, one console line and one range, for pasting into a
conversation. It names the Graylog by its URL, so it opens on whichever connection the
receiver has for it, and never carries a token.
_Avoid_: share URL, permalink, deep link

**Set-up file**:
The projects, and the connections under them, written as one file to hand to someone setting
Flux up — Settings › Projects › Export, and Add from export on the other end. Connections travel
as a name and a URL and never with a token; a Graylog already set up is recognised by its URL.
_Avoid_: backup, profile, config export

**Saved query**:
A query kept by name in the workspace it was written in, together with the stream it was
written against. Opening one opens that stream's console and runs it there.
_Avoid_: bookmark, favourite, snippet

**Between clause**:
A `between <from> and <to>` written in a console, in ISO time. It replaces "the last N
minutes" for that console: the window is part of the query, so it can be read, edited and
saved like the rest of it.
_Avoid_: absolute range, time filter, pinned window

**Correlation field**:
The field that ties one request's lines together across the streams different services write
to — a trace, request, correlation or order id. Following one opens a console over every
stream of the connection, oldest first.
_Avoid_: trace, span, join key

**Message pattern**:
The template a log line is counted under once the parts that differ every time — ids, times,
addresses, numbers — are masked. Counted in the rows on screen rather than by Graylog, which
is why a pattern table says how many rows it read.
_Avoid_: cluster, signature, fingerprint

**Group by clause**:
A `| group by <field>` written after the query in a console. Each one asks Graylog for a
count per value of that field and gets its own table above the messages; the messages
themselves are unaffected by it.
_Avoid_: aggregation, facet, pivot

**Project folder**:
The checkout of a project's repository on this machine, where that project's terminal opens.
It belongs to the machine, not to the project: two people looking at the same project have
different project folders, and one of them may have none.
_Avoid_: project path, working directory

**Workspace**:
A folder opened in Flux, which keeps its own stream grouping and its own layout in a `.flux`
directory inside it. Flux runs without one; opening one swaps what is on screen for what that
folder remembers.
_Avoid_: project, session, workspace file

**Session**:
What was open — tabs, branches of the tree, terminals and the size of the panels. It belongs
to one machine and follows the workspace: a folder's session lives with it, and there is one
more for when no workspace is open.
_Avoid_: layout, state, workspace

**Terminal session**:
A shell bound to one project folder. Under the tmux engine it outlives the window that shows
it and the app that opened it, and ends only when it is killed on purpose; under the shell
engine, which is the default, it ends with the tab.
_Avoid_: shell, console, pane

**Terminal engine**:
What a terminal tab runs in, named in Settings: `shell` or `tmux`. It decides whether a
session can outlive the app, and nothing else about the terminal.
_Avoid_: backend, multiplexer, driver

**Update channel**:
The set of versions an installed copy is offered. Flux has one, and it carries only
finished releases.
_Avoid_: track, branch, stream

**Update manifest**:
The single file an installed copy reads to learn what the newest version is, where to fetch
it, and how long a version waits before being offered.
_Avoid_: feed, index, appcast

**Soak time**:
How long a published version waits before any installed copy is offered it. It exists so a
release that turns out to be wrong can be withdrawn before anyone is asked to install it.
_Avoid_: delay, grace period, cooldown

**Terminal tab**:
One view onto a terminal session, shown in the terminal panel. Several tabs on the same
project are independent shells inside that project's one session.
_Avoid_: terminal window, terminal instance

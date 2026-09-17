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

**Project folder**:
The checkout of a project's repository on this machine. It belongs to the machine, not to
the project: two people looking at the same project have different project folders, and
one of them may have none.
_Avoid_: project path, working directory, workspace

**Terminal session**:
A shell bound to one project folder. It outlives the window that shows it and the app that
opened it, and ends only when it is killed on purpose.
_Avoid_: shell, console, pane

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

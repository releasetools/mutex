---
name: help
description: What the mutex plugin can do, and what it will not do
argument-hint: ""
---

Explain the mutex plugin to the user, briefly and without running anything:

- `/mutex:check` - can mutex reach its lock table here
- `/mutex:lock <id> [reason]` - take a lock, an hour by default
- `/mutex:status [id]` - who holds a lock, and what this session holds
- `/mutex:extend <id> [seconds]` - extend a lock before it lapses
- `/mutex:unlock <id>` - hand it back

Then say what it will not do: it never takes a lock unasked, never breaks
somebody else's - there is no `--force`, and taking over a named lock means
naming its owner - never starts or stops the pooled server, never edits
profiles, and never reads the connection string. Those are the user's to run:
`mutex profile`, `mutex server start`, `mutex prune`.

Mention that a lock lasts an hour unless asked otherwise, that a status line
can show the time left, and that a warning arrives at ten minutes and again at
two. Point at <https://github.com/releasetools/mutex#agent-plugin> for the rest.

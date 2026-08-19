---
name: check
description: Check whether mutex can reach its lock table here
argument-hint: ""
---

Run the mutex skill's preflight and report the result.

It answers whether locking works in this environment at all - through a
configured profile, or `$MUTEX_DATABASE_URL` for direct access - and if not,
which half is missing and whose job it is to fix. Report the remedy it prints
as it stands. Never print the connection string, and do not run
`mutex profile` or start a server.

---
name: status
description: Show who holds a mutex lock, and what this session is holding
argument-hint: "[lock-id]"
---

Report on mutex locks, following the mutex skill.

With a lock id in `$ARGUMENTS`, run `mutex status <id>` and say who holds it,
why, and how long is left. With no id, show both: what this session has recorded
as its own, and `mutex list` for everything in the table.

This is read-only. Do not take, release or renew anything.

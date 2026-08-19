---
name: extend
description: Extend a mutex lock you already hold, before it expires
argument-hint: "<lock-id> [seconds, default 3600]"
---

Extend a lock this session holds, following the mutex skill. `$ARGUMENTS` names
the lock, optionally followed by how many seconds to extend it by.

Renewing only ever adds time, and it is strict: the id and the owner must both
match, and an expired lock is refused rather than re-taken, because somebody
else may already have it. If that is what comes back, say the guard has lapsed
before doing anything else.

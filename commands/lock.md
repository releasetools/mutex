---
name: lock
description: Take a mutex lock around work only one caller may do at a time
argument-hint: "<lock-id> [why you are taking it]"
---

Take a mutex lock, following the mutex skill.

The first word of `$ARGUMENTS` is the lock id - the shared resource, not the
task: `staging`, `deploy`, `orders-migration`. Anything after it is the reason,
which shows up for whoever finds the lock in their way. If no id was given, ask
for one rather than inventing it.

Run the preflight first if this session has not already. Take the lock with the
skill's helper so the owner and the expiry are recorded, and report back what
was taken and when it expires.

If somebody else holds it, say who, why, and when their lease ends, then stop.
Do not name them to take it over unless the user asks for exactly that.

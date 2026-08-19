---
name: unlock
description: Hand a mutex lock back
argument-hint: "<lock-id>"
---

Release the mutex lock named in `$ARGUMENTS`, following the mutex skill.

Use the owner that was recorded when it was taken, so it releases what this
session took and nothing else. If no id was given and exactly one lock is
recorded here, release that one; if there are several, list them and ask.

A release refused with exit 5 means the lock is somebody else's now - report
that rather than working around it.

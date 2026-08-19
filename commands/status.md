---
name: status
description: Show what you are holding, and who holds the rest
argument-hint: "[lock-id]"
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/skills/mutex/agent-lock.mjs:*)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/skills/mutex/agent-lock.mjs":*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/skills/mutex/agent-lock.mjs" status`

Relay that, shortest form that keeps the facts: what you hold and for how much
longer, then anything else in the way and whose it is. If `$ARGUMENTS` named a
lock, answer about that one only. This is read-only: take, release and renew
nothing.

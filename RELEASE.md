# Release notes

Newest first. One line per change.

## 1.4.0

- The `enabled` profile setting is now named `default`; existing `profiles.toml` files need the rename. A profile with `default = false` is still selectable with `--profile`.
- Added an agent plugin. Ask a coding agent to guard some work and it takes a mutex lock around it, gives the lock back when the work is done, and warns you before the lease runs out; `/mutex:lock`, `/mutex:unlock` and four more appear in the slash menu. Claude Code and Codex install it from the `releasetools` marketplace at [releasetools/agent-plugins](https://github.com/releasetools/agent-plugins); Hermes, Gemini and Antigravity copy the skill, which ships in the CLI package so a global npm installation has a copy to install from. See [Agent plugin](./README.md#agent-plugin).
- `mutex list` now takes `--owner`, and reads `$MUTEX_OWNER` when the flag is left off, so asking what one owner holds no longer means fetching every lock in the table and filtering them locally. See [Ownership](./README.md#ownership).
- `mutex server status` now prints the running server's version, and names this one alongside when the two differ. A server keeps running the code it started with; until now the only hint of an old one was a protocol number.
- The mutex server's protocol version is now 2. A server left running across the upgrade refuses lock commands with an error that names the mismatch, until it is restarted with `mutex server stop && mutex server start`; stopping and inspecting a server work no matter which version it speaks, so the restart that fixes this never needs `kill` or a pid file.
- `/mutex:status` now asks the lock table for this session's own locks instead of fetching every lock and splitting the list locally; the helper's `--all` still shows what everybody else is holding.
- Connection strings that say `sslmode=require`, `prefer`, `verify-ca` or `allow` keep checking the server's certificate chain and hostname, and node-postgres' SSL deprecation warning no longer prints on every command. Upgrading to pg v9 can no longer weaken them without saying so. See [What `sslmode` means here](./README.md#what-sslmode-means-here).
- mutex now warns when it connects without TLS to anything but a local database, instead of sending the password and every lock in the clear silently.
- A failed TLS handshake now names the setting that most likely caused it, instead of leaving a certificate error or a closed socket to explain itself.
- The mutex server now keeps one database connection open instead of letting it lapse after ten seconds idle. A lock asked for minutes after the last one no longer pays for a fresh handshake, which was about 180 ms per request against a hosted database.
- The mutex server now starts TLS directly whenever the connection is encrypted, without being asked to, and falls back for good after the first refusal. Against PostgreSQL 16 or older that costs one failed connection at startup and nothing afterwards.
- An `sslnegotiation` in the connection string that is neither `postgres` nor `direct` now gets an error naming it, instead of being silently ignored.
- Profiles accept `ssl_negotiation = "direct"`, which removes a round trip from the TLS handshake and needs PostgreSQL 17 or newer. The saved round trip measured 26.5 ms per connection against a hosted database, and there is a benchmark runner to measure your own.
- Documented a mise installation that starts from nothing: one command installs the Node runtime mutex needs and approves the package while it is still below mise's download-count threshold, instead of assuming Node is already there.
- Every release now installs the exact npm package it just published, through an isolated mise-managed Node runtime, so a broken mise installation fails the release that shipped it.
- Pooled CLI commands now start without loading the PostgreSQL client or the mutex server lifecycle code, which cuts the fixed cost of every short-lived command: remote server status measured 81.5 ms, against 316.6 ms for direct access.
- Lock, unlock, and renew now normally finish in one PostgreSQL round trip, with ownership, expiry, and fencing behaving exactly as before; a remote pooled lock/unlock cycle measured 166.7 ms, down from 369.7 ms.
- Added a reusable direct-versus-server benchmark runner that writes its results outside the repository by default.

## 1.3.1

- The npm verification job now retries exact-version installation while a newly published package propagates through the registry, instead of failing on the first transient 404.
- Added an npm release badge to the README, linked to the public `@releasetools/mutex` package.
- Added `npm run cli:unlink` for removing the global link `npm run cli:link` created, so a checkout can be unlinked without remembering the package name.

## 1.3.0

> **`DATABASE_URL` is no longer read.** Any workflow or shell still passing it
> fails with `MUTEX_DATABASE_URL not found` until it is renamed:
>
> ```yaml
> env:
>   MUTEX_DATABASE_URL: ${{ secrets.DATABASE_URL }} # was DATABASE_URL:
> ```
>
> 1.2.2 read both and warned when the old name was used; that warning names the
> variable to set. The Action's `DATABASE_URL` input is gone with it.

- Removed `DATABASE_URL`. `MUTEX_DATABASE_URL` is the only name mutex reads, in the Action and the CLI, so a lock can no longer land in whatever database something else set that name to.
- Added explicit direct and server profiles, including a background TCP server that keeps PostgreSQL connections warm for faster CLI lock operations, a systemd template, and a rootless per-user macOS LaunchAgent.
- Running `mutex` without arguments now prints the general help instead of returning a usage error.
- `mutex server status` and `mutex server stop` now identify a missing profiles file instead of claiming the implicit direct connection is a configured profile.
- Published the CLI as the public `@releasetools/mutex` package with provenance, so npm and mise can install it without cloning the repository.
- The npm package description now explains how its Postgres-backed TTL locks coordinate the GitHub Action and CLI.
- Renamed the release artifact command to `npm run package:release`, reflecting that it assembles both the GitHub Action and npm CLI package.
- Added `npm run cli:link` for building and linking a checkout and `npm run check` for formatting, building, and testing it locally.

## 1.2.2

- The connection string now comes from `MUTEX_DATABASE_URL`, in both the Action and the CLI. `DATABASE_URL` is set by almost every framework, ORM and PaaS, and points at the application's database rather than the one holding locks - so mutex asks for a name of its own.
- `DATABASE_URL` still works and still takes locks, but warns when it is what was used. It will be removed in a future major version.
- The Action takes a `MUTEX_DATABASE_URL` input as well, for workflows that pass it under `with:` rather than as an environment variable.
- The Action can now record an optional lock owner, so status commands identify the holding workflow and only that owner can unlock or renew it; leaving `owner` unset preserves unowned locks.

## 1.2.1

- Slack notifications are now switched on by `slack-channel` alone. A workflow that never asked for them no longer logs a warning about a missing `SLACK_BOT_TOKEN` on every lock and release.
- Fixed a `SLACK_BOT_TOKEN` inherited from job-level `env:` failing any mutex step that set no `slack-channel`. The channel decides; an unrelated variable in the environment no longer can.

## 1.2.0

> **Upgrading from 1.1.0 adds a column.** It is applied automatically on the
> first run. A role without DDL rights - the setup the README describes for
> pre-created tables - needs it applied by hand first, or every lock will fail:
>
> ```sql
> ALTER TABLE releasetools_mutex ADD COLUMN IF NOT EXISTS owner TEXT;
> ```

- Added a `mutex` CLI, so locks can be taken outside GitHub Actions - from a laptop, a cron job, or another CI system.
- `mutex lock <id> -- <program>` holds the lock for exactly as long as the program runs, and gives it back on every exit path.
- The CLI reads its connection string from `$DATABASE_URL`. There is no flag for it: an argument is readable from `ps` by anyone on the machine. To use a secret store, put the value in the environment for one command - `DATABASE_URL="$(dotsecenv secret get ...)" mutex lock x` - or let the dotsecenv shell plugin export it.
- Locks can now record an owner: name one with `--owner`, and only that owner can unlock or renew it. Unnamed stays unowned and open to anyone, as the Action writes today.
- Breaking somebody else's lock means naming its owner, which the refusal message spells out. There is no force flag.
- Added `mutex renew` to extend a lock you already hold; the id and owner must match, and it will not take a lock you do not hold.
- Added `mutex status`, `mutex list` and `mutex prune` for seeing and tidying up what is held.
- Fixed lock expiry on databases whose session time zone is not UTC, where every lock read as already expired and nothing was ever excluded.
- Fixed the schema check running on every operation instead of once.
- Fixed a wrapped program's lock being released after somebody else had taken it over; the release now checks it is giving back the lock it took.
- Fixed `renew` silently cutting a long lease short. It now only ever moves an expiry further out, and defaults to an hour rather than a minute.
- The Action now reports a `version` output, so the release workflow can prove the build it tested is the one just released rather than a cached older one.
- `--quiet` now suppresses the ordinary report as well as logs, so the exit code can be used on its own. Refusals and failures are still printed.
- A lock left held after a wrapped program is now an error naming the command to release it, rather than a warning `--quiet` hid.
- Deprecated `command: release` in the Action; use `command: unlock`.

## 1.1.0

- Advisory locks for GitHub Actions workflows, backed by PostgreSQL.
- Lock and release events are posted as pull request comments.
- Optional Slack notifications when locks are taken and released.
- Locks are released automatically when a job ends, unless `auto-release` says otherwise.
- Locking can be skipped per pull request with a `SKIP_MUTEX` label, comment, description or environment variable.

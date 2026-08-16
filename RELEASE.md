# Release notes

Newest first. One line per change.

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

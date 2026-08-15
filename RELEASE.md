# Release notes

Newest first. One line per change.

## 1.2.0

- Added a `mutex` CLI, so locks can be taken outside GitHub Actions - from a laptop, a cron job, or another CI system.
- `mutex lock <id> -- <program>` holds the lock for exactly as long as the program runs, and gives it back on every exit path.
- The CLI reads its connection string from a `.secenv` file, decrypting it through the dotsecenv CLI, so it never has to be typed out.
- Locks can now record an owner: name one with `--owner`, and only that owner can unlock or renew it. Unnamed stays unowned and open to anyone, as the Action writes today.
- Added `mutex renew` to extend a lock you already hold; the id and owner must match, and it will not take a lock you do not hold.
- `mutex lock` mints a UUID when no id is given, which is all a wrapped program needs.
- Added `mutex status`, `mutex list` and `mutex prune` for seeing and tidying up what is held.
- Fixed lock expiry on databases whose session time zone is not UTC, where every lock read as already expired and nothing was ever excluded.
- Fixed the schema check running on every operation instead of once.
- Deprecated `command: release` in the Action; use `command: unlock`.

## 1.1.0

- Advisory locks for GitHub Actions workflows, backed by PostgreSQL.
- Lock and release events are posted as pull request comments.
- Optional Slack notifications when locks are taken and released.
- Locks are released automatically when a job ends, unless `auto-release` says otherwise.
- Locking can be skipped per pull request with a `SKIP_MUTEX` label, comment, description or environment variable.

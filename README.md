# mutex

[![CodeQL](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml/badge.svg)](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml)

An advisory lock service for CI/CD pipelines. It prevents race conditions by ensuring mutual exclusion - only one job can access a shared resource concurrently.

It ships in two forms, sharing one lock table:

- a **GitHub Action**, for locking inside a workflow;
- a **CLI** (`mutex`), for locking from a terminal, a script, or any other CI system.

## How it works

Locks live in a PostgreSQL table. When a job needs a lock, it inserts a row - or takes over an expired one - inside a transaction guarded by a Postgres advisory lock, so two callers can never win at once. If the lock is taken, the caller waits or fails, depending on configuration.

## Features

- **Advisory Locking**: Create and manage locks within your GitHub Actions workflows.
- **A CLI**: `mutex lock` / `mutex unlock`, plus a flock-style `mutex lock <id> -- <program>` that holds the lock for exactly as long as the program runs.
- **Secrets via dotsecenv**: The CLI reads the connection string from a `.secenv` file, decrypting it through the [dotsecenv](https://dotsecenv.com) CLI, so it never has to be pasted on a command line.
- **Pull Request Integration**: Lock and release events are posted as PR comments.
- **Slack Notifications**: Choose if you want to be notified in your Slack channels about locking events.
- **Easy Disabling**: Skip locking for specific pull requests by:
  - adding a `SKIP_MUTEX` label
  - including `SKIP_MUTEX` in the PR's description or comment
  - or defining `SKIP_MUTEX=1` as an environment variable.

## Usage Example

Here is an example of how to use the `mutex` action in a workflow:

```yaml
- name: Acquire Lock
  uses: releasetools/mutex@v1
  permissions:
    contents: read
    pull-requests: write
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
  with:
    command: "lock"
    id: "my-resource"
    slack-channel: "#ci-cd"
```

Any other workflows or actions using a `mutex` on the same lock `id`, will not run until the lock is released.

## Configuration

### Prerequisites

- A **PostgreSQL database**: This action requires access to a PostgreSQL database to store lock information. You can use any standard Postgres provider. If you need a free one for getting started, consider using [Neon](https://neon.new).

### Environment Variables

The action supports the following environment variables (`env:`).

#### `DATABASE_URL`

Connection string for a PostgreSQL database. The action will create a table named `releasetools_mutex` if it doesn't exist, and keep its schema up to date. If the role specified in the connection string cannot create or alter tables, ensure such a table exists. You can find the schema definition in [database.ts](./src/database.ts).

#### `GITHUB_TOKEN`

The action needs access to the GitHub API. It can be passed via `${{ secrets.GITHUB_TOKEN }}`. The workflow needs additional permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
```

#### `SLACK_BOT_TOKEN`

The Slack Bot Token for sending notifications. It requires the `chat:write` permission, and the associated bot must be invited to the specified `slack-channel`, otherwise it will fail to post.

### Action Inputs

The action can be configured using inputs (`with:`).

#### `command`

**Required.** The command to execute: `lock` or `unlock`.

> [!WARNING]
> **`release` is deprecated.** It remains accepted as a synonym for `unlock` so that workflows written against earlier versions keep working, and using it logs a deprecation warning. It will be removed in a future major version - switch to `unlock`.

#### `id`

**Required.** A unique identifier for the lock.

#### `reason`

Optional reason for taking the lock. Useful to provide context regarding which service took the lock and why.

#### `expiration`

Lock expiration in seconds from current time. Defaults to 60 seconds in the future.

#### `max-wait`

Maximum time in seconds to wait to acquire the lock, before failing.
If not specified, it defaults to `-1` which results in using the specified `expiration` as a timeout for the current run.

#### `poll-interval`

Allows changing the polling interval. Useful for long-duration locks.

#### `auto-release`

Used to signal if a lock should be automatically released when the workflow job ends. Defaults to `true`.

#### `disable-pr-updates`

By default, a comment will be posted on the Pull Request running the action, when locks are acquired or released.
Set it to `true` to never post comments on PRs.

#### Outputs

`status` is `locked`, `released`, `failed` or `skipped`. `version` reports which build of the action ran, which the release workflow asserts against the tag being released.

#### `slack-channel`

**Required for Slack notifications.** The Slack channel to post updates to (e.g., `C12345678`).
The bot that owns the `SLACK_BOT_TOKEN` should be a member of this channel.

See [Slack API docs](https://docs.slack.dev/reference/methods/chat.postMessage/#channels) for channel ID formats.

## CLI

The same locking core is available as a command-line tool, for locking outside GitHub Actions - from a laptop, a cron job, or another CI system. It talks to the same `releasetools_mutex` table, so a CLI lock and an Action lock exclude each other.

### Installing

```shell
npm install
npm run build
npm link        # puts `mutex` on your PATH
```

Without `npm link`, run it as `node ./bin/mutex.js` or `npm run mutex -- <args>`.

### Commands

| Command                        | What it does                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `mutex lock <id>`              | Acquire a lock, waiting up to `--max-wait` for it          |
| `mutex lock <id> -- <program>` | Acquire it, run the program, release it - whatever happens |
| `mutex try-lock <id>`          | Acquire it in a single attempt, without waiting            |
| `mutex unlock <id>`            | Release it                                                 |
| `mutex renew <id>`             | Extend a lock you already hold                             |
| `mutex status <id>`            | Show who holds it                                          |
| `mutex list`                   | List every lock, expired ones included                     |
| `mutex prune`                  | Delete locks that have already expired                     |

The command names map onto the operations in [mutex.ts](./src/mutex.ts): `lock` and `try-lock` are `tryLock` (the latter with nothing to wait for), `unlock` is `tryUnlock`.

### Renewing

A lock lasts `--expiration` seconds. `renew` pushes that further out for a job still running:

```shell
mutex renew deploy --owner "$CI_RUN" --expiration 300
```

`--expiration` defaults to an hour here rather than the 60 seconds `lock` uses: a renewal is asked for by something that has already been running a while, so a short default is exactly wrong.

**Renewing only ever buys time.** The new expiry is whichever is later, `now + --expiration` or the expiry the lock already had, so asking for less than it already has is a no-op rather than a silent cut:

```shell
$ mutex lock deploy -e 7200 --owner ci   # two hours
$ mutex renew deploy --owner ci          # asks for one
Kept lock 'deploy'
  expires: 2026-08-16T01:44:20.165Z (in 2h 0m)
```

It is otherwise deliberately strict, because a renewal that silently succeeds when it should not is worse than one that fails:

- **The id and the owner must both match.** Renewing a lock you do not hold is never right, so name its owner or do not renew it.
- **It never takes a lock.** Renewing something that is not held fails rather than quietly acquiring it.
- **An expired lock cannot be renewed.** By then somebody else may already have taken it over, so it reports the expiry and stops.

Exit codes tell the cases apart: `4` for gone or expired, `5` for held by another owner.

Locks taken by the GitHub Action are unowned, so a CLI caller that does not name an owner can renew them too.

### Wrapping a program

This is the form worth reaching for. The lock is held for exactly as long as the program runs and is released on every exit path, including a crash or a `Ctrl-C`:

```shell
mutex lock deploy-staging --reason "deploying $GIT_SHA" -- ./deploy.sh
```

Details worth knowing:

- The program's exit status becomes `mutex`'s, exactly like `flock`. A program killed by a signal yields `128 + signal`.
- The program owns stdout; `mutex` reports on stderr, so pipelines stay clean.
- `SIGINT`, `SIGTERM` and `SIGHUP` are forwarded to the program, and the lock is released once it exits. Signals stay handled _through_ that release, so an impatient second `Ctrl-C` waits rather than killing mutex with the lock still held. Three of them and it gives up anyway, saying so.
- The lock is renewed in the background every `--expiration / 3` seconds, so a program that outlives its lease does not carry on holding a lock somebody else has taken. Disable with `--no-renew`.

### Ownership

Acquiring is decided by expiry alone: while a lock is held, nobody gets it - not even the owner. Ownership decides who may **unlock** and **renew** it.

```
alice lock LOCK1     ok          alice lock LOCK1     ok, long-running
bob   lock LOCK1     held        bob   lock LOCK1     held
alice unlock LOCK1   ok          bob   renew  LOCK1   wrong owner
bob   lock LOCK1     ok          bob   unlock LOCK1   wrong owner
bob   unlock LOCK1   ok
```

`--owner` is optional and there is no default. Without it, and without `$MUTEX_OWNER`, the lock is **unowned** - which is what the GitHub Action writes today.

| Lock      | Caller      | `unlock` | `renew` |
| --------- | ----------- | -------- | ------- |
| unowned   | anyone      | yes      | yes     |
| same name | same name   | yes      | yes     |
| named     | anyone else | refused  | refused |

Naming an owner is the act that buys protection. An unowned lock has nobody to wrong, so anyone may unlock or renew it - which is also what keeps the Action's locks manageable from the CLI while [#67](https://github.com/releasetools/mutex/issues/67) is outstanding.

```shell
mutex lock deploy --owner "$CI_RUN"
```

There is no `--force`. To break somebody else's lock you name them, which the refusal tells you how to do:

```shell
$ mutex unlock deploy
'deploy' is held by 'alice'; this call is unowned. Pass --owner 'alice' to unlock it.

$ mutex unlock deploy --owner alice
Unlocked 'deploy'.
```

That is a confirmation, not a permission check - anyone can read the owner from `mutex status`. The point is that breaking a lock has to be a deliberate statement of whose lock it is, rather than a flag appended to a command that just failed.

The wrapper is careful about which lock it gives back: it remembers the `created_at` of the acquisition it made, and declines to release the id if a later one has replaced it. So a lock that lapses mid-run and is taken by somebody else stays theirs, ownership or no ownership.

### Where the connection string comes from

In order of precedence:

1. `--database-url <url>`
2. `$DATABASE_URL` (rename with `--env-var`)
3. the `.secenv` chain, decrypted through the dotsecenv CLI

The third is the interesting one. Given a project like this:

```
my-project/
├── .secenv                  DATABASE_URL={dotsecenv/myapp::DATABASE_URL}
└── .dotsecenv/vault         the encrypted vault, safe to commit
```

running `mutex lock deploy` in `my-project` resolves `DATABASE_URL` on its own:

```shell
$ mutex lock deploy --verbose
debug: Reading /my-project/.secenv
debug: Resolved DATABASE_URL from secret 'myapp::DATABASE_URL' (.dotsecenv/vault).
Acquired lock 'deploy'
```

Nothing is stored in shell history, and no plaintext connection string is written anywhere.

Only the working directory's `.secenv` is read - there is no search, upward or otherwise. A search has to stop somewhere, and outside a repository there is no sensible somewhere: from `/tmp/build-1234` it would reach `/tmp`, where anyone could plant the file that decides which database mutex locks against. Run mutex from the directory holding the `.secenv`.

Use `--no-secenv` to switch this off entirely.

### Exit codes

| Code  | Meaning                                                   |
| ----- | --------------------------------------------------------- |
| `0`   | Success (`status`: the lock is held)                      |
| `1`   | Error                                                     |
| `2`   | Usage error                                               |
| `3`   | Configuration error - no usable connection string         |
| `4`   | Not acquired, or not held                                 |
| `5`   | Refused - another owner holds the lock, and was not named |
| `126` | The wrapped program exists but could not be run           |
| `127` | The wrapped program was not found                         |

While wrapping a program, its exit status is returned instead.

This makes the read-only commands scriptable:

```shell
if mutex status deploy-staging --quiet; then
  echo "someone is deploying"
fi
```

`--quiet` silences the report and leaves the exit code to answer. `--json` is unaffected by it.

### The dotsecenv client

The CLI does not reimplement dotsecenv's cryptography. [`src/dotsecenv/`](./src/dotsecenv) is a small Node client that:

- **reads a `.secenv`** ([`secenv.ts`](./src/dotsecenv/secenv.ts)) using the same rules as the dotsecenv shell plugin - `{dotsecenv}`, `{dotsecenv/SECRET}`, `{dotsecenv/ns::SECRET}`, quote stripping, and two-phase loading, plain values before secrets.
- **reads the vault index** ([`vault.ts`](./src/dotsecenv/vault.ts)) from `.dotsecenv/vault`, parsing the v2 header without touching GPG. Older vaults are rejected outright, pointing at `dotsecenv vault doctor` to upgrade them. This is what turns an exit code into a usable message - it knows which secrets a vault holds, which GPG fingerprints each is readable by, and which have been forgotten:

  ```shell
  $ mutex status deploy
  error: could not resolve DATABASE_URL from .secenv:
  could not read secret 'myapp::NOT_THERE' (/my-project/.secenv:1 maps DATABASE_URL to secret 'myapp::NOT_THERE')
    secret 'myapp::NOT_THERE' not found in any vault
    hint: /my-project/.dotsecenv/vault holds: myapp::DATABASE_URL.
  ```

- **calls the dotsecenv CLI** ([`cli.ts`](./src/dotsecenv/cli.ts)) to decrypt. It runs the binary from the directory holding the `.secenv`, which is what makes a relative vault path such as `.dotsecenv/vault` resolve to the project's own vault. Values are fetched with `--json` so they survive trailing whitespace, stdout is captured so a secret never lands in the tool's own output, and stdin is inherited so a GPG passphrase prompt can still reach the terminal.

It requires the [dotsecenv CLI](https://dotsecenv.com) on `PATH` - override with `--dotsecenv-bin` or `$DOTSECENV_BIN`.

Only the variable actually needed is decrypted; anything else the `.secenv` references stays encrypted.

## Development

**All contributions are welcome!**

1. Clone the repository:

   ```shell
   git clone https://github.com/releasetools/mutex.git
   cd mutex
   ```

2. Install dependencies and pre-commit hooks:

   ```shell
    npm install
    npm run prepare
   ```

Layout:

| Path              | What lives there                                                          |
| ----------------- | ------------------------------------------------------------------------- |
| `src/mutex.ts`    | `tryLock` / `tryUnlock` - the polling logic, with no GitHub dependencies  |
| `src/database.ts` | The PostgreSQL lock store                                                 |
| `src/main.ts`     | The Action's entry point; `src/post.ts` auto-releases at the end of a job |
| `src/cli/`        | The `mutex` CLI                                                           |
| `src/dotsecenv/`  | The `.secenv` / vault client                                              |

`src/mutex.ts` and `src/database.ts` take a `Logger` and emit events rather than calling into `@actions/core`, which is what lets both front-ends share them.

You can learn about creating GitHub actions in this [tutorial](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action).

## Releasing

You can use [releasetools-cli](https://github.com/releasetools/cli) to create release tags.

Run this command to tag the HEAD commit and also update the `v1` tag.

```shell
releasetools git::release --major --sign --force --push v1.0.2
```

Since `mutex` is a Javascript-based action, no other step is needed to make a new release available.

### Release notes

Use the template below to draft new releases. Update the changelog section to include all relevant changes/features/bugfixes.

```markdown
## Summary

- An advisory lock service for CI/CD pipelines, implemented as a GitHub Action.
- It prevents race conditions by ensuring mutual exclusion - only one job can access a shared resource concurrently.

## Features

- **Advisory Locking**: Create and manage locks within your GitHub Actions workflows.
- **Pull Request Integration**: Lock and release events are posted as PR comments.
- **Slack Notifications**: Choose if you want to be notified on Slack about locking events.
- **Easy Disabling**: Skip locking for specific pull requests by:
  - adding a `SKIP_MUTEX` label
  - including `SKIP_MUTEX` in the PR's description or comment
  - or defining `SKIP_MUTEX=1` as an environment variable.

## Changelog

- TBD.
```

## License

Copyright &copy; 2025-2026 Mihai Bojin

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

<http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

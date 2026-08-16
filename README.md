# mutex

[![CodeQL](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml/badge.svg)](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml)

An advisory lock service for CI/CD pipelines. Only one job at a time holds a given lock, so concurrent workflows do not race over shared resources.

Two front ends share one lock table: a GitHub Action for locking inside a workflow, and a `mutex` CLI for everywhere else.

## How it works

Locks live in a PostgreSQL table. Taking one inserts a row, or takes over an expired row, inside a transaction guarded by a Postgres advisory lock, so two callers cannot both win. If the lock is already held, the caller waits or fails depending on how you configure it.

## Features

- Locks are held in Postgres, shared between the Action and the CLI.
- `mutex lock <id> -- <program>` holds a lock for exactly as long as a program runs.
- Lock and release events are posted as pull request comments, and optionally to Slack.
- Locking can be skipped for a pull request with a `SKIP_MUTEX` label, a `SKIP_MUTEX` mention in the description or a comment, or `SKIP_MUTEX=1` in the environment.

## Usage example

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

Any other workflow using the same lock `id` waits until this one releases it.

## Configuration

### Prerequisites

A PostgreSQL database, from any provider. [Neon](https://neon.new) has a free tier if you need one to start with.

### Environment variables

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

### Action inputs

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

The same locking core ships as a command-line tool, so you can take the same locks outside GitHub Actions. It uses the same `releasetools_mutex` table, so a CLI lock and an Action lock exclude each other.

### Installing

```shell
npm install
npm run build   # the CLI is built, not committed
npm link        # puts `mutex` on your PATH
```

Without `npm link`, run `node ./bin/mutex.js` or `npm run mutex -- <args>`.

### Commands

| Command                        | What it does                               |
| ------------------------------ | ------------------------------------------ |
| `mutex lock <id>`              | Acquire a lock, waiting up to `--max-wait` |
| `mutex lock <id> -- <program>` | Acquire it, run the program, release it    |
| `mutex try-lock <id>`          | Acquire it in a single attempt             |
| `mutex unlock <id>`            | Release it                                 |
| `mutex renew <id>`             | Extend a lock you already hold             |
| `mutex status <id>`            | Show who holds it                          |
| `mutex list`                   | List every lock, expired ones included     |
| `mutex prune`                  | Delete locks that have already expired     |

The names map onto [mutex.ts](./src/mutex.ts): `lock` and `try-lock` both call `tryLock`, `unlock` calls `tryUnlock`.

### Wrapping a program

The lock is held for exactly as long as the program runs, and released on every exit path including a crash or `Ctrl-C`:

```shell
mutex lock deploy-staging --reason "deploying $GIT_SHA" -- ./deploy.sh
```

- The program's exit status becomes mutex's, like `flock`. Killed by a signal gives `128 + signal`.
- The program owns stdout. mutex reports on stderr, so pipelines stay clean.
- `SIGINT`, `SIGTERM` and `SIGHUP` reach the program, and the lock goes back once it exits. Signals stay handled during that release, so a second `Ctrl-C` waits instead of killing mutex with the lock still held. Three of them and it gives up, saying so.
- The lock renews in the background every `--expiration / 3` seconds, so a long program does not carry on holding a lock somebody else has taken. Disable with `--no-renew`.

It also checks which lock it gives back. It remembers the `created_at` of the acquisition it made and declines the id if a later one replaced it, so a lock that lapses mid-run and is taken by somebody else stays theirs.

### Renewing

A lock lasts `--expiration` seconds. `renew` pushes that out for a job still running:

```shell
mutex renew deploy --owner "$CI_RUN" --expiration 300
```

Here `--expiration` defaults to an hour rather than the 60 seconds `lock` uses, since anything asking for a renewal has been running a while.

Renewing only ever adds time. The new expiry is whichever is later, `now + --expiration` or the expiry the lock already had:

```shell
$ mutex lock deploy -e 7200 --owner ci   # two hours
$ mutex renew deploy --owner ci          # asks for one
Kept lock 'deploy'
  expires: 2026-08-16T01:44:20.165Z (in 2h 0m)
```

Otherwise it is strict. The id and the owner must both match, and it never takes a lock rather than renewing one. An expired lock is refused too, since somebody else may already have taken it over. Exit code `4` means gone or expired, `5` means held by another owner.

Locks taken by the GitHub Action are unowned, so a CLI caller that names no owner can renew them.

### Ownership

Acquiring depends on expiry alone: while a lock is held nobody gets it, including its owner. Ownership decides who may unlock and renew.

```
alice lock LOCK1     ok          alice lock LOCK1     ok, long-running
bob   lock LOCK1     held        bob   lock LOCK1     held
alice unlock LOCK1   ok          bob   renew  LOCK1   wrong owner
bob   lock LOCK1     ok          bob   unlock LOCK1   wrong owner
bob   unlock LOCK1   ok
```

`--owner` is optional with no default. Without it, and without `$MUTEX_OWNER`, the lock is unowned, which is what the GitHub Action writes today.

| Lock      | Caller      | `unlock` | `renew` |
| --------- | ----------- | -------- | ------- |
| unowned   | anyone      | yes      | yes     |
| same name | same name   | yes      | yes     |
| named     | anyone else | refused  | refused |

Only a named lock is protected. An unowned one is open to anyone, which is what lets the CLI manage the Action's locks while [#67](https://github.com/releasetools/mutex/issues/67) is open.

```shell
mutex lock deploy --owner "$CI_RUN"
```

There is no `--force`. To break somebody else's lock you name them, and the refusal says how:

```shell
$ mutex unlock deploy
'deploy' is held by 'alice'; this call is unowned. Pass --owner 'alice' to unlock it.

$ mutex unlock deploy --owner alice
Unlocked 'deploy'.
```

That is confirmation rather than authorisation, since anyone can read the owner from `mutex status`. It makes breaking a lock deliberate.

### Where the connection string comes from

`$DATABASE_URL`, and nowhere else. Rename it with `--env-var` if something already owns that name.

There is no flag for it. An argument lands in shell history and in `ps`, where every user on the machine can read it for as long as mutex runs:

```shell
DATABASE_URL="postgres://..." mutex lock deploy
```

mutex does not read secret stores. Whatever holds the secret can put it in the environment for one command, with [dotsecenv](https://dotsecenv.com) for example:

```shell
DATABASE_URL="$(dotsecenv secret get myapp::DATABASE_URL)" mutex lock deploy
```

Interactively there is nothing to pass, because [dotsecenv's shell plugin](https://dotsecenv.com/guides/shell-plugins/) exports it when you `cd` into the project.

### Exit codes

| Code  | Meaning                                         |
| ----- | ----------------------------------------------- |
| `0`   | Success (`status`: the lock is held)            |
| `1`   | Error                                           |
| `2`   | Usage error                                     |
| `3`   | No usable connection string                     |
| `4`   | Not acquired, or not held                       |
| `5`   | Another owner holds the lock, and was not named |
| `126` | The wrapped program exists but could not be run |
| `127` | The wrapped program was not found               |

While wrapping a program, its exit status is returned instead.

So the read-only commands are scriptable:

```shell
if mutex status deploy-staging --quiet; then
  echo "someone is deploying"
fi
```

`--quiet` silences the ordinary report and leaves the exit code to answer. It does not silence a lock not acquired, a release refused, or a lock left held: those go to stderr whatever the verbosity. `--json` is unaffected by both.

## Development

Contributions are welcome.

```shell
git clone https://github.com/releasetools/mutex.git
cd mutex
npm install
npm run prepare   # pre-commit hooks
```

| Path              | What lives there                                                          |
| ----------------- | ------------------------------------------------------------------------- |
| `src/mutex.ts`    | `tryLock` / `tryUnlock`, the polling logic, with no GitHub dependencies   |
| `src/database.ts` | The PostgreSQL lock store                                                 |
| `src/main.ts`     | The Action's entry point. `src/post.ts` auto-releases at the end of a job |
| `src/cli/`        | The `mutex` CLI                                                           |

`src/mutex.ts` and `src/database.ts` take a `Logger` and emit events instead of calling `@actions/core`, which is what lets both front-ends share them.

GitHub has a [tutorial](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action) on writing JavaScript actions.

## Releasing

`main` holds source only. What `releasetools/mutex@v1` resolves to is built during the release and published to the `release/v1` branch, so a release is a workflow run rather than a `git tag`.

### Cutting a release

Add the notes for the new version to [RELEASE.md](./RELEASE.md) under a `## 1.3.0` heading, merge that to `main`, then:

```shell
gh workflow run release.yaml -f version=v1.3.0
```

The release bumps `package.json` itself and pushes that to `main` as a signed commit, so there is no version to remember to edit and no way for `package.json` and the tag to disagree.

Two options, both off by default:

| Option                |                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `allow-lower-version` | Publish below the highest released version, for back-porting to an older line. Without it, `v1.2.22` after `v1.3.0` is refused. |
| `overwrite-existing`  | Replace a version already published: moves its tag and updates its GitHub release.                                              |

They are separate on purpose. Replacing a release and releasing out of order are different decisions, so neither flag grants the other.

### What it does

| Step            |                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-e2e-pin` | Refuses to publish a major the verify step cannot test                                                                                         |
| Check           | Rejects a malformed version, one already released, or one below the highest released                                                           |
| Bump            | Sets the version in `package.json` and `package-lock.json`, and pushes that to `main`                                                          |
| Build           | `npm ci`, lint, test                                                                                                                           |
| Package         | `npm run package:action` assembles `publish/`: `action.yml`, `dist/`, `README.md`, `LICENSE`, and a `package.json` carrying the version        |
| Publish         | [`signed-push`](https://github.com/releasetools/actions/tree/main/signed-push) commits that tree to `release/v1`, signed server-side by GitHub |
| Tag             | Points `v1.3.0` and the floating `v1` at that commit                                                                                           |
| Release         | Creates or updates the GitHub release, with the notes from RELEASE.md                                                                          |
| Verify          | Uses `releasetools/mutex@v1` for real and checks the version it reports                                                                        |

The first release on a new major seeds `release/<major>` from `main` automatically.

Packaging is a script rather than workflow YAML, so you can see what a release would publish without cutting one:

```shell
npm run package:action
node publish/dist/main/index.js      # reports the version it would report in CI
```

### Afterwards

```shell
git fetch origin 'refs/tags/*:refs/tags/*'
git show --stat v1.3.0
gh api repos/releasetools/mutex/commits/v1 --jq .commit.verification.verified
```

Each published commit's parent is the previous release, so `release/v1` reads as a history of releases. The source it was built from is a `Source-Commit:` trailer rather than a parent.

### When something goes wrong

The verify step failing means the release is published but broken, since `v1` has to move before anything can use it. Fix forward with a new patch. If it says `v1 ran mutex <older version>`, the tag move had not reached GitHub's action cache yet and re-running that job is enough.

`check-e2e-pin` failing means you are releasing a major the verify step still pins to `@v1`. Write a second verify job for the new major and update `PINNED`. Nothing is published until then.

A version mismatch means `package.json` and the dispatched tag disagree. Nothing has been published.

`uses: releasetools/mutex@main` does not work, and is not meant to. There is no `dist/` there.

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

# mutex

[![CodeQL](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml/badge.svg)](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml)

Only one CI job at a time gets to touch a shared resource. mutex keeps advisory locks in a PostgreSQL table, so a workflow that wants the staging environment waits for whoever has it instead of racing them.

Two front ends sit over one table: a GitHub Action for locking inside a workflow, and a `mutex` CLI for everywhere else. A lock taken by either excludes the other. The Action comments on the pull request when a lock is taken and given back, and can post the same to Slack.

## Quickstart

You need a PostgreSQL database. [Neon](https://neon.new) has a free tier if you do not already have one. mutex creates its own table on first use.

### In a workflow

```yaml
permissions:
  contents: read
  pull-requests: write

steps:
  - uses: releasetools/mutex@v1
    env:
      MUTEX_DATABASE_URL: ${{ secrets.MUTEX_DATABASE_URL }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    with:
      command: "lock"
      id: "staging"
```

Any other job using `id: staging` now waits. The lock goes back when the job ends, so there is no unlock step to forget.

### On the command line

```shell
npm install
npm run build   # the CLI is built, not committed
npm link        # puts `mutex` on your PATH

MUTEX_DATABASE_URL="postgres://..." mutex lock staging -- ./deploy.sh
```

The lock is held for exactly as long as `deploy.sh` runs, and released however it exits. Without `npm link`, run `node ./bin/mutex.js` or `npm run mutex -- <args>`.

## Reference

### Action inputs

| Input                | Default    |                                                                       |
| -------------------- | ---------- | --------------------------------------------------------------------- |
| `command`            | _required_ | `lock` or `unlock`                                                    |
| `id`                 | _required_ | Name of the lock                                                      |
| `reason`             | `""`       | Why it is being taken. Shows up in PR comments and `mutex status`     |
| `owner`              | `""`       | Who owns it. Only the same owner may unlock or renew a named lock     |
| `expiration`         | `60`       | Seconds the lock lasts                                                |
| `max-wait`           | `-1`       | Seconds to wait for it. `-1` waits for as long as `expiration`        |
| `poll-interval`      | `10`       | Seconds between attempts                                              |
| `auto-release`       | `true`     | Give the lock back when the job ends                                  |
| `disable-pr-updates` | `false`    | Stop commenting on the pull request                                   |
| `slack-channel`      |            | Channel ID to post to, such as `C12345678`. Setting it turns Slack on |

`MUTEX_DATABASE_URL`, `GITHUB_TOKEN` and `SLACK_BOT_TOKEN` are accepted as inputs too, if you would rather pass them under `with:` than as environment variables. See Slack's [chat.postMessage docs](https://docs.slack.dev/reference/methods/chat.postMessage/#channels) for the channel ID formats it accepts.

> [!WARNING]
> **`DATABASE_URL` is deprecated.** It is still read when `MUTEX_DATABASE_URL` is unset, and warns when it is, so existing workflows keep running. Rename it: everything from ORMs to PaaS providers sets `DATABASE_URL`, usually to the application's own database, and a lock taken in the wrong database excludes nobody. It goes away in a future major version.
>
> **`release` is deprecated.** It still works as a synonym for `unlock`, and logs a warning when used, so workflows written against earlier versions keep running. It goes away in a future major version.

### Action outputs

| Output    |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| `status`  | `locked`, `released`, `failed` or `skipped`                                    |
| `version` | Which build of the action ran. The release workflow asserts it against the tag |

### Environment variables

| Variable             |                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MUTEX_DATABASE_URL` | The connection string. Required by both front ends                                                                                                      |
| `DATABASE_URL`       | Deprecated. Read when `MUTEX_DATABASE_URL` is unset, and warns                                                                                          |
| `GITHUB_TOKEN`       | Needed by the Action for PR comments                                                                                                                    |
| `SLACK_BOT_TOKEN`    | Read only when `slack-channel` is set. Requires `chat:write`, and the bot has to be a member of the channel or posting fails                            |
| `SKIP_MUTEX`         | Present in the environment at all, whatever the value, and the Action skips locking. Also works as a PR label, or a word in a PR description or comment |
| `MUTEX_OWNER`        | CLI only. Supplies `--owner` when the flag is left off                                                                                                  |

### CLI commands

| Command                        |                                            |
| ------------------------------ | ------------------------------------------ |
| `mutex lock <id>`              | Acquire a lock, waiting up to `--max-wait` |
| `mutex lock <id> -- <program>` | Acquire it, run the program, release it    |
| `mutex try-lock <id>`          | Acquire it in a single attempt             |
| `mutex unlock <id>`            | Release it                                 |
| `mutex renew <id>`             | Extend a lock you already hold             |
| `mutex status <id>`            | Show who holds it                          |
| `mutex list`                   | List every lock, expired ones included     |
| `mutex prune`                  | Delete locks that have already expired     |
| `mutex help [command]`         | Show help                                  |
| `mutex version`                | Print the version                          |

### CLI options

| Option                         | Default                    |                                                    |
| ------------------------------ | -------------------------- | -------------------------------------------------- |
| `-r`, `--reason <text>`        |                            | Why the lock is being taken                        |
| `-e`, `--expiration <seconds>` | `60`, or `3600` on `renew` | How long the lock lasts                            |
| `-w`, `--max-wait <seconds>`   | `-1`                       | How long to wait for it. `-1` means `--expiration` |
| `-i`, `--poll-interval <secs>` | `10`                       | Delay between attempts                             |
| `-o`, `--owner <name>`         | `$MUTEX_OWNER`, else none  | Who is taking the lock                             |
| `--no-renew`                   |                            | Do not renew while a wrapped program runs          |
| `--env-var <NAME>`             | `MUTEX_DATABASE_URL`       | Which variable holds the connection string         |
| `--dry-run`                    |                            | `prune` only. List what would go, delete nothing   |
| `--json`                       |                            | Machine-readable output                            |
| `-q`, `--quiet`                |                            | Errors only                                        |
| `--verbose`                    |                            | Include debug output                               |
| `-h`, `--help`                 |                            | Show help                                          |

### Exit codes

| Code  |                                                 |
| ----- | ----------------------------------------------- |
| `0`   | Success. For `status`, the lock is held         |
| `1`   | Error                                           |
| `2`   | Usage error                                     |
| `3`   | No usable connection string                     |
| `4`   | Not acquired, or not held                       |
| `5`   | Another owner holds the lock, and was not named |
| `126` | The wrapped program exists but could not be run |
| `127` | The wrapped program was not found               |

While wrapping a program, its exit status is returned instead.

## How it works

Taking a lock inserts a row, or takes over an expired one, inside a transaction guarded by a Postgres advisory lock. Two callers cannot both win. If the lock is held, the caller waits or fails depending on how you configure it.

mutex creates the `releasetools_mutex` table on first use and keeps its schema current. If the role in the connection string cannot create or alter tables, create it yourself first from the definition in [database.ts](./src/database.ts).

The command names map onto [mutex.ts](./src/mutex.ts): `lock` and `try-lock` both call `tryLock`, `unlock` calls `tryUnlock`.

### Wrapping a program

```shell
mutex lock deploy-staging --reason "deploying $GIT_SHA" -- ./deploy.sh
```

The lock is held for exactly as long as the program runs, and released on every exit path including a crash or `Ctrl-C`.

- The program's exit status becomes mutex's, like `flock`. Killed by a signal gives `128 + signal`.
- The program owns stdout. mutex reports on stderr, so pipelines stay clean.
- `SIGINT`, `SIGTERM` and `SIGHUP` reach the program, and the lock goes back once it exits. Signals stay handled during that release, so a second `Ctrl-C` waits instead of killing mutex with the lock still held. Three of them and it gives up, saying so.
- The lock renews in the background every `--expiration / 3` seconds, so a long program does not carry on holding a lock somebody else has taken. Disable with `--no-renew`.

It also checks which lock it gives back. It remembers the `created_at` of the acquisition it made and declines the id if a later one replaced it, so a lock that lapses mid-run and is taken by somebody else stays theirs.

### Ownership

Acquiring depends on expiry alone: while a lock is held nobody gets it, including its owner. Ownership decides who may unlock and renew.

| Lock      | Caller      | `unlock` | `renew` |
| --------- | ----------- | -------- | ------- |
| unowned   | anyone      | yes      | yes     |
| same name | same name   | yes      | yes     |
| named     | anyone else | refused  | refused |

Only a named lock is protected. An unowned one is open to anyone. Both the Action's `owner` input and the CLI's `--owner` option are unset by default, so existing workflows keep creating unowned locks unless they opt in.

The Action reuses `owner` for explicit unlock steps and post-job auto-release. A workflow can therefore identify its lock without preventing its own cleanup:

```yaml
- uses: releasetools/mutex@v1
  with:
    command: "lock"
    id: "deploy"
    owner: "${{ github.repository }}@${{ github.run_id }}"
```

There is no `--force`. To break somebody else's lock you name them, and the refusal says how:

```shell
$ mutex unlock deploy
'deploy' is held by 'alice'; this call is unowned. Pass --owner 'alice' to unlock it.

$ mutex unlock deploy --owner alice
Unlocked 'deploy'.
```

That is confirmation rather than authorisation, since anyone can read the owner from `mutex status`. It makes breaking a lock deliberate.

### Renewing

`renew` pushes out the expiry of a job still running:

```shell
mutex renew deploy --owner "$CI_RUN" --expiration 300
```

Omitted, it defaults to an hour rather than the 60 seconds `lock` uses, since anything asking for a renewal has been running a while.

Renewing only ever adds time. The new expiry is whichever is later, `now + --expiration` or the expiry the lock already had:

```shell
$ mutex lock deploy -e 7200 --owner ci   # two hours
$ mutex renew deploy --owner ci          # asks for one
Kept lock 'deploy'
  expires: 2026-08-16T01:44:20.165Z (in 2h 0m)
```

Otherwise it is strict. The id and the owner must both match, and it never takes a lock rather than renewing one. An expired lock is refused too, since somebody else may already have taken it over. Exit code `4` means gone or expired, `5` means held by another owner.

Locks taken by the GitHub Action without an `owner` are unowned, so a CLI caller that names no owner can renew them. When the Action names one, the CLI must pass that same value with `--owner`.

### Where the connection string comes from

`$MUTEX_DATABASE_URL`, and from the environment only. Point `--env-var` at another name if something already owns that one.

There is no flag for it. An argument lands in shell history and in `ps`, where every user on the machine can read it for as long as mutex runs:

```shell
MUTEX_DATABASE_URL="postgres://..." mutex lock deploy
```

mutex does not read secret stores. Whatever holds the secret can put it in the environment for one command, with [dotsecenv](https://dotsecenv.com) for example:

```shell
MUTEX_DATABASE_URL="$(dotsecenv secret get myapp::DATABASE_URL)" mutex lock deploy
```

Interactively there is nothing to pass, because [dotsecenv's shell plugin](https://dotsecenv.com/guides/shell-plugins/) exports it when you `cd` into the project.

`$DATABASE_URL` is still read when `$MUTEX_DATABASE_URL` is unset, and warns when it is. The prefix is the point: frameworks, ORMs, PaaS providers and CI systems all set `DATABASE_URL`, and they set it to the application's own database. A repository that has one and then adds mutex would keep its locks in the app's database without ever being told, and locks in the wrong database exclude nobody. `--env-var` is exempt from all of this - it names one variable and reads that one, with no fallback.

### Scripting

Read-only commands answer through the exit code:

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

`src/mutex.ts` and `src/database.ts` take a `Logger` and emit events instead of calling `@actions/core`, which is what lets both front ends share them.

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

| Step            |                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-e2e-pin` | Refuses to publish a major the verify step cannot test                                                                                                                                          |
| Check           | Rejects a malformed version, one already released, or one below the highest released                                                                                                            |
| Bump            | Sets the version in `package.json` and `package-lock.json`, and pushes that to `main`                                                                                                           |
| Build           | `npm ci`, lint, test                                                                                                                                                                            |
| Package         | `npm run package:action` assembles `publish/`: `action.yml`, `dist/`, `README.md`, `LICENSE`, and a `package.json` carrying the version                                                         |
| Publish         | [`signed-push`](https://github.com/releasetools/actions/tree/main/signed-push) commits that tree to `release/v1`, signed server-side by GitHub, and points `v1.3.0` and the floating `v1` at it |
| Release         | Creates or updates the GitHub release, with the notes from RELEASE.md                                                                                                                           |
| Verify          | Uses `releasetools/mutex@v1` for real and checks the version it reports                                                                                                                         |

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

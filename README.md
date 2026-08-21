# mutex

[![CodeQL](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml/badge.svg)](https://github.com/releasetools/mutex/actions/workflows/codeql.yaml)
[![npm version](https://img.shields.io/npm/v/@releasetools/mutex.svg)](https://www.npmjs.com/package/@releasetools/mutex)

Only one CI job at a time gets to touch a shared resource. mutex keeps advisory locks in a PostgreSQL table, so a workflow that wants the staging environment waits for whoever has it instead of racing them.

Two front ends sit over one table: a GitHub Action for locking inside a workflow, and a `mutex` CLI for everywhere else. A lock taken by either excludes the other. The Action comments on the pull request when a lock is taken and given back, and can post the same to Slack.

A third way in drives the CLI rather than the table: an [agent plugin](#agent-plugin) that lets a coding agent hold a lock around work you ask it to guard.

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

#### With npm

Install the public package from npm. Node.js 24 or newer is required:

```shell
npm install --global @releasetools/mutex@1.3.0
mutex version
```

Use an exact version as above for a repeatable install, or use `@1` to select
the newest compatible v1 release at installation time. npm does not update a
global installation automatically. Re-run the install command to update:

```shell
# Move an exact installation to a specific newer release.
npm install --global @releasetools/mutex@1.3.1

# Refresh an installation that follows the latest v1 release.
npm install --global @releasetools/mutex@1
```

npm writes the command to its configured global prefix; a Node version manager
or user-owned npm prefix keeps the whole installation rootless.

#### With mise

mise's [npm backend](https://mise.jdx.dev/dev-tools/backends/npm.html) can
install mutex without npm, but it does not add the Node runtime that mutex needs.
If your global mise configuration already provides Node.js 24 or newer, install
only mutex. Because the package is still below mise's default download-count
threshold, explicitly approve it; the exception does not apply to dependencies:

```shell
mise use --global \
  'npm:@releasetools/mutex[allow_low_downloads=true]@latest'
mutex version
```

For a new mise setup, install the runtime and mutex together:

```shell
mise use --global node@24 \
  'npm:@releasetools/mutex[allow_low_downloads=true]@latest'
mutex version
```

The second command makes Node.js 24 the global mise default. A project-local
configuration can override that version; force the supported runtime when a
project selects an older one:

```shell
mise exec node@24 -- mutex version
```

With mise activated, `mutex` is available directly. Without shell activation,
run it through `mise exec -- mutex`. `allow_low_downloads` requires mise 2026.8.8
or newer.

Update only a moving mutex installation with:

```shell
mise upgrade 'npm:@releasetools/mutex'
```

Use an exact package version instead of `latest` when the installation must stay
pinned:

```shell
mise use --global \
  'npm:@releasetools/mutex[allow_low_downloads=true]@1.3.1'
```

```shell
MUTEX_DATABASE_URL="postgres://..." mutex lock staging -- ./deploy.sh
```

The lock is held for exactly as long as `deploy.sh` runs, and released however it exits.

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
> **`release` is deprecated.** It still works as a synonym for `unlock`, and logs a warning when used, so workflows written against earlier versions keep running. It goes away in a future major version.

### Action outputs

| Output    |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| `status`  | `locked`, `released`, `failed` or `skipped`                                    |
| `version` | Which build of the action ran. The release workflow asserts it against the tag |

### Environment variables

| Variable             |                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MUTEX_DATABASE_URL` | The connection string. Required by the Action, a direct CLI command, or the server process                                                              |
| `GITHUB_TOKEN`       | Needed by the Action for PR comments                                                                                                                    |
| `SLACK_BOT_TOKEN`    | Read only when `slack-channel` is set. Requires `chat:write`, and the bot has to be a member of the channel or posting fails                            |
| `SKIP_MUTEX`         | Present in the environment at all, whatever the value, and the Action skips locking. Also works as a PR label, or a word in a PR description or comment |
| `MUTEX_OWNER`        | CLI only. Supplies `--owner` when the flag is left off                                                                                                  |

### CLI commands

| Command                        |                                               |
| ------------------------------ | --------------------------------------------- |
| `mutex lock <id>`              | Acquire a lock, waiting up to `--max-wait`    |
| `mutex lock <id> -- <program>` | Acquire it, run the program, release it       |
| `mutex try-lock <id>`          | Acquire it in a single attempt                |
| `mutex unlock <id>`            | Release it                                    |
| `mutex renew <id>`             | Extend a lock you already hold                |
| `mutex status <id>`            | Show who holds it                             |
| `mutex list`                   | List locks, expired ones included             |
| `mutex list --owner <name>`    | List only that owner's locks                  |
| `mutex prune`                  | Delete locks that have already expired        |
| `mutex profile [name]`         | List profiles, or make one the default        |
| `mutex server start`           | Start the selected server in the background   |
| `mutex server run`             | Run it in the foreground for service managers |
| `mutex server status`          | Show version, protocol, log and pool status   |
| `mutex server stop`            | Gracefully stop it                            |
| `mutex help [command]`         | Show help                                     |
| `mutex version`                | Print the version                             |

### CLI options

| Option                         | Default                    |                                                             |
| ------------------------------ | -------------------------- | ----------------------------------------------------------- |
| `-r`, `--reason <text>`        |                            | Why the lock is being taken                                 |
| `-e`, `--expiration <seconds>` | `60`, or `3600` on `renew` | How long the lock lasts                                     |
| `-w`, `--max-wait <seconds>`   | `-1`                       | How long to wait for it. `-1` means `--expiration`          |
| `-i`, `--poll-interval <secs>` | `10`                       | Delay between attempts                                      |
| `-o`, `--owner <name>`         | `$MUTEX_OWNER`, else none  | Who is taking the lock. On `list`, whose to show            |
| `--no-renew`                   |                            | Do not renew while a wrapped program runs                   |
| `--dry-run`                    |                            | `prune` only. List what would go, delete nothing            |
| `-p`, `--profile <name>`       | Default profile            | Use a profile for this command without changing the default |
| `--json`                       |                            | Machine-readable output                                     |
| `-q`, `--quiet`                |                            | Errors only                                                 |
| `--verbose`                    |                            | Include debug output                                        |
| `-h`, `--help`                 |                            | Show help                                                   |

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

### Profiles and the pooled server

Direct mode opens PostgreSQL from each CLI process. It remains the simplest option for scripts and occasional use: if no profiles file exists and `MUTEX_DATABASE_URL` is set, mutex uses it directly without prompting, writing configuration, or probing a TCP port.

The server is useful when the database is remote. It keeps a PostgreSQL connection pool warm, so each short CLI invocation talks over local TCP instead of establishing another database and TLS connection. The existing CLI commands, polling, wrapped programs, renewals, output and exit codes are the same in both modes.

Run this once to configure it:

```shell
mutex profile
```

On a terminal, mutex asks for a working directory and suggests `${XDG_CONFIG_HOME:-$HOME/.config}/releasetools-mutex`. It creates that directory and `${XDG_CONFIG_HOME:-$HOME/.config}/releasetools-mutex/profiles.toml`, prints the generated file and its path to stderr, then lets you choose between profiles with the arrow keys. It never asks for a port; the generated server listens on `localhost:5625`.

```toml
[server]
mode = "server"
default = true
bind_address = "localhost:5625"
working_dir = "/home/alice/.config/releasetools-mutex"

[direct]
mode = "direct"
default = false
```

Exactly one profile is the default. Custom names are allowed. `default = false` only means that a profile is not selected implicitly; it remains available through `--profile`. `mutex profile direct` makes an existing profile the default and clears the default marker from the others atomically; an unknown name fails and lists the defined names. `mutex profile` shows the list instead of opening the arrow-key selector when stdin is not a terminal.

Use `-p` to override the default profile for one command without waiting for a failed connection or changing the file:

```shell
mutex status deploy -p direct
mutex server status -p server
```

Selection is explicit. A direct profile never probes the server, and a server profile never falls back to PostgreSQL. Once a profiles file exists, a direct command must select its direct profile and still needs `MUTEX_DATABASE_URL` in that command's environment.

The CLI and the server each carry a protocol version, and lock commands refuse each other by name when the two differ, rather than letting one answer a question the other did not ask. `mutex server stop` and `mutex server status` are exempt on purpose: they are how a mismatch is seen and how it is fixed, so they work whatever version the other end speaks, and `mutex server status` reports the version and protocol the running server was built with, next to this one when they differ. Upgrading mutex while a server is running is what makes them differ: restart it with `mutex server stop && mutex server start`, or through whichever service manager owns it.

Either kind of profile may also set `ssl_negotiation`, which is how the TLS handshake starts:

```toml
[direct]
mode = "direct"
default = true
ssl_negotiation = "direct"
```

`direct` opens TLS immediately instead of asking first and waiting for the server's one-byte reply, saving a round trip on every connection mutex opens - about 25 ms against a hosted database, and worth measuring with [`benchmarks/ssl-negotiation`](./benchmarks/ssl-negotiation) before assuming it matters. It requires **PostgreSQL 17 or newer**; older servers read the TLS handshake as a malformed startup packet and close the connection, and mutex says so when a handshake fails that way. The default, `postgres`, works everywhere.

It belongs here rather than only in the connection string because it describes the server rather than the credential, and the connection string is often a secret issued by somebody else. `sslnegotiation=direct` in the connection string does the same thing; when both say something, the profile wins.

A **server profile does not need the setting**: it tries direct negotiation on its own whenever the connection uses TLS, and gives up on it permanently the first time a server refuses. That costs one failed connection against PostgreSQL 16 or older, once, at startup - a fair price for a process that will open many, and not one a CLI command could recover. Setting `ssl_negotiation = "postgres"` turns the attempt off. Neither front end asks for direct negotiation on a connection without TLS, which node-postgres rejects outright.

The server also keeps one connection open. node-postgres closes an idle connection after ten seconds and its floor is zero connections, so a lock server asked for something every few minutes was paying a fresh handshake nearly every time - about 180 ms against a hosted database, against the 25 ms direct negotiation saves. It now holds one, and that is where most of the saving is.

Start the server after making `MUTEX_DATABASE_URL` visible to it:

```shell
mutex server start
mutex server status
```

`start` detaches and waits for both PostgreSQL and local TCP to be ready. `run` stays in the foreground, which is the right form under systemd or launchd. The process changes to the profile's `working_dir` before opening the database. mutex does not read secret files or invoke a secret manager: exported variables, service-manager environments, and environment tools all work as long as the mutex process can read `MUTEX_DATABASE_URL`. The value never belongs in the profiles file or on the command line.

Every server-side lock operation appends one line to `<working_dir>/mutex-<profile>.log`:

```text
|2026-08-16T14:32:09.417Z|lock|deploy|alice|127.0.0.1|workstation.local|
```

Fields are UTC timestamp, operation, lock ID, owner, client IP, and client hostname. Missing values are `-`; separators, newlines and control characters are escaped. Poll attempts each get a line, while health checks and direct operations do not. The server never truncates the file or logs the database URL.

The TCP protocol is versioned and newline-delimited JSON. It has no application authentication or TLS; the default is localhost, and deployments that widen the bind address are responsible for IP ACLs.

#### systemd

[`contrib/systemd/releasetools-mutex@.service`](./contrib/systemd/releasetools-mutex@.service) is an instance unit: the instance name is the profile. Review its `User`, `Group`, `WorkingDirectory`, executable path, and hardening paths, then install it:

```shell
sudo install -m 0644 contrib/systemd/releasetools-mutex@.service /etc/systemd/system/
sudo install -d -m 0750 -o mutex -g mutex /var/lib/releasetools-mutex
sudo install -d -m 0750 /etc/releasetools-mutex
sudo install -m 0644 profiles.toml /etc/releasetools-mutex/profiles.toml
sudo install -m 0600 server.env /etc/releasetools-mutex/server.env
sudo systemctl daemon-reload
sudo systemctl enable --now releasetools-mutex@server.service
```

`server.env` contains `MUTEX_DATABASE_URL=...` and is read by systemd, not passed in argv. The unit sets `XDG_CONFIG_HOME=/etc`, so mutex reads `/etc/releasetools-mutex/profiles.toml`. The configured `working_dir` must match the unit's writable working directory.

#### macOS LaunchAgent (current user)

[`contrib/launchd/com.releasetools.mutex.plist`](./contrib/launchd/com.releasetools.mutex.plist) is a per-user LaunchAgent. It runs as the logged-in user, so it has no `UserName` or `GroupName` and needs no root installation. Run `mutex profile` as that user first; accepting the suggested working directory creates `~/.config/releasetools-mutex` with user ownership.

The plist contains no database URL. Its user-owned wrapper changes to the working directory, retrieves `MUTEX_DATABASE_URL` from dotsecenv at startup, exports it only to the mutex process, and replaces itself with `mutex server run`. Neither the value nor a command containing it reaches the plist, a file, or process arguments.

Copy both templates, then replace `YOUR_USERNAME`, the executable paths if `mutex` or `dotsecenv` is installed elsewhere, `YOUR_NAMESPACE::MUTEX_DATABASE_URL`, and the profile if it is not named `server`. launchd needs literal absolute paths in the plist: it does not run a shell to expand `~`, `$HOME`, or command substitutions.

```shell
install -d -m 0700 "$HOME/Library/LaunchAgents"
install -m 0700 contrib/launchd/run-mutex-server.zsh "$HOME/.config/releasetools-mutex/run-mutex-server.zsh"
install -m 0600 contrib/launchd/com.releasetools.mutex.plist "$HOME/Library/LaunchAgents/com.releasetools.mutex.plist"
${EDITOR:-vi} "$HOME/.config/releasetools-mutex/run-mutex-server.zsh"
${EDITOR:-vi} "$HOME/Library/LaunchAgents/com.releasetools.mutex.plist"
plutil -lint "$HOME/Library/LaunchAgents/com.releasetools.mutex.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.releasetools.mutex.plist"
```

Keep the plist mode `0600` and the wrapper mode `0700`; both stay owned by the current user. The wrapper uses dotsecenv's normal vault and identity access from the configured working directory, and launchd owns the resulting mutex process and restarts only failures. Stop or replace it without root:

```shell
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.releasetools.mutex.plist"
```

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

`list` reads the same owner, so "what do I hold?" is a question for the database rather than a filter applied to the whole table afterwards:

```shell
mutex list --owner "$CI_RUN"   # only that owner's locks
mutex list                     # every lock, or $MUTEX_OWNER's when that is set
mutex list --owner ''          # names nobody, so every lock again
```

What crosses the wire is the answer rather than the table, which is what makes it worth asking for. An empty list still exits `0`: holding nothing is an answer, not a failure.

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

`$MUTEX_DATABASE_URL`, and from the environment only. A direct CLI command reads it itself; in server mode only the server process needs it.

There is no flag for it. An argument lands in shell history and in `ps`, where every user on the machine can read it for as long as mutex runs:

```shell
MUTEX_DATABASE_URL="postgres://..." mutex lock deploy
```

mutex does not read secret stores. Whatever holds the secret can put it in the environment for one command, with [dotsecenv](https://dotsecenv.com) for example:

```shell
MUTEX_DATABASE_URL="$(dotsecenv secret get myapp::DATABASE_URL)" mutex lock deploy
```

Interactively there is nothing to pass, because [dotsecenv's shell plugin](https://dotsecenv.com/guides/shell-plugins/) exports it when you `cd` into the project.

There is no option for reading some other variable, because a value already living under another name needs an assignment rather than an option:

```shell
MUTEX_DATABASE_URL="$LOCKS_URL" mutex lock deploy
```

`DATABASE_URL` is not read at all, in either front end. mutex read it up to 1.2.2 and warned; the prefix is the point, because frameworks, ORMs, PaaS providers and CI systems all set that name, and they set it to the application's own database. A repository that had one and then added mutex was keeping its locks in the app's database without ever being told, and locks in the wrong database exclude nobody.

### What `sslmode` means here

mutex decides what the `sslmode` in a connection string means, rather than inheriting whichever meaning the installed node-postgres holds:

| `sslmode`                                 | What mutex does                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `verify-full`                             | Encrypts, and checks the certificate chain and the hostname                |
| `require`, `prefer`, `verify-ca`, `allow` | The same as `verify-full`                                                  |
| `no-verify`                               | Encrypts without checking the certificate                                  |
| `disable`                                 | No TLS. Warns when the host is not local                                   |
| unset                                     | No TLS, as node-postgres has always done. Warns when the host is not local |

The four promoted modes mean something weaker in libpq - encrypt, but do not check who answered - which is no protection against something that can answer in the server's place. node-postgres has always read them as `verify-full` and warns that pg v9 will adopt libpq's meaning instead, which would quietly weaken every connection string that says `require`. Deciding here is what makes that upgrade a no-op, and it is why the warning no longer appears.

Certificates named by `sslrootcert`, `sslcert` and `sslkey` are loaded as usual, so a private CA keeps working. `uselibpqcompat=true` still hands the decision back to node-postgres, and mutex warns once about what that costs. `PGSSLMODE` is read when the connection string says nothing.

Promotion is stricter than the name suggests, which shows up as a certificate error against a server whose CA is private. mutex adds what to do to that failure rather than leaving the certificate to explain itself. Run any command with `--verbose` to see what a connection settled on: `Database connection: sslmode=require applied as verify-full.`

### Scripting

Read-only commands answer through the exit code:

```shell
if mutex status deploy-staging --quiet; then
  echo "someone is deploying"
fi
```

`--quiet` silences the ordinary report and leaves the exit code to answer. It does not silence a lock not acquired, a release refused, or a lock left held: those go to stderr whatever the verbosity. `--json` is unaffected by both.

## Agent plugin

The mutex agent plugin is an agent skill: what a coding agent needs to know to guard an operation with a lock, and a helper it runs to take one. It lives in [releasetools/agent-plugins](https://github.com/releasetools/agent-plugins), which is where to change it. It is deliberately narrow. It takes a lock when the user asks for one, hands it back when the work is done, and speaks up before the lease runs out. It never volunteers a lock, never breaks somebody else's, never runs `mutex profile` or `mutex server` on its own, and never reads the connection string.

One directory serves every agent. Claude Code and Codex install it as a plugin through their own manifests. Hermes, Gemini and Antigravity discover skills by walking a directory under their own home, so they get a copy of the same files - which travels in the npm package, since a global install is the only checkout most people have.

Installing the plugin installs no `mutex` command and supplies no connection string. It runs the CLI, so [install that first](#quickstart) - the short path is below - and set `MUTEX_DATABASE_URL` yourself; the plugin never reads its value. `/mutex:preflight` reports whether the lock table is reachable, and what is missing when it is not.

```shell
mise use --global node@24 \
  'npm:@releasetools/mutex[allow_low_downloads=true]@latest'
mutex version
```

### Claude Code

```shell
claude plugin marketplace add releasetools/agent-plugins
claude plugin install mutex@releasetools
```

The same two steps work as `/plugin marketplace add` and `/plugin install` inside a session.

### Codex

```shell
codex plugin marketplace add releasetools/agent-plugins
codex plugin add mutex@releasetools
```

Both install from [releasetools/agent-plugins](https://github.com/releasetools/agent-plugins), which carries a copy of `plugins/mutex/` written by this repository's release rather than a pointer back at it. So a marketplace install is a published plugin version, independent of what `main` happens to hold, and one marketplace serves every releasetools plugin instead of one per repository.

### Hermes, Gemini and Antigravity

These read a skills directory rather than a plugin manifest, so the skill is copied into each. It ships with the CLI package, so there is nothing else to fetch:

```shell
node "$(npm root -g)/@releasetools/mutex/scripts/install-agent-skills.mjs"
```

From a checkout of the marketplace, `node scripts/install-agent-skills.mjs` does the same thing.

`--check` reports what is missing or out of date and writes nothing, which is what to run after upgrading the CLI. `--target <agent>` names one, including `claude` or `codex` for a plain copy instead of a plugin. An agent whose home directory does not exist is skipped rather than created.

### Commands

The plugin puts six commands in the slash menu, so the common operations are
discoverable rather than something you have to describe:

| Command                       |                                                      |
| ----------------------------- | ---------------------------------------------------- |
| `/mutex:preflight`            | Can mutex reach its lock table here, and if not, why |
| `/mutex:lock <id> [reason]`   | Take a lock, an hour by default                      |
| `/mutex:status [id]`          | A table of what you hold, and on request the rest    |
| `/mutex:renew <id> [seconds]` | Extend a lock before it lapses                       |
| `/mutex:unlock <id>`          | Hand it back                                         |
| `/mutex:help`                 | What the plugin does, and what it will not           |

`/mutex:status` names this session as the owner and lets the database do the
narrowing, so what comes back is what you hold rather than the whole table; the
helper's `--all` asks the wider question, and pays for it in rows.

Each one is a single deterministic invocation rather than a description of what
to do, because the difference is measured in tens of seconds. `/mutex:preflight`
and `/mutex:status` run their command before the model is asked anything, so
they cost one turn and no tool call; the rest name the exact command and say
what to report. They consult the skill only when an answer comes back that a
plain report does not cover, and nothing runs a preflight before every
operation - the operation itself reports a missing connection string perfectly
well.

There is deliberately no command for starting the pooled server, choosing a
profile or pruning expired locks: those are yours to run, and the plugin says so
instead of doing them.

Claude Code and Codex read `commands/` as it stands. Gemini reads TOML, so the
installer renders the same files into `~/.gemini/commands/mutex/` on the way in:
one source, translated, rather than two that drift. Hermes has no command
surface, and gets the skill.

### What the agent does with it

| Step        |                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `preflight` | Can mutex reach the table here, through a profile or `$MUTEX_DATABASE_URL`. Run when something fails, not before every lock         |
| permissions | `/mutex:preflight` appends `Bash(mutex:*)` and the helper's own invocation to `permissions.allow`, so the skill never stops to ask  |
| `lock`      | An hour by default rather than the CLI's minute, waiting 30 seconds rather than the whole lease, under an owner naming this session |
| `renew`     | Only after asking. Reminders arrive on their own; the decision to extend does not                                                   |
| `unlock`    | With the owner it recorded, so it releases what it took and nothing else                                                            |

An hour because a conversation is not a CI step: it does not know how long it will take, and a lease that lapses mid-conversation hands the resource to somebody else while the work is still going on.

### Knowing when the lock runs out

Locks are taken under a name that says who holds them: the agent, the host and the session, as in `claude@workstation:22ca1fea-a521-4d5c-ad62-b6d05809f8ef`. It is derived rather than generated, so it is the same name every time that session asks for it - which is what lets a lock be released after the note of it is lost, and what stops one session from releasing another's. `$MUTEX_OWNER` overrides it. Where nothing in the environment names a session the owner is the agent and host alone, and `/mutex:preflight` says so, because then every session on that machine can take the others' locks back.

A lock nobody is watching expires quietly, so the helper writes down what it took - the id, the owner, the session and the expiry - in `${XDG_STATE_HOME:-$HOME/.local/state}/releasetools-mutex/agent-locks.json`. Nothing in it is secret, and it is a reminder rather than a source of truth: PostgreSQL still holds the locks, and `mutex status <id>` still names the owner needed to release one.

What reads it is a **prompt hook**: it asks the agent to check with you at ten minutes and again at two, and says so once when a lock has expired. The file is every session on the machine, deliberately - seeing that something else already holds `staging` is worth knowing - so a lock another session took is mentioned as context rather than as something this one can extend or release. It ships in `hooks/hooks.json`, needs no wiring in Claude Code, and reads nothing but that file - no database round trip, and nothing to remember to run. Anywhere else that can run a command between turns, the same warning comes from `node .../agent-lock.mjs nudge`.

That is the point of writing it down at all: a deadline that has to be asked about is a deadline nobody sees.

<details>
<summary>Optional: a status line segment</summary>

`agent-lock.mjs statusline` prints one line - `🔒 staging 42m`, amber under ten minutes and red under two - and nothing at all when nothing is held. Nothing installs it, and it deliberately replaces nobody's status line: it is a segment to append to whichever one you already have.

```shell
# find the copy your agent installed, or use the one in a global CLI install
find ~/.claude/plugins ~/.hermes/skills ~/.gemini/skills -name agent-lock.mjs 2>/dev/null | head -1
```

```shell
# at the end of your own status line script
held=$(node /path/to/skills/mutex/agent-lock.mjs statusline)
[ -n "$held" ] && printf " | %s" "$held"
```

Worth it if you keep long locks and like seeing them; the hook covers the case that actually matters without it.

</details>

### Working on the plugin

The plugin is in [releasetools/agent-plugins](https://github.com/releasetools/agent-plugins) - its source, its version, its tests and its validation. Change it there, bump the version in both manifests, and the merge is the release.

It carries a version of its own because it is installed from that marketplace rather than from npm or a version tag, so it moves when the plugin changes and not when this CLI does. What this repository still does is carry the skill in the npm package, so that the agents with no plugin manifest can be seeded from a global install:

```shell
npm run package:release -- --marketplace ../agent-plugins
```

That copies `skills/`, `commands/` and the installer out of a checkout of the marketplace, and refuses to build without one.

## Development

Contributions are welcome.

### Local CLI development

Node.js 24 or newer is required. Clone the source and create a global npm link
once:

```shell
git clone https://github.com/releasetools/mutex.git
cd mutex
npm ci
npm run cli:link  # build, then put this checkout's `mutex` on PATH
```

The link points at the checkout, so it does not need to be recreated after each
edit. The command reads compiled files from `lib/`; either rebuild explicitly
or leave the compiler running while developing:

```shell
npm run build

# Or keep lib/ current as source files change.
npm run build:watch
```

Run the linked command normally from another terminal:

```shell
mutex
mutex status deploy
```

Without the global link, run the same compiled CLI through npm:

```shell
npm run mutex -- status deploy
```

Run the tests alone with `npm test`. Before committing, use the full shorthand:

```shell
npm run check
```

The PostgreSQL integration suite runs when `MUTEX_TEST_DATABASE_URL` is
available and is skipped otherwise. Point it at a disposable database; the
suite creates and truncates `releasetools_mutex`:

```shell
MUTEX_TEST_DATABASE_URL="postgresql://mutex@localhost/mutex_test" npm test
```

`check` formats the source, builds the CLI and Action, and runs every test. The
pre-commit hook runs the relevant formatting, tests, and build again before a
commit is accepted. Remove the development link with:

```shell
npm run cli:unlink
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

`main` holds source only. What `releasetools/mutex@v1` resolves to is built during the release and published to the `release/v1` branch, while the same compiled CLI is published as `@releasetools/mutex` on npm. A release is therefore a workflow run rather than a `git tag` or a manual `npm publish`.

### One-time npm setup

The `releasetools` organization must exist on npmjs.com, and the releasing
account must be allowed to publish public packages in that scope. npm cannot
configure a trusted publisher until the package exists, so bootstrap the first
release with a short-lived granular token that may publish with 2FA bypass:

1. Add the token as the `NPM_TOKEN` Actions secret in this GitHub repository.
2. Run the first release normally. The workflow publishes the package with
   provenance and creates `@releasetools/mutex`.
3. With npm 11.15 or newer and 2FA enabled, authorize this workflow:

   ```shell
   npm trust github @releasetools/mutex \
     --repo releasetools/mutex \
     --file release.yaml \
     --allow-publish
   ```

4. Delete the `NPM_TOKEN` secret. In the package's npm settings, require 2FA
   and disallow token publishing; future releases authenticate only through
   short-lived GitHub OIDC credentials.

The trusted publisher settings are case-sensitive. Configure the repository as
`releasetools/mutex`, the workflow filename as `release.yaml`, no environment,
and allow `npm publish`.

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
| `overwrite-existing`  | Replace an Action version and GitHub release. An npm version is immutable and remains unchanged if it already exists.           |

They are separate on purpose. Replacing a release and releasing out of order are different decisions, so neither flag grants the other.

### What it does

| Step            |                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-e2e-pin` | Refuses to publish a major the verify step cannot test                                                                                                                                          |
| Check           | Rejects a malformed version, one already released, or one below the highest released                                                                                                            |
| Bump            | Sets the version in `package.json` and `package-lock.json`, and pushes that to `main`                                                                                                           |
| Build           | `npm ci`, lint, test                                                                                                                                                                            |
| Package         | `npm run package:release` assembles `publish/`: the Action bundle, compiled CLI, runtime manifest, README, and license                                                                          |
| Publish         | [`signed-push`](https://github.com/releasetools/actions/tree/main/signed-push) commits that tree to `release/v1`, signed server-side by GitHub, and points `v1.3.0` and the floating `v1` at it |
| Release         | Creates or updates the GitHub release, with the notes from RELEASE.md                                                                                                                           |
| npm             | Publishes `@releasetools/mutex` with provenance; an older backport gets the `backport` dist-tag instead of moving `latest` backwards                                                            |
| Verify npm      | Installs the exact version from the public registry and checks `mutex version`                                                                                                                  |
| Verify mise     | Installs mise-managed Node 24 and the exact public npm package in an isolated configuration, then checks `mutex version` and `mutex help`                                                       |
| Verify Action   | Uses `releasetools/mutex@v1` for real and checks the version it reports                                                                                                                         |

The first release on a new major seeds `release/<major>` from `main` automatically.

Packaging is a script rather than workflow YAML, so you can see what a release would publish without cutting one:

```shell
npm run package:release
node publish/dist/main/index.js      # reports the version it would report in CI
npm pack ./publish --dry-run         # shows exactly what npm would receive
```

### Afterwards

```shell
git fetch origin 'refs/tags/*:refs/tags/*'
git show --stat v1.3.0
gh api repos/releasetools/mutex/commits/v1 --jq .commit.verification.verified
npm view @releasetools/mutex@1.3.0 version
```

Each published commit's parent is the previous release, so `release/v1` reads as a history of releases. The source it was built from is a `Source-Commit:` trailer rather than a parent.

### When something goes wrong

The verify step failing means the release is published but broken, since `v1` has to move before anything can use it. Fix forward with a new patch. If it says `v1 ran mutex <older version>`, the tag move had not reached GitHub's action cache yet and re-running that job is enough.

`check-e2e-pin` failing means you are releasing a major the verify step still pins to `@v1`. Write a second verify job for the new major and update `PINNED`. Nothing is published until then.

A version mismatch means `package.json` and the dispatched tag disagree. Nothing has been published.

If npm authentication fails after the GitHub release is created, correct the
bootstrap token or trusted-publisher settings and dispatch the same version
with `overwrite-existing`. npm publishing is idempotent: the workflow publishes
a missing package version and leaves an existing immutable one alone.

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

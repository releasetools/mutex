# Working in this repository

## Release notes

Every user-visible change goes in [RELEASE.md](./RELEASE.md), newest version first.

- **One line per change.** If a change needs a paragraph, it needs docs in the README instead - link there.
- **Write for the person who has to decide whether to upgrade.** Say what changed for them, not which files moved.
- **Plain sentences.** No "feat:"/"fix:" prefixes, no bullet-point telegraphese, no marketing. "Fixed lock expiry on databases whose session time zone is not UTC" beats "TZ handling improvements".
- **Reads like a person wrote it - every entry, always.** Machine-assembled prose gets rewritten before it merges. A measurement is a clause, not a dangling fragment: "which was about 180 ms per request", not "; against a hosted database that was about 180 ms per request". A consequence takes a finite verb, not an "-ing" tack-on: "which cuts the fixed cost", not "reducing the fixed cost". Every sentence has a subject that can do its verb: "mutex now warns", not "A connection now warns". A sentence carrying three ideas becomes two sentences.
- **Name the consequence when there is one.** A bug fix should say what was broken, not just what was patched.
- **Group under a version heading** - `## 1.3.0`, which is what the release reads to fill in the GitHub release body. The version in `package.json` is bumped by the release itself; do not edit it by hand.

Versioning is semver, judged from the **Action's** public surface (its inputs, outputs and lock-table behaviour), since that is what workflows pin:

- **patch** - fixes with no change in behaviour;
- **minor** - new commands, flags or CLI features, and backwards-compatible schema additions;
- **major** - removing or repurposing an Action input, or a schema change that breaks older versions.

The agent plugin has a version of its own, in both plugin manifests, bumped by hand - see [Layout](#layout). It is not the Action's, and a release does not move it.

## The website

[releasetools/website](https://github.com/releasetools/website) carries
`docs/mutex.md`, which mirrors the user-facing surface of this repository: the
CLI's commands, options and exit codes, the environment variables, the Action's
inputs, profiles and the pooled server, and the troubleshooting notes.

**A release that changes any of those needs a pull request there too.** It is a
separate repository with its own deploy, so nothing here updates it and nothing
notices when it drifts - the page just goes on describing a version that no
longer exists.

There is no version to bump: the page pins the Action as
`releasetools/mutex@v1`, the floating major, which moves on its own. What goes
stale is the prose - a renamed flag, a new exit code, a changed default.

RELEASE.md is the checklist. Every line under the version being released is a
user-visible change, which is the same bar the website documents.

## Build output

`npm run build` wipes and regenerates `lib/` and `dist/`. **Neither is committed.** The release workflow builds the action and publishes `action.yml` plus `dist/` to `release/<major>` through `releasetools/actions/signed-push`; the version tags point there. So what a consumer of `releasetools/mutex@v1` gets is built on the way past, not carried on `main`.

It cleans first on purpose: `tsc` leaves output for sources that no longer exist, and `lib/logic.js` sat in the repository from the initial commit until that was noticed.

Three consequences, each of which has already bitten:

- **`uses: ./` needs a build step before it.** A fresh checkout has no `dist/`, so `test.yaml`'s lock jobs build first. This works because local actions are read from the workspace when their step runs, unlike remote ones, which are fetched during "Set up job".
- **The published tree needs its own `package.json`.** The action reports its version by walking up from the bundle to the nearest `package.json` that has a `version` field, and ncc's marker file has none. Without one the published action reports `unknown`, and the release verifies that against the tag. `scripts/package-release.mjs` generates it.
- **A release is a workflow dispatch, not a tag.** `git tag` publishes nothing, and the tag the workflow creates would collide with one that triggered it - which is why it is dispatched with a version instead. The release bumps `package.json` and pushes that to `main` itself, so the bump cannot be forgotten and the tag cannot disagree with what the action reports.

Anything else that ships a subset of the repository is worth assembling and running before trusting it. Both of the above surfaced that way and neither would have surfaced from reading the code - which is why the packaging lives in `scripts/package-release.mjs` rather than in the workflow:

```shell
npm run package:release
node publish/dist/main/index.js
```

It also refuses to publish a tree missing any entrypoint `action.yml` names. A declared-but-missing `post:` is the expensive one - the action works right up until a job ends, and then never releases its lock.

## Before committing

The pre-commit hook builds and runs the tests, but a manual `npm run lint && npm run build && npm test` first avoids surprises.

## Layout

| Path              | What lives there                                                          |
| ----------------- | ------------------------------------------------------------------------- |
| `src/mutex.ts`    | `tryLock` / `tryUnlock` - the polling logic, with no GitHub dependencies  |
| `src/database.ts` | The PostgreSQL lock store                                                 |
| `src/main.ts`     | The Action's entry point; `src/post.ts` auto-releases at the end of a job |
| `src/cli/`        | The `mutex` CLI                                                           |

`src/mutex.ts` and `src/database.ts` take a `Logger` and emit events rather than calling into `@actions/core`. Keep it that way: it is what lets the Action and the CLI share them, and it keeps the CLI bundle free of the Actions toolkit.

The agent plugin is not here. It is written and released in
[releasetools/agent-plugins](https://github.com/releasetools/agent-plugins), where
Claude Code and Codex install it as `mutex@releasetools`, and where its own
version, tests and validation live. It used to be assembled here and published
across, which coupled a one-line fix to the skill to somebody cutting a CLI
release.

What remains here is one dependency, in the other direction. The npm package
still carries `skills/`, `commands/` and `scripts/install-agent-skills.mjs`,
because Hermes, Gemini and Antigravity read no plugin manifest - they walk a
directory under their own home, and for most people a global install is the only
checkout there is. `package-release.mjs` copies those three out of a checkout of
the marketplace, which the release workflow checks out beside this one and
`--marketplace` names:

```shell
npm run package:release -- --marketplace ../agent-plugins
```

It defaults to a sibling `../agent-plugins`, and refuses to build without one: a
release that quietly shipped no skill would seed nothing for three agents and
say so nowhere.

### The seam with the plugin

`agent-lock.mjs` over there drives this CLI: it knows the subcommands, the
flags, the exit codes and the shape of `--json`. Nothing in either repository
tests the two together, so a change to that surface here is a broken plugin
there, and it fails at the moment somebody asks an agent for a lock.

**Before opening a pull request that changes the CLI's surface, check whether
the plugin uses the part you are changing.**

```shell
grep -nE '"(lock|unlock|renew|status|list)"|"--[a-z-]+"|\.status ===' \
  ../agent-plugins/plugins/mutex/skills/mutex/agent-lock.mjs
```

If it does, open the matching pull request in
[releasetools/agent-plugins](https://github.com/releasetools/agent-plugins) and
link the two, because **they have to be merged and released together**. The
halves reach a user from different places - the CLI from npm, the plugin from
the marketplace - so a plugin that needs a flag this repository has not
published yet is a command that fails for everyone until it is.

That has already happened: `/mutex:status` began calling `mutex list --owner`
while the newest published CLI was 1.3.1, which answered
`'list' does not take --owner`. The two shipped together in the end - the plugin
at 0.1.0 and the CLI at 1.4.0 - so nobody ran into it. Nothing in this
repository would have caught it; agent-plugins runs a contract suite against the
published CLI, and this rule is what keeps that from being the thing that finds
out.

## Conventions

- Timestamps in the lock table are UTC wall time in `TIMESTAMP WITHOUT TIME ZONE` columns. Always write `(NOW() AT TIME ZONE 'UTC')` and always read `col AT TIME ZONE 'UTC'`; a bare `NOW()` silently stores session-local time and breaks expiry.
- The CLI writes results for acting commands (`lock`, `unlock`, `renew`) to stderr and query output (`status`, `list`, `prune`) to stdout. `--json` always goes to stdout, except while wrapping a program, which owns stdout.
- Acquiring a lock is decided by expiry alone; ownership only decides who may unlock or renew it. An unowned lock is open to anyone, and there is no override flag - breaking a lock means naming its owner. See `mayModify` in `database.ts`.
- Anything spawned goes through `spawn` with an argument array and never a shell. Values that become arguments are validated first and passed after `--`, so a flag-shaped value cannot be read as an option by the program being run.
- Secrets never reach stdout, logs, error messages - or argv. There is no flag that takes a connection string, because arguments are readable from `ps` by every user on the machine and land in shell history. The environment is the only way in, and reading a secret store is somebody else's job.

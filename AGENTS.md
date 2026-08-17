# Working in this repository

## Release notes

Every user-visible change goes in [RELEASE.md](./RELEASE.md), newest version first.

- **One line per change.** If a change needs a paragraph, it needs docs in the README instead - link there.
- **Write for the person who has to decide whether to upgrade.** Say what changed for them, not which files moved.
- **Plain sentences.** No "feat:"/"fix:" prefixes, no bullet-point telegraphese, no marketing. "Fixed lock expiry on databases whose session time zone is not UTC" beats "TZ handling improvements".
- **Name the consequence when there is one.** A bug fix should say what was broken, not just what was patched.
- **Group under a version heading** - `## 1.3.0`, which is what the release reads to fill in the GitHub release body. The version in `package.json` is bumped by the release itself; do not edit it by hand.

Versioning is semver, judged from the **Action's** public surface (its inputs, outputs and lock-table behaviour), since that is what workflows pin:

- **patch** - fixes with no change in behaviour;
- **minor** - new commands, flags or CLI features, and backwards-compatible schema additions;
- **major** - removing or repurposing an Action input, or a schema change that breaks older versions.

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

## Conventions

- Timestamps in the lock table are UTC wall time in `TIMESTAMP WITHOUT TIME ZONE` columns. Always write `(NOW() AT TIME ZONE 'UTC')` and always read `col AT TIME ZONE 'UTC'`; a bare `NOW()` silently stores session-local time and breaks expiry.
- The CLI writes results for acting commands (`lock`, `unlock`, `renew`) to stderr and query output (`status`, `list`, `prune`) to stdout. `--json` always goes to stdout, except while wrapping a program, which owns stdout.
- Acquiring a lock is decided by expiry alone; ownership only decides who may unlock or renew it. An unowned lock is open to anyone, and there is no override flag - breaking a lock means naming its owner. See `mayModify` in `database.ts`.
- Anything spawned goes through `spawn` with an argument array and never a shell. Values that become arguments are validated first and passed after `--`, so a flag-shaped value cannot be read as an option by the program being run.
- Secrets never reach stdout, logs, error messages - or argv. There is no flag that takes a connection string, because arguments are readable from `ps` by every user on the machine and land in shell history. The environment is the only way in, and reading a secret store is somebody else's job.

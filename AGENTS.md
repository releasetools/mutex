# Working in this repository

## Release notes

Every user-visible change goes in [RELEASE.md](./RELEASE.md), newest version first.

- **One line per change.** If a change needs a paragraph, it needs docs in the README instead - link there.
- **Write for the person who has to decide whether to upgrade.** Say what changed for them, not which files moved.
- **Plain sentences.** No "feat:"/"fix:" prefixes, no bullet-point telegraphese, no marketing. "Fixed lock expiry on databases whose session time zone is not UTC" beats "TZ handling improvements".
- **Name the consequence when there is one.** A bug fix should say what was broken, not just what was patched.
- **Group under a version heading**, and bump the version in `package.json` in the same change.

Versioning is semver, judged from the **Action's** public surface (its inputs, outputs and lock-table behaviour), since that is what workflows pin:

- **patch** - fixes with no change in behaviour;
- **minor** - new commands, flags or CLI features, and backwards-compatible schema additions;
- **major** - removing or repurposing an Action input, or a schema change that breaks older versions.

## Before committing

`npm run build` wipes and regenerates `lib/` and `dist/`. Only `dist/main` and `dist/post` are committed, because `action.yml` points GitHub at those paths directly and they have to exist at whatever ref a workflow uses. Everything else is ignored: the CLI runs from `lib/`, which is built on demand.

It cleans first on purpose. `tsc` leaves output for deleted sources behind, and for the committed part that means a removed module stays in the repository as compiled JavaScript - `lib/logic.js` sat there from the initial commit until it was noticed. The pre-commit hook does this, but a manual `npm run lint && npm run build && npm test` first avoids surprises.

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

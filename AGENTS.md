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

The agent plugin has a version of its own, in both plugin manifests, bumped by hand - see [Layout](#layout). It is not the Action's, and a release does not move it.

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
| `skills/mutex/`   | The agent skill, and the helper it runs                                   |
| `commands/`       | The plugin's slash commands: one invocation each, not instructions        |
| `PLUGIN.md`       | The plugin's own README, published as its `README.md` in the marketplace  |

`src/mutex.ts` and `src/database.ts` take a `Logger` and emit events rather than calling into `@actions/core`. Keep it that way: it is what lets the Action and the CLI share them, and it keeps the CLI bundle free of the Actions toolkit.

`skills/` and `commands/` are read by four different agents: through `.claude-plugin/` and `.codex-plugin/` for two of them, and by copying for the rest - Gemini's commands are rendered from the same markdown, since it reads TOML. One rule holds it together, and `npm run plugin:validate` enforces it - **`skills/` is the only copy of any skill**, and both manifests carry the same version. A second copy under a product directory is how two agents start following different instructions out of one repository, and none of these tools says anything when the packaging is wrong: a skill they cannot find looks exactly like a model choosing not to use it.

The commands and the skill answer different questions, and mixing them is what made the first version slow. A command is one deterministic invocation: the plugin root gives it the helper's path, `allowed-tools` stops it asking permission, and `` !`cmd` `` runs it before the model is asked anything, so the whole thing costs one turn. The skill is for the judgement a command cannot make - whether to wait for a contended lock, whether to break one, what to say when a guard has lapsed. A command that merely says "follow the skill" pays for the skill to load, four round trips, and a search for a file it was already told the path of: measured at 53s against 10s for the same answer.

The plugin carries its own version, independent of the CLI's, and it ships by a different road. `scripts/package-plugin.mjs` assembles the standalone plugin - the two manifests, `commands/`, `hooks/`, `skills/`, `LICENSE`, and `PLUGIN.md` as its `README.md` - and the release publishes that into [releasetools/agent-plugins](https://github.com/releasetools/agent-plugins), where Claude Code and Codex install it as `mutex@releasetools`. So the manifests and `hooks/` are not in the npm package: nothing installs the plugin from npm.

`skills/` is in the npm package, next to `scripts/install-agent-skills.mjs`, because the agents that have no manifest install the skill by copying it out of wherever the package landed - which for most people is a global npm installation and no checkout at all. Those two keep their relative positions in the published tree; `package-release.test.ts` asserts an installer run out of an assembled tree.

The copy list in `package-plugin.mjs` is an allowlist rather than the repository minus exclusions, because what surrounds it - tests, the build tree, benchmark runners that take a connection string - is not something to publish by forgetting to exclude it. It refuses a symlink, and it runs the `plugin:validate` checks against the assembled tree, so a command naming a helper the list does not copy fails there rather than in somebody's session.

Bumping the version in both manifests is what publishes. Every release assembles the plugin and publishes it only when the marketplace does not already carry that version, so an ordinary release of the Action changes nothing there. The marketplace refuses a version that goes backwards, and refuses to change one already published - somebody has installed it - so a mistake is corrected by bumping rather than by replacing.

## Conventions

- Timestamps in the lock table are UTC wall time in `TIMESTAMP WITHOUT TIME ZONE` columns. Always write `(NOW() AT TIME ZONE 'UTC')` and always read `col AT TIME ZONE 'UTC'`; a bare `NOW()` silently stores session-local time and breaks expiry.
- The CLI writes results for acting commands (`lock`, `unlock`, `renew`) to stderr and query output (`status`, `list`, `prune`) to stdout. `--json` always goes to stdout, except while wrapping a program, which owns stdout.
- Acquiring a lock is decided by expiry alone; ownership only decides who may unlock or renew it. An unowned lock is open to anyone, and there is no override flag - breaking a lock means naming its owner. See `mayModify` in `database.ts`.
- Anything spawned goes through `spawn` with an argument array and never a shell. Values that become arguments are validated first and passed after `--`, so a flag-shaped value cannot be read as an option by the program being run.
- Secrets never reach stdout, logs, error messages - or argv. There is no flag that takes a connection string, because arguments are readable from `ps` by every user on the machine and land in shell history. The environment is the only way in, and reading a secret store is somebody else's job.

# Direct versus server benchmark

[`run.sh`](./run.sh) measures the fixed CLI cost and compares the `direct` and
`server` profiles against the same PostgreSQL database. Generated results go to
`/tmp` by default and are not committed to the repository.

## Prerequisites

- Node.js 24 or newer and this checkout's dependencies;
- [`hyperfine`](https://github.com/sharkdp/hyperfine) on `PATH`;
- a built checkout (`npm run build`);
- profiles named `direct` and `server` in `profiles.toml`; and
- `MUTEX_DATABASE_URL` available in the environment.

The `server` profile needs its normal `bind_address` and `working_dir`. Both
profiles must use the same database. If the server is already running, make
sure it was started with the same `MUTEX_DATABASE_URL` used by the benchmark.

## Run it

From the repository root:

```shell
npm ci
npm run build

test -n "$MUTEX_DATABASE_URL" && echo "MUTEX_DATABASE_URL is available"
benchmarks/direct-vs-server/run.sh
```

The script starts the configured server when necessary and stops it afterward.
It leaves a server that was already running alone. It also creates unique lock
names and releases them on exit, including after an interruption.

By default, each command runs 30 times and results are written to
`/tmp/mutex-profile-benchmark-<UTC timestamp>`. The directory contains:

- `startup.md` and `startup.json`: CLI startup measured with `mutex version`;
- `status.md` and `status.json`: direct and server reads of one held lock;
- `cycle.md` and `cycle.json`: a lock/unlock cycle through each profile; and
- `environment.txt`: Node, mutex, host, profile, protocol, and pool details.

## Options

Set environment variables to change the run without editing the script:

```shell
MUTEX_BENCH_RUNS=100 \
MUTEX_BENCH_OUTPUT=/tmp/mutex-benchmark-after \
benchmarks/direct-vs-server/run.sh
```

`MUTEX_BENCH_REPO` points the runner at a different checkout while keeping the
active profile configuration. Build that checkout first:

```shell
MUTEX_BENCH_REPO=/path/to/other/mutex \
MUTEX_BENCH_OUTPUT=/tmp/mutex-benchmark-before \
benchmarks/direct-vs-server/run.sh
```

Use the same machine, profiles, database, run count, and general time window
when comparing results. Remote database latency and transient host load can
otherwise outweigh the code change being measured.

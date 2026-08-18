#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
default_repo="$(cd -- "$script_dir/../.." && pwd)"
repo="${MUTEX_BENCH_REPO:-$default_repo}"
cli="$repo/bin/mutex.js"
runs="${MUTEX_BENCH_RUNS:-30}"
output="${MUTEX_BENCH_OUTPUT:-/tmp/mutex-profile-benchmark-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ -z "${MUTEX_DATABASE_URL:-}" ]]; then
  echo "error: MUTEX_DATABASE_URL is not available in this shell" >&2
  exit 3
fi
if [[ ! -f "$cli" ]]; then
  echo "error: mutex CLI not found at $cli" >&2
  exit 1
fi
if ! command -v hyperfine >/dev/null 2>&1; then
  echo "error: hyperfine is required" >&2
  exit 1
fi

mkdir -p "$output"

nonce="$(date -u +%s)-$$"
owner="benchmark-${nonce}"
status_key="mutex-benchmark-status-${nonce}"
cycle_key="mutex-benchmark-cycle-${nonce}"
started_server=false
status_locked=false

mutex() {
  node "$cli" "$@"
}

cleanup() {
  set +e
  if [[ "$status_locked" == true ]]; then
    mutex unlock "$status_key" -p direct -o "$owner" -q >/dev/null 2>&1
  fi
  mutex unlock "$cycle_key" -p direct -o "$owner" -q >/dev/null 2>&1
  if [[ "$started_server" == true ]]; then
    mutex server stop -p server >/dev/null 2>&1
  fi
}
trap cleanup EXIT INT TERM

portable_server_status() {
  local status line log_path
  status="$(mutex server status -p server)"
  while IFS= read -r line; do
    if [[ "$line" != "Log: "* ]]; then
      printf '%s\n' "$line"
      continue
    fi

    log_path="${line#Log: }"
    if [[ -n "${HOME:-}" && "$log_path" == "$HOME/"* ]]; then
      printf 'Log: $HOME/%s\n' "${log_path#"$HOME/"}"
    else
      printf 'Log: <working_dir>/%s\n' "${log_path##*/}"
    fi
  done <<<"$status"
}

if ! mutex server status -p server >/dev/null 2>&1; then
  echo "Starting the server profile for the benchmark..." >&2
  mutex server start -p server
  started_server=true
fi

# Hold one named lock so status exits successfully in every timed run.
mutex try-lock "$status_key" -p direct -o "$owner" -e 300 -q
status_locked=true

printf -v startup_cmd 'node %q version' "$cli"
printf -v direct_status_cmd 'node %q status %q -p direct -q' "$cli" "$status_key"
printf -v server_status_cmd 'node %q status %q -p server -q' "$cli" "$status_key"
printf -v direct_cycle_cmd \
  'node %q try-lock %q -p direct -o %q -e 30 -q && node %q unlock %q -p direct -o %q -q' \
  "$cli" "$cycle_key" "$owner" "$cli" "$cycle_key" "$owner"
printf -v server_cycle_cmd \
  'node %q try-lock %q -p server -o %q -e 30 -q && node %q unlock %q -p server -o %q -q' \
  "$cli" "$cycle_key" "$owner" "$cli" "$cycle_key" "$owner"

{
  echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Host: $(uname -ms)"
  echo "Node: $(node --version)"
  echo "mutex: $(mutex version)"
  echo "Runs per command: $runs"
  echo
  portable_server_status
} >"$output/environment.txt"

echo >&2
echo "1/3 CLI startup baseline" >&2
hyperfine \
  --warmup 3 \
  --runs "$runs" \
  --time-unit millisecond \
  --command-name "CLI startup" \
  --export-json "$output/startup.json" \
  --export-markdown "$output/startup.md" \
  "$startup_cmd"

echo >&2
echo "2/3 Status of one held lock" >&2
hyperfine \
  --warmup 3 \
  --runs "$runs" \
  --time-unit millisecond \
  --command-name "direct" "$direct_status_cmd" \
  --command-name "server" "$server_status_cmd" \
  --export-json "$output/status.json" \
  --export-markdown "$output/status.md"

echo >&2
echo "3/3 Lock and unlock cycle" >&2
hyperfine \
  --warmup 3 \
  --runs "$runs" \
  --time-unit millisecond \
  --command-name "direct" "$direct_cycle_cmd" \
  --command-name "server" "$server_cycle_cmd" \
  --export-json "$output/cycle.json" \
  --export-markdown "$output/cycle.md"

echo >&2
echo "Benchmark artifacts: $output" >&2

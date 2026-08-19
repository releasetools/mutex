/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error - skill tooling, deliberately plain JS with no types
import * as agentLock from "../skills/mutex/agent-lock.mjs";

const {
  buildNudge,
  commandLock,
  commandRenew,
  commandShow,
  commandUnlock,
  detectAgent,
  DEFAULT_EXPIRATION_SECONDS,
  formatRemaining,
  forget,
  preflight,
  readState,
  remember,
  renderStatusline,
  resolveOwner,
  statePath,
} = agentLock;

/**
 * What the agent's half of the skill has to get right without being told.
 *
 * The lock itself lives in PostgreSQL and is covered elsewhere; what is tested
 * here is the record of it - the owner that has to come back unchanged for an
 * unlock to work, and the expiry that everything ambient reads.
 */

const HOUR = 3600 * 1000;

function sandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lock-")));
  return { root, stateFile: path.join(root, "agent-locks.json") };
}

/** Collects what a command wrote, so the human wording is checked too. */
function capture() {
  const chunks: string[] = [];
  return {
    stream: { write: (text: string) => chunks.push(text) },
    get text() {
      return chunks.join("");
    },
  };
}

/**
 * A `mutex` that answers from a script instead of a database.
 *
 * It also records its arguments, because the arguments are the contract: an
 * hour rather than the CLI's minute, a bounded wait rather than the CLI's
 * whole-lease default, and always the same owner.
 */
function stubMutex(
  root: string,
  responses: Record<string, { stdout?: string; code?: number }>,
) {
  const log = path.join(root, "argv.log");
  const branches = Object.entries(responses)
    .map(([command, response]) => {
      const payload = path.join(root, `${command}.json`);
      fs.writeFileSync(payload, response.stdout ?? "");
      return `  ${command}) cat ${JSON.stringify(payload)}; exit ${response.code ?? 0};;`;
    })
    .join("\n");

  const executable = path.join(root, "mutex-stub.sh");
  fs.writeFileSync(
    executable,
    `#!/bin/sh\nprintf '%s\\n' "$@" >> ${JSON.stringify(log)}\ncase "$1" in\n${branches}\n  *) exit 1;;\nesac\n`,
  );
  fs.chmodSync(executable, 0o755);

  return {
    executable,
    get argv() {
      return fs.existsSync(log)
        ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean)
        : [];
    },
  };
}

function lockPayload(overrides: Record<string, unknown> = {}) {
  const expiresAt = new Date(Date.now() + HOUR).toISOString();
  return JSON.stringify({
    command: "lock",
    ok: true,
    id: "staging",
    owner: "claude@host:8f3a",
    expires: expiresAt,
    lock: {
      id: "staging",
      reason: "",
      owner: "claude@host:8f3a",
      createdAt: new Date().toISOString(),
      expiresAt,
      expired: false,
    },
    ...overrides,
  });
}

describe("the recorded lock", () => {
  const roots: string[] = [];
  const build = () => {
    const box = sandbox();
    roots.push(box.root);
    return box;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads as empty rather than throwing when the file is unusable", () => {
    const { root, stateFile } = build();
    expect(readState(stateFile)).toEqual({ locks: [] });
    fs.writeFileSync(stateFile, "{ not json");
    expect(readState(stateFile)).toEqual({ locks: [] });
    expect(readState(path.join(root, "nowhere", "x.json"))).toEqual({
      locks: [],
    });
  });

  it("keeps one entry per id, and forgets on request", () => {
    const { stateFile } = build();
    remember(stateFile, { id: "staging", owner: "first" });
    remember(stateFile, { id: "staging", owner: "second" });
    remember(stateFile, { id: "deploy", owner: "third" });

    expect(readState(stateFile).locks).toEqual([
      { id: "staging", owner: "second" },
      { id: "deploy", owner: "third" },
    ]);
    expect(forget(stateFile, "staging")).toBe(true);
    expect(forget(stateFile, "staging")).toBe(false);
    expect(readState(stateFile).locks).toHaveLength(1);
  });

  it("is written where XDG says state belongs", () => {
    expect(statePath({ XDG_STATE_HOME: "/var/state" }, "/home/alice")).toBe(
      "/var/state/releasetools-mutex/agent-locks.json",
    );
    expect(statePath({}, "/home/alice")).toBe(
      "/home/alice/.local/state/releasetools-mutex/agent-locks.json",
    );
  });
});

describe("who the lock belongs to", () => {
  it("uses $MUTEX_OWNER when the environment names one", () => {
    expect(resolveOwner({ MUTEX_OWNER: " ci-run-42 " }, "host")).toBe(
      "ci-run-42",
    );
  });

  it("otherwise generates a name that two sessions cannot share", () => {
    const first = resolveOwner({ CLAUDECODE: "1" }, "workstation.local");
    const second = resolveOwner({ CLAUDECODE: "1" }, "workstation.local");

    expect(first).toMatch(/^claude@workstation:[0-9a-f]{4}$/);
    expect(first).not.toBe(second);
  });

  it("names the agent it is running inside, and falls back quietly", () => {
    expect(detectAgent({ CODEX_SANDBOX: "seatbelt" })).toBe("codex");
    expect(detectAgent({ HERMES_SESSION: "1" })).toBe("hermes");
    expect(detectAgent({ MUTEX_AGENT_NAME: "bespoke" })).toBe("bespoke");
    expect(detectAgent({ PATH: "/usr/bin" })).toBe("agent");
  });
});

describe("what the deadline looks like", () => {
  const at = (seconds: number) => ({
    id: "staging",
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  });

  it("reads at a glance, in minutes above a minute", () => {
    expect(formatRemaining(42)).toBe("42s");
    expect(formatRemaining(600)).toBe("10m");
    expect(formatRemaining(3660)).toBe("1h 1m");
  });

  it("says nothing at all when nothing is held", () => {
    expect(renderStatusline({ locks: [] })).toBe("");
    expect(renderStatusline({ locks: [at(-60)] })).toBe("");
  });

  it("colours by how much is left", () => {
    const plain = (seconds: number) =>
      renderStatusline({ locks: [at(seconds)] }, Date.now(), { color: false });
    expect(plain(2400)).toBe("🔒 staging 40m");

    const coloured = (seconds: number) =>
      renderStatusline({ locks: [at(seconds)] }).slice(0, 5);
    expect(coloured(2400)).toBe("\x1b[36m");
    expect(coloured(300)).toBe("\x1b[33m");
    expect(coloured(60)).toBe("\x1b[31m");
  });

  it("lists every lock this machine holds", () => {
    expect(
      renderStatusline({ locks: [at(2400), at(300)] }, Date.now(), {
        color: false,
      }),
    ).toBe("🔒 staging 40m, staging 5m");
  });
});

describe("the warning before a lock lapses", () => {
  const entry = (seconds: number, nudged: number[] = []) => ({
    id: "staging",
    owner: "claude@host:8f3a",
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    nudged,
  });

  it("says nothing while there is time", () => {
    const { message, changed } = buildNudge({ locks: [entry(1800)] });
    expect(message).toBe("");
    expect(changed).toBe(false);
  });

  it("asks once per threshold, so a refusal is not re-litigated", () => {
    const first = buildNudge({ locks: [entry(500)] });
    expect(first.message).toContain("expires in 8m");
    expect(first.message).toContain("Ask the user whether to extend it");
    expect(first.state.locks[0].nudged).toEqual([600]);

    expect(buildNudge(first.state).message).toBe("");

    const urgent = buildNudge({ locks: [entry(90, [600])] });
    expect(urgent.message).toContain("expires in 1m");
    expect(urgent.state.locks[0].nudged).toEqual([600, 120]);
  });

  it("reports a lock that has gone, then stops tracking it", () => {
    const { message, state } = buildNudge({ locks: [entry(-30)] });
    expect(message).toContain("has expired; you no longer hold it");
    expect(state.locks).toEqual([]);
  });
});

describe("taking, extending and handing back", () => {
  const roots: string[] = [];
  const build = () => {
    const box = sandbox();
    roots.push(box.root);
    return box;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("asks for an hour and a bounded wait, and writes down what it got", () => {
    const { root, stateFile } = build();
    const mutex = stubMutex(root, { lock: { stdout: lockPayload() } });
    const out = capture();

    const code = commandLock("staging", {
      stateFile,
      executable: mutex.executable,
      owner: "claude@host:8f3a",
      reason: "migrating",
      stdout: out.stream,
    });

    expect(code).toBe(0);
    expect(mutex.argv).toEqual([
      "lock",
      "staging",
      "-e",
      String(DEFAULT_EXPIRATION_SECONDS),
      "-w",
      "30",
      "-o",
      "claude@host:8f3a",
      "--json",
      "-r",
      "migrating",
    ]);
    expect(readState(stateFile).locks[0]).toEqual(
      expect.objectContaining({ id: "staging", owner: "claude@host:8f3a" }),
    );
    expect(out.text).toContain("Acquired 'staging'");
  });

  it("uses try-lock for a single attempt, which takes no waiting options", () => {
    const { root, stateFile } = build();
    const mutex = stubMutex(root, { "try-lock": { stdout: lockPayload() } });

    commandLock("staging", {
      stateFile,
      executable: mutex.executable,
      owner: "o",
      single: true,
      stdout: capture().stream,
    });

    expect(mutex.argv).toEqual([
      "try-lock",
      "staging",
      "-e",
      "3600",
      "-o",
      "o",
      "--json",
    ]);
  });

  it("records nothing when the lock was not acquired, and says who has it", () => {
    const { root, stateFile } = build();
    const mutex = stubMutex(root, {
      lock: {
        code: 4,
        stdout: JSON.stringify({
          command: "lock",
          ok: false,
          id: "staging",
          status: "contended",
          holder: {
            id: "staging",
            owner: "alice",
            reason: "deploying",
            expiresAt: new Date(Date.now() + 600 * 1000).toISOString(),
          },
        }),
      },
    });
    const out = capture();

    const code = commandLock("staging", {
      stateFile,
      executable: mutex.executable,
      owner: "o",
      stdout: out.stream,
    });

    expect(code).toBe(4);
    expect(readState(stateFile).locks).toEqual([]);
    expect(out.text).toContain("held by: alice");
    expect(out.text).toContain("in 10m");
  });

  it("renews with the owner it recorded, and starts the reminders again", () => {
    const { root, stateFile } = build();
    remember(stateFile, {
      id: "staging",
      owner: "claude@host:8f3a",
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
      nudged: [600, 120],
    });
    const extended = new Date(Date.now() + HOUR).toISOString();
    const mutex = stubMutex(root, {
      renew: {
        stdout: JSON.stringify({
          command: "renew",
          ok: true,
          id: "staging",
          extended: true,
          expires: extended,
          lock: {
            id: "staging",
            owner: "claude@host:8f3a",
            expiresAt: extended,
          },
        }),
      },
    });

    const code = commandRenew("staging", {
      stateFile,
      executable: mutex.executable,
      stdout: capture().stream,
    });

    expect(code).toBe(0);
    expect(mutex.argv).toContain("claude@host:8f3a");
    expect(readState(stateFile).locks[0]).toEqual(
      expect.objectContaining({ expiresAt: extended, nudged: [] }),
    );
  });

  it("forgets a lock it handed back", () => {
    const { root, stateFile } = build();
    remember(stateFile, { id: "staging", owner: "claude@host:8f3a" });
    const mutex = stubMutex(root, {
      unlock: {
        stdout: JSON.stringify({ command: "unlock", ok: true, id: "staging" }),
      },
    });

    expect(
      commandUnlock("staging", {
        stateFile,
        executable: mutex.executable,
        stdout: capture().stream,
      }),
    ).toBe(0);
    expect(readState(stateFile).locks).toEqual([]);
  });

  it("keeps the record when a release is refused, because that is when it matters", () => {
    const { root, stateFile } = build();
    remember(stateFile, { id: "staging", owner: "claude@host:8f3a" });
    const mutex = stubMutex(root, {
      unlock: {
        code: 5,
        stdout: JSON.stringify({
          command: "unlock",
          ok: false,
          id: "staging",
          outcome: "owned-by-another",
        }),
      },
    });
    const out = capture();

    expect(
      commandUnlock("staging", {
        stateFile,
        executable: mutex.executable,
        stdout: out.stream,
      }),
    ).toBe(5);
    expect(readState(stateFile).locks).toHaveLength(1);
    expect(out.text).toContain("stays held until it expires");
  });

  it("reports an expired record as no longer held", () => {
    const { root, stateFile } = build();
    void root;
    remember(stateFile, {
      id: "staging",
      owner: "claude@host:8f3a",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const out = capture();

    commandShow({ stateFile, stdout: out.stream });
    expect(out.text).toContain("expired - you no longer hold it");
  });
});

describe("preflight", () => {
  const roots: string[] = [];
  const build = () => {
    const box = sandbox();
    roots.push(box.root);
    return box;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stops at a CLI that is not installed", () => {
    const { root } = build();
    const report = preflight({
      executable: path.join(root, "does-not-exist"),
      env: {},
      home: root,
    });

    expect(report).toEqual(
      expect.objectContaining({ ok: false, reason: "cli-missing" }),
    );
    expect(report.remedy).toContain("npm install --global @releasetools/mutex");
  });

  it("is ready when the CLI answers, and never repeats the secret", () => {
    const { root } = build();
    const mutex = stubMutex(root, {
      version: { stdout: "1.3.1\n" },
      list: {
        stdout: JSON.stringify({ command: "list", count: 2, locks: [{}, {}] }),
      },
    });

    const report = preflight({
      executable: mutex.executable,
      env: { MUTEX_DATABASE_URL: "postgres://user:hunter2@host/db" },
      home: root,
    });

    expect(report).toEqual(
      expect.objectContaining({
        ok: true,
        reason: "ready",
        locks: 2,
        databaseUrl: true,
      }),
    );
    expect(JSON.stringify(report)).not.toContain("hunter2");
  });

  it("separates a missing connection string from a server that is not running", () => {
    const { root } = build();
    const missing = stubMutex(root, {
      version: { stdout: "1.3.1\n" },
      list: { code: 3 },
    });
    expect(
      preflight({ executable: missing.executable, env: {}, home: root }),
    ).toEqual(expect.objectContaining({ ok: false, reason: "no-connection" }));

    const { root: second } = build();
    const unreachable = stubMutex(second, {
      version: { stdout: "1.3.1\n" },
      list: { code: 1 },
    });
    expect(
      preflight({ executable: unreachable.executable, env: {}, home: second }),
    ).toEqual(expect.objectContaining({ ok: false, reason: "unreachable" }));
  });

  it("does not blame a server for a direct profile that cannot connect", () => {
    const { root } = build();
    fs.mkdirSync(path.join(root, "releasetools-mutex"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "releasetools-mutex", "profiles.toml"),
      '[direct]\nmode = "direct"\nenabled = true\nssl_negotiation = "direct"\n',
    );
    const mutex = stubMutex(root, {
      version: { stdout: "1.4.0\n" },
      list: { code: 1 },
    });

    const report = preflight({
      executable: mutex.executable,
      env: { XDG_CONFIG_HOME: root, MUTEX_DATABASE_URL: "postgres://host/db" },
      home: root,
    });

    expect(report.profile.sslNegotiation).toBe("direct");
    expect(report.remedy).not.toContain("mutex server start");
    expect(report.remedy).toContain("PostgreSQL 17 or newer");
  });

  it("names the profile mutex would use, when there is one", () => {
    const { root } = build();
    fs.mkdirSync(path.join(root, "releasetools-mutex"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "releasetools-mutex", "profiles.toml"),
      '[server]\nmode = "server"\nenabled = true\nbind_address = "localhost:5625"\nworking_dir = "/tmp"\n\n[direct]\nmode = "direct"\nenabled = false\n',
    );
    const mutex = stubMutex(root, {
      version: { stdout: "1.3.1\n" },
      list: { code: 1 },
    });

    const report = preflight({
      executable: mutex.executable,
      env: { XDG_CONFIG_HOME: root },
      home: root,
    });

    expect(report.profile).toEqual(
      expect.objectContaining({
        name: "server",
        mode: "server",
        bindAddress: "localhost:5625",
      }),
    );
    expect(report.remedy).toContain("mutex server start");
  });
});

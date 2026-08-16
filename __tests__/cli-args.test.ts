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

import { defaultOwner, helpText, parseCommandLine } from "../src/cli/args.js";
import { UsageError } from "../src/cli/exit-codes.js";

describe("parseCommandLine", () => {
  const originalOwner = process.env.MUTEX_OWNER;

  beforeEach(() => {
    process.env.MUTEX_OWNER = "tester";
  });

  afterEach(() => {
    if (originalOwner === undefined) {
      delete process.env.MUTEX_OWNER;
    } else {
      process.env.MUTEX_OWNER = originalOwner;
    }
  });

  it("reads a command and its lock id", () => {
    const parsed = parseCommandLine(["lock", "my-resource"]);
    expect(parsed.command).toBe("lock");
    expect(parsed.identifier).toBe("my-resource");
    expect(parsed.program).toEqual([]);
  });

  it("applies the documented defaults", () => {
    const { options } = parseCommandLine(["lock", "id"]);
    expect(options.expiration).toBe(60);
    expect(options.pollIntervalMs).toBe(10_000);
    // --max-wait defaults to -1, meaning "wait as long as the lease lasts".
    expect(options.pollTimeoutMs).toBe(60_000);
    expect(options.envVar).toBe("DATABASE_URL");
    expect(options.useSecenv).toBe(true);
    expect(options.autoRenew).toBe(true);
    expect(options.owner).toBe("tester");
  });

  it("derives the wait from --expiration unless --max-wait says otherwise", () => {
    expect(
      parseCommandLine(["lock", "id", "-e", "30"]).options.pollTimeoutMs,
    ).toBe(30_000);
    expect(
      parseCommandLine(["lock", "id", "-e", "30", "-w", "5"]).options
        .pollTimeoutMs,
    ).toBe(5_000);
  });

  it("gives try-lock no time to wait at all", () => {
    expect(parseCommandLine(["try-lock", "id"]).options.pollTimeoutMs).toBe(0);
  });

  it("keeps everything after -- for the wrapped program", () => {
    const parsed = parseCommandLine([
      "lock",
      "id",
      "-e",
      "30",
      "--",
      "npm",
      "test",
      "--json",
      "-e",
      "ignored-by-mutex",
    ]);

    expect(parsed.options.expiration).toBe(30);
    // The program's own flags must not be read as mutex's.
    expect(parsed.options.json).toBe(false);
    expect(parsed.program).toEqual([
      "npm",
      "test",
      "--json",
      "-e",
      "ignored-by-mutex",
    ]);
  });

  it("no longer knows the release alias", () => {
    expect(() => parseCommandLine(["release", "id"])).toThrow(
      /unknown command 'release'/,
    );
  });

  it("requires a lock id from every command that takes one", () => {
    // Including lock: a name nobody else can guess excludes nobody, so an
    // id that mutex invented for you would not be a mutex at all.
    for (const command of ["lock", "try-lock", "unlock", "renew", "status"]) {
      expect(() => parseCommandLine([command])).toThrow(/needs a lock id/);
    }
  });

  it("requires an id even in the wrapper form", () => {
    expect(() => parseCommandLine(["lock", "--", "make", "build"])).toThrow(
      /needs a lock id/,
    );
  });

  it("reads commands that take no id", () => {
    expect(parseCommandLine(["list"]).command).toBe("list");
    expect(parseCommandLine(["prune", "--dry-run"]).options.dryRun).toBe(true);
  });

  it("routes --help to the help command", () => {
    expect(parseCommandLine(["--help"]).command).toBe("help");
    expect(parseCommandLine(["lock", "--help"]).command).toBe("help");
    expect(parseCommandLine(["--help", "lock"]).topic).toBe("lock");
    expect(parseCommandLine(["help", "unlock"]).topic).toBe("unlock");
  });

  it("shows help even alongside a command's own options", () => {
    // Someone typing `mutex lock id -e 30 --help` wants to know what
    // --expiration does, not to be told help does not take it.
    const parsed = parseCommandLine(["lock", "id", "-e", "30", "--help"]);
    expect(parsed.command).toBe("help");
    expect(parsed.topic).toBe("lock");

    expect(() =>
      parseCommandLine(["unlock", "id", "--owner", "x", "--help"]),
    ).not.toThrow();
    expect(() =>
      parseCommandLine(["prune", "--dry-run", "--help"]),
    ).not.toThrow();
  });

  it("has no --version flag; the version is a command", () => {
    // A flag that only worked without positionals meant `mutex lock id -V`
    // took a lock instead of printing a version. One spelling only.
    expect(parseCommandLine(["version"]).command).toBe("version");
    for (const argv of [["--version"], ["-V"], ["lock", "id", "-V"]]) {
      expect(() => parseCommandLine(argv)).toThrow(UsageError);
    }
  });

  it("rejects an unknown command", () => {
    expect(() => parseCommandLine(["frobnicate"])).toThrow(UsageError);
  });

  it("does not accept inherited Object members as commands", () => {
    // `"toString" in COMMANDS` is true, so a plain `in` check would hand back
    // a command whose spec is undefined - crashing help, and reaching the
    // database before anything noticed.
    for (const name of [
      "toString",
      "constructor",
      "hasOwnProperty",
      "valueOf",
      "__proto__",
    ]) {
      expect(() => parseCommandLine([name])).toThrow(/unknown command/);
      expect(() => parseCommandLine(["help", name])).not.toThrow();
    }
  });

  it("gives renew a longer default lease than lock", () => {
    // A renewal is asked for by something already running, so the short
    // default that suits `lock` is the wrong one here.
    expect(parseCommandLine(["lock", "id"]).options.expiration).toBe(60);
    expect(parseCommandLine(["renew", "id"]).options.expiration).toBe(3600);
    expect(
      parseCommandLine(["renew", "id", "-e", "300"]).options.expiration,
    ).toBe(300);
  });

  it("rejects a missing lock id", () => {
    expect(() => parseCommandLine(["status"])).toThrow(/needs a lock id/);
  });

  it("rejects extra positionals", () => {
    expect(() => parseCommandLine(["lock", "id", "extra"])).toThrow(
      /unexpected argument/,
    );
    expect(() => parseCommandLine(["list", "extra"])).toThrow(
      /unexpected argument/,
    );
  });

  it("rejects options a command does not take", () => {
    expect(() => parseCommandLine(["list", "--reason", "x"])).toThrow(
      /does not take --reason/,
    );
    expect(() => parseCommandLine(["list", "--owner", "x"])).toThrow(
      /does not take --owner/,
    );
  });

  it("rejects an unknown option", () => {
    expect(() => parseCommandLine(["lock", "id", "--nope"])).toThrow(
      UsageError,
    );
  });

  it("rejects a program after a command that cannot wrap one", () => {
    expect(() => parseCommandLine(["unlock", "id", "--", "echo"])).toThrow(
      /cannot wrap a program/,
    );
  });

  it("rejects anything that is not a whole number of seconds", () => {
    // Number() alone accepts all of these, each wrongly: "" is 0, so
    // `-e "$UNSET"` would mean zero; 0x3c is 60; 1e21 is an "integer" that
    // reaches Postgres as a syntax error.
    for (const value of [
      "abc",
      "1.5",
      "",
      "0x3c",
      "1e21",
      " 30",
      "30s",
      "+30",
    ]) {
      expect(() => parseCommandLine(["lock", "id", "-e", value])).toThrow(
        /whole number of seconds/,
      );
    }

    expect(() => parseCommandLine(["lock", "id", "-e", "0"])).toThrow(
      /greater than 0/,
    );
    expect(() =>
      parseCommandLine(["lock", "id", "--poll-interval=-1"]),
    ).toThrow(/cannot be negative/);
  });

  it("tolerates the -e=45 form parseArgs hands back", () => {
    // node's parseArgs keeps the '=' for short options, so the value arrives
    // as "=45" - and the error it raises for `-w -1` recommends exactly this
    // spelling, so it had better work.
    expect(parseCommandLine(["lock", "id", "-e=45"]).options.expiration).toBe(
      45,
    );
    expect(
      parseCommandLine(["lock", "id", "-e=45", "--max-wait=-1"]).options
        .pollTimeoutMs,
    ).toBe(45_000);
  });

  it("does not offer try-lock the options it would discard", () => {
    // try-lock never waits, so advertising --max-wait and --poll-interval
    // only invites someone to set them and wonder why nothing changed.
    expect(() =>
      parseCommandLine(["try-lock", "id", "--max-wait", "30"]),
    ).toThrow(/does not take --max-wait/);
    expect(() =>
      parseCommandLine(["try-lock", "id", "--poll-interval", "5"]),
    ).toThrow(/does not take --poll-interval/);
    expect(
      parseCommandLine(["lock", "id", "-w", "30"]).options.pollTimeoutMs,
    ).toBe(30_000);
  });

  it("accepts the documented --max-wait=-1", () => {
    expect(
      parseCommandLine(["lock", "id", "-e", "45", "--max-wait=-1"]).options
        .pollTimeoutMs,
    ).toBe(45_000);
  });

  it("keeps renew as its own command", () => {
    const parsed = parseCommandLine(["renew", "deploy", "--owner", "ci"]);
    expect(parsed.command).toBe("renew");
    expect(parsed.identifier).toBe("deploy");
    expect(parsed.options.owner).toBe("ci");
  });

  it("leaves the owner unset when none is passed", () => {
    // Unowned by default, matching what the Action writes, so an unowned
    // caller can unlock and renew an unowned lock.
    delete process.env.MUTEX_OWNER;
    expect(parseCommandLine(["renew", "deploy"]).options.owner).toBeNull();
    expect(parseCommandLine(["lock", "deploy"]).options.owner).toBeNull();
  });

  it("has no --force anywhere", () => {
    // Confirming an unlock means naming the owner, not appending a flag.
    for (const command of ["lock", "unlock", "renew"]) {
      expect(() => parseCommandLine([command, "deploy", "--force"])).toThrow(
        UsageError,
      );
    }
  });

  it("treats a blank owner as unowned", () => {
    // So `--owner "$CI_RUN"` degrades to unowned when the variable is unset.
    expect(
      parseCommandLine(["unlock", "id", "--owner", ""]).options.owner,
    ).toBeNull();
    expect(
      parseCommandLine(["unlock", "id", "--owner", "  "]).options.owner,
    ).toBeNull();
  });

  it("has no --reentrant flag", () => {
    expect(() => parseCommandLine(["lock", "id", "--reentrant"])).toThrow(
      UsageError,
    );
  });

  it("takes --expiration, in seconds", () => {
    expect(parseCommandLine(["lock", "id"]).options.expiration).toBe(60);
    expect(
      parseCommandLine(["lock", "id", "--expiration", "300"]).options
        .expiration,
    ).toBe(300);
    expect(
      parseCommandLine(["lock", "id", "-e", "300"]).options.expiration,
    ).toBe(300);
  });

  it("maps --quiet and --verbose onto log levels", () => {
    expect(parseCommandLine(["list", "-q"]).options.logLevel).toBe("error");
    expect(parseCommandLine(["list", "--verbose"]).options.logLevel).toBe(
      "debug",
    );
    expect(parseCommandLine(["list"]).options.logLevel).toBe("info");
  });
});

describe("defaultOwner", () => {
  const original = process.env.MUTEX_OWNER;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MUTEX_OWNER;
    } else {
      process.env.MUTEX_OWNER = original;
    }
  });

  it("reads MUTEX_OWNER", () => {
    process.env.MUTEX_OWNER = "ci@runner-7";
    expect(defaultOwner()).toBe("ci@runner-7");
  });

  it("is null when nothing says otherwise", () => {
    delete process.env.MUTEX_OWNER;
    expect(defaultOwner()).toBeNull();
  });

  it("treats an empty MUTEX_OWNER as unset", () => {
    process.env.MUTEX_OWNER = "";
    expect(defaultOwner()).toBeNull();
  });
});

describe("helpText", () => {
  it("lists every command", () => {
    const text = helpText(null);
    for (const command of [
      "lock",
      "try-lock",
      "unlock",
      "renew",
      "status",
      "list",
      "prune",
    ]) {
      expect(text).toContain(command);
    }
  });

  it("shows the usage line for one command", () => {
    expect(helpText("renew")).toContain("mutex renew <id>");
  });
});

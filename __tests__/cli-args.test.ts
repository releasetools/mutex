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
    expect(parsed.generatedIdentifier).toBe(false);
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
    const { options } = parseCommandLine(["try-lock", "id", "-w", "600"]);
    expect(options.pollTimeoutMs).toBe(0);
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

  it("mints a UUID when lock is given no id", () => {
    const parsed = parseCommandLine(["lock"]);

    expect(parsed.generatedIdentifier).toBe(true);
    expect(parsed.identifier).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("mints a distinct id each time", () => {
    expect(parseCommandLine(["lock"]).identifier).not.toBe(
      parseCommandLine(["lock"]).identifier,
    );
  });

  it("mints an id for try-lock too, and for the wrapper form", () => {
    expect(parseCommandLine(["try-lock"]).generatedIdentifier).toBe(true);

    const wrapped = parseCommandLine(["lock", "--", "make", "build"]);
    expect(wrapped.generatedIdentifier).toBe(true);
    expect(wrapped.program).toEqual(["make", "build"]);
  });

  it("keeps an id that was given", () => {
    const parsed = parseCommandLine(["lock", "my-resource"]);
    expect(parsed.generatedIdentifier).toBe(false);
    expect(parsed.identifier).toBe("my-resource");
  });

  it("still requires an id for the commands that name an existing lock", () => {
    for (const command of ["unlock", "renew", "status"]) {
      expect(() => parseCommandLine([command])).toThrow(/needs a lock id/);
    }
  });

  it("reads commands that take no id", () => {
    expect(parseCommandLine(["list"]).command).toBe("list");
    expect(parseCommandLine(["prune", "--dry-run"]).options.dryRun).toBe(true);
  });

  it("routes --help and --version to their commands", () => {
    expect(parseCommandLine(["--help"]).command).toBe("help");
    expect(parseCommandLine(["lock", "--help"]).command).toBe("help");
    expect(parseCommandLine(["--help", "lock"]).topic).toBe("lock");
    expect(parseCommandLine(["help", "unlock"]).topic).toBe("unlock");
    expect(parseCommandLine(["--version"]).command).toBe("version");
  });

  it("rejects an unknown command", () => {
    expect(() => parseCommandLine(["frobnicate"])).toThrow(UsageError);
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
    expect(() => parseCommandLine(["status", "id", "--force"])).toThrow(
      /does not take --force/,
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

  it("rejects non-numeric and out-of-range durations", () => {
    expect(() => parseCommandLine(["lock", "id", "-e", "abc"])).toThrow(
      /whole number/,
    );
    expect(() => parseCommandLine(["lock", "id", "-e", "1.5"])).toThrow(
      /whole number/,
    );
    expect(() => parseCommandLine(["lock", "id", "-e", "0"])).toThrow(
      /greater than 0/,
    );
    // A negative value needs the `--flag=-N` form; `-i -1` is ambiguous.
    expect(() =>
      parseCommandLine(["lock", "id", "--poll-interval=-1"]),
    ).toThrow(/cannot be negative/);
  });

  it("accepts negative durations in the --flag=-N form", () => {
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

  it("gives renew a default owner when none is passed", () => {
    expect(parseCommandLine(["renew", "deploy"]).options.owner).toBe("tester");
  });

  it("does not let renew break somebody else's lock", () => {
    // No --force escape: renewing a lock you do not hold is never right.
    expect(() => parseCommandLine(["renew", "deploy", "--force"])).toThrow(
      /does not take --force/,
    );
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
  it("prefers MUTEX_OWNER", () => {
    const original = process.env.MUTEX_OWNER;
    process.env.MUTEX_OWNER = "ci@runner-7";
    try {
      expect(defaultOwner()).toBe("ci@runner-7");
    } finally {
      if (original === undefined) {
        delete process.env.MUTEX_OWNER;
      } else {
        process.env.MUTEX_OWNER = original;
      }
    }
  });

  it("falls back to user@host", () => {
    const original = process.env.MUTEX_OWNER;
    delete process.env.MUTEX_OWNER;
    try {
      expect(defaultOwner()).toMatch(/^.+@.+$/);
    } finally {
      if (original !== undefined) {
        process.env.MUTEX_OWNER = original;
      }
    }
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

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

import { jest } from "@jest/globals";
import { resolveConnectionString } from "../src/cli/config.js";
import { ConfigurationError } from "../src/cli/exit-codes.js";
import { findConnectionString } from "../src/connection.js";
import { Logger } from "../src/logger.js";

type AnyFn = (...args: unknown[]) => unknown;

const core = {
  getInput: jest.fn<AnyFn>(),
  warning: jest.fn<AnyFn>(),
  info: jest.fn<AnyFn>(),
  error: jest.fn<AnyFn>(),
  debug: jest.fn<AnyFn>(),
};

jest.unstable_mockModule("@actions/core", () => core);

// Imported after the mock is registered, since it reads GitHub Actions inputs.
const { MutexSettings } = await import("../src/configuration.js");

const PREFERRED = "MUTEX_DATABASE_URL";
const DEPRECATED = "DATABASE_URL";

const MUTEX_DB = "postgres://mutex@localhost/locks";
const APP_DB = "postgres://app@localhost/theapp";

/** Keeps the warnings, so the deprecation can be asserted rather than guessed at. */
class RecordingLogger implements Logger {
  readonly warnings: string[] = [];

  info(): void {}
  error(): void {}
  debug(): void {}

  warning(message: string): void {
    this.warnings.push(message);
  }
}

/** Only these are touched, so the rest of the environment is left alone. */
const NAMES = [PREFERRED, DEPRECATED];
const original = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));

const setEnv = (values: Record<string, string>) => {
  for (const name of NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, values);
};

const restoreEnv = () => {
  for (const name of NAMES) {
    const value = original[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
};

/**
 * The precedence itself, away from either front end: one name, then the other,
 * and a warning only for the one on its way out.
 */
describe("findConnectionString", () => {
  const from = (values: Record<string, string>) => {
    const log = new RecordingLogger();
    const found = findConnectionString((name) => values[name], log);
    return { found, warnings: log.warnings };
  };

  it("takes MUTEX_DATABASE_URL over DATABASE_URL, and says nothing", () => {
    // The case the rename exists for: a repository whose DATABASE_URL is its
    // application's, with the lock database named separately.
    const { found, warnings } = from({
      [PREFERRED]: MUTEX_DB,
      [DEPRECATED]: APP_DB,
    });

    expect(found).toEqual({ value: MUTEX_DB, name: PREFERRED });
    expect(warnings).toEqual([]);
  });

  it("still reads DATABASE_URL, warning once and naming its replacement", () => {
    const { found, warnings } = from({ [DEPRECATED]: MUTEX_DB });

    expect(found).toEqual({ value: MUTEX_DB, name: DEPRECATED });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(DEPRECATED);
    expect(warnings[0]).toContain(PREFERRED);
  });

  it("is null when neither name holds anything", () => {
    const { found, warnings } = from({});

    expect(found).toBeNull();
    // Nothing was used, so nothing is deprecated yet - the caller reports the
    // absence, since only it knows how to say so.
    expect(warnings).toEqual([]);
  });

  it("treats an empty value as unset", () => {
    // `MUTEX_DATABASE_URL: ${{ secrets.NOT_A_SECRET }}` is empty, not missing.
    const { found, warnings } = from({ [PREFERRED]: "", [DEPRECATED]: APP_DB });

    expect(found).toEqual({ value: APP_DB, name: DEPRECATED });
    expect(warnings).toHaveLength(1);
  });
});

describe("resolveConnectionString (CLI)", () => {
  let log: RecordingLogger;

  beforeEach(() => {
    log = new RecordingLogger();
    setEnv({});
  });

  afterAll(restoreEnv);

  it("reads $MUTEX_DATABASE_URL", () => {
    setEnv({ [PREFERRED]: MUTEX_DB });

    expect(resolveConnectionString(log)).toEqual({
      value: MUTEX_DB,
      name: PREFERRED,
    });
    expect(log.warnings).toEqual([]);
  });

  it("falls back to $DATABASE_URL, and warns", () => {
    setEnv({ [DEPRECATED]: MUTEX_DB });

    expect(resolveConnectionString(log)).toEqual({
      value: MUTEX_DB,
      name: DEPRECATED,
    });
    expect(log.warnings).toHaveLength(1);
  });

  it("fails when neither is set, naming the one to set", () => {
    let error;
    try {
      resolveConnectionString(log);
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    // The name to set, not the deprecated one: it still works, but nobody
    // should be sent to it.
    expect((error as ConfigurationError).message).toBe(
      `no connection string: ${PREFERRED} is not set`,
    );
    expect((error as ConfigurationError).hint).toContain(
      `${PREFERRED}=... mutex`,
    );
  });
});

describe("MutexSettings (Action)", () => {
  let log: RecordingLogger;

  /** Either name can arrive in the environment or under `with:`, or both. */
  const configure = (
    environment: Record<string, string>,
    inputs: Record<string, string> = {},
  ) => {
    setEnv(environment);
    core.getInput.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      return inputs[name] ?? (name === "command" ? "lock" : "");
    });
  };

  beforeEach(() => {
    log = new RecordingLogger();
    configure({});
  });

  afterAll(restoreEnv);

  it("reads MUTEX_DATABASE_URL from the environment", () => {
    configure({ [PREFERRED]: MUTEX_DB });

    expect(new MutexSettings(log).dbConnectionString).toBe(MUTEX_DB);
    expect(log.warnings).toEqual([]);
  });

  it("reads MUTEX_DATABASE_URL from a with: input", () => {
    configure({}, { [PREFERRED]: MUTEX_DB });

    expect(new MutexSettings(log).dbConnectionString).toBe(MUTEX_DB);
    expect(log.warnings).toEqual([]);
  });

  it("prefers the new name wherever it is given", () => {
    // A workflow whose job-level env: sets DATABASE_URL for its application,
    // passing the lock database to this step alone.
    configure({ [DEPRECATED]: APP_DB }, { [PREFERRED]: MUTEX_DB });

    expect(new MutexSettings(log).dbConnectionString).toBe(MUTEX_DB);
    expect(log.warnings).toEqual([]);
  });

  it("still accepts DATABASE_URL, and warns", () => {
    configure({}, { [DEPRECATED]: MUTEX_DB });

    expect(new MutexSettings(log).dbConnectionString).toBe(MUTEX_DB);
    expect(log.warnings).toHaveLength(1);
    expect(log.warnings[0]).toContain(PREFERRED);
  });

  it("fails when neither is given, naming the one to set", () => {
    expect(() => new MutexSettings(log)).toThrow(new RegExp(PREFERRED));
  });
});

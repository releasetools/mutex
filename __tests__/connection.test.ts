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

type AnyFn = (...args: unknown[]) => unknown;

const core = { getInput: jest.fn<AnyFn>() };

jest.unstable_mockModule("@actions/core", () => core);

// Imported after the mock is registered, since it reads GitHub Actions inputs.
const { MutexSettings } = await import("../src/configuration.js");

const NAME = "MUTEX_DATABASE_URL";
/** Read until 1.3.0, and the reason this file guards both front ends. */
const DROPPED = "DATABASE_URL";

const MUTEX_DB = "postgres://mutex@localhost/locks";
const APP_DB = "postgres://app@localhost/theapp";

const NAMES = [NAME, DROPPED];
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

describe("resolveConnectionString (CLI)", () => {
  beforeEach(() => setEnv({}));
  afterAll(restoreEnv);

  it("reads $MUTEX_DATABASE_URL", () => {
    setEnv({ [NAME]: MUTEX_DB });

    expect(resolveConnectionString()).toBe(MUTEX_DB);
  });

  it("does not read $DATABASE_URL", () => {
    // The whole point of the rename: that name belongs to the application
    // more often than to the lock store, so mutex no longer takes it.
    setEnv({ [DROPPED]: APP_DB });

    expect(() => resolveConnectionString()).toThrow(ConfigurationError);
  });

  it("fails when it is not set, naming what to set", () => {
    let error;
    try {
      resolveConnectionString();
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as ConfigurationError).message).toBe(
      `no connection string: ${NAME} is not set`,
    );
    expect((error as ConfigurationError).hint).toContain(`${NAME}=... mutex`);
  });
});

describe("MutexSettings (Action)", () => {
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

  beforeEach(() => configure({}));
  afterAll(restoreEnv);

  it("reads MUTEX_DATABASE_URL from the environment", () => {
    configure({ [NAME]: MUTEX_DB });

    expect(new MutexSettings().dbConnectionString).toBe(MUTEX_DB);
  });

  it("reads MUTEX_DATABASE_URL from a with: input", () => {
    configure({}, { [NAME]: MUTEX_DB });

    expect(new MutexSettings().dbConnectionString).toBe(MUTEX_DB);
  });

  it("does not read DATABASE_URL, from either place", () => {
    // A workflow whose job-level env: still sets it for its application gets
    // told the lock database is missing, rather than locking in the app's.
    configure({ [DROPPED]: APP_DB }, { [DROPPED]: APP_DB });

    expect(() => new MutexSettings()).toThrow(new RegExp(NAME));
  });

  it("fails when it is not given, naming what to set", () => {
    expect(() => new MutexSettings()).toThrow(new RegExp(NAME));
  });
});

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

type AnyFn = (...args: unknown[]) => unknown;
const core = { getInput: jest.fn<AnyFn>() };

jest.unstable_mockModule("@actions/core", () => core);

const { MutexSettings } = await import("../src/configuration.js");

describe("MutexSettings ownership", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const inputs: Record<string, string> = {
    DATABASE_URL: "postgresql://user:password@localhost/mutex",
    command: "lock",
    id: "deploy",
    expiration: "60",
    reason: "",
    owner: "",
    "auto-release": "true",
    "max-wait": "-1",
    "poll-interval": "10",
  };

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.DATABASE_URL;
    inputs.owner = "";
    core.getInput.mockImplementation((name) => inputs[name as string] ?? "");
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("keeps locks unowned when owner is unset", () => {
    expect(new MutexSettings().owner).toBeNull();
  });

  it("treats a blank owner as unowned", () => {
    inputs.owner = "   ";

    expect(new MutexSettings().owner).toBeNull();
  });

  it("records a named owner", () => {
    inputs.owner = " releasetools/mutex@12345 ";

    expect(new MutexSettings().owner).toBe("releasetools/mutex@12345");
  });
});

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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseIntoClientConfig } from "pg-connection-string";
import { resolveConnectionString } from "../src/cli/config.js";
import {
  explainSslFailure,
  isDirectNegotiationFailure,
  resolveConnection,
  SslNegotiationOptions,
  SslPosture,
} from "../src/connection.js";
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

describe("resolveConnection (SSL policy)", () => {
  const NO_ENV: NodeJS.ProcessEnv = {};
  const at = (query: string) =>
    `postgres://u:p@db.example.com:5432/locks${query}`;
  const resolve = (
    url: string,
    options: SslNegotiationOptions = {},
    env = NO_ENV,
  ) => resolveConnection(url, options, env);

  it("does not let node-postgres emit its sslmode deprecation warning", () => {
    // The warning this whole module exists to answer. It fires at most once
    // per process, and nothing else in this file provokes it.
    const emitWarning = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    try {
      resolve(at("?sslmode=require"));
      expect(emitWarning).not.toHaveBeenCalled();
    } finally {
      emitWarning.mockRestore();
    }
  });

  it.each(["require", "prefer", "verify-ca", "allow"])(
    "applies sslmode=%s as a verified connection",
    (mode) => {
      const { config, posture } = resolve(at(`?sslmode=${mode}`));

      // An object with no `rejectUnauthorized: false` is Node's default: the
      // chain and the hostname are both checked.
      expect(config.ssl).toEqual({});
      expect(posture).toMatchObject({
        declared: mode,
        effective: "verify-full",
        promoted: true,
      });
    },
  );

  it("leaves sslmode=verify-full alone and calls it nothing else", () => {
    const { config, posture } = resolve(at("?sslmode=verify-full"));

    expect(config.ssl).toEqual({});
    expect(posture).toMatchObject({
      effective: "verify-full",
      promoted: false,
    });
  });

  it("honours sslmode=no-verify, which asks for exactly that", () => {
    const { config, posture, warnings } = resolve(at("?sslmode=no-verify"));

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(posture.effective).toBe("no-verify");
    expect(warnings).toEqual([]);
  });

  it("warns when a remote connection carries no TLS at all", () => {
    const { config, warnings } = resolve(at("?sslmode=disable"));

    expect(config.ssl).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("db.example.com");
  });

  it("says nothing about a local database without TLS", () => {
    // What every integration test and docker-compose database looks like.
    const { config, warnings } = resolve(
      "postgres://mutex@localhost:5432/locks",
    );

    expect(config.ssl).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("treats an empty sslmode as no sslmode, as node-postgres does", () => {
    // `?sslmode=` is what templating an unset variable produces. Reading the
    // empty string as a mode would make TLS mandatory where node-postgres
    // leaves it absent, and would shadow PGSSLMODE with a value nobody wrote.
    const { config, posture, warnings } = resolve(at("?sslmode="));

    expect(config.ssl).toBeUndefined();
    expect(posture).toMatchObject({ declared: null, effective: "plaintext" });
    expect(warnings).toHaveLength(1);
  });

  it("still reaches PGSSLMODE past an empty sslmode", () => {
    const { config, posture } = resolve(
      at("?sslmode="),
      {},
      { PGSSLMODE: "require" },
    );

    expect(config.ssl).toEqual({});
    expect(posture).toMatchObject({ declared: "require", promoted: true });
  });

  it("reads PGSSLMODE when the connection string is silent", () => {
    const { config, posture } = resolve(at(""), {}, { PGSSLMODE: "require" });

    expect(config.ssl).toEqual({});
    expect(posture).toMatchObject({ declared: "require", promoted: true });
  });

  it("steps aside for an explicit uselibpqcompat=true, and says what it costs", () => {
    const { config, posture, warnings } = resolve(
      at("?sslmode=require&uselibpqcompat=true"),
    );

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(posture.effective).toBe("libpq");
    expect(warnings[0]).toContain("uselibpqcompat=true");
  });

  it("stays quiet when libpq semantics are already verify-full", () => {
    const { warnings } = resolve(
      at("?sslmode=verify-full&uselibpqcompat=true"),
    );

    expect(warnings).toEqual([]);
  });

  it("keeps every other connection parameter intact", () => {
    // Removing `sslmode` means rebuilding the URL, so nothing else about it
    // may shift: awkward credentials and an encoded database name included.
    // Compared against node-postgres' own reading rather than a hand-written
    // expectation, since its decoding is what has to be preserved.
    const url =
      "postgres://u%3As:p%2Fss%3F@db.example.com:6543/loc%2Fks?application_name=mutex";

    const { config } = resolve(`${url}&sslmode=require`);

    // `ssl` and `sslnegotiation` are the two fields mutex states itself.
    const { ssl, sslnegotiation, ...rest } = config;
    expect(rest).toEqual(parseIntoClientConfig(url));
    expect(ssl).toEqual({});
    expect(sslnegotiation).toBe("postgres");
  });

  it("still loads a private CA named by sslrootcert", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mutex-ca-"));
    const ca = path.join(directory, "root.crt");
    await writeFile(ca, "-----BEGIN CERTIFICATE-----\nnot a real one\n");
    try {
      const { config } = resolve(at(`?sslmode=require&sslrootcert=${ca}`));

      expect(config.ssl).toMatchObject({
        ca: expect.stringContaining("BEGIN"),
      });
      expect(config.ssl).not.toMatchObject({ rejectUnauthorized: false });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps the host when it arrives as a parameter instead of an authority", () => {
    const { config, posture } = resolve(
      "postgres://u:p@/locks?host=/var/run/postgresql&sslmode=require",
    );

    expect(config).toMatchObject({
      host: "/var/run/postgresql",
      database: "locks",
    });
    expect(posture.promoted).toBe(true);
  });

  it("hands a bare socket path over untouched", () => {
    const { config } = resolve("/var/run/postgresql locks");

    expect(config).toEqual({ connectionString: "/var/run/postgresql locks" });
  });

  it("applies the negotiation it reports, from either source", () => {
    // The pool config and the posture have to agree: reporting `direct` while
    // leaving the field to whatever the URL parser happened to keep would make
    // the diagnostics describe a connection nobody opened.
    for (const [label, url, options] of [
      ["from the URL", at("?sslmode=require&sslnegotiation=direct"), {}],
      ["from a profile", at("?sslmode=require"), { sslNegotiation: "direct" }],
      ["preferred", at("?sslmode=require"), { preferDirect: true }],
    ] as const) {
      const { config, posture } = resolve(url, options);

      expect([label, config.sslnegotiation]).toEqual([label, "direct"]);
      expect([label, posture.negotiation]).toEqual([label, "direct"]);
    }
  });

  it("rejects an sslnegotiation neither mutex nor node-postgres knows", () => {
    // mutex writes the field itself now, so a typo would otherwise be
    // overwritten and read as though direct negotiation were on.
    expect(() => resolve(at("?sslmode=require&sslnegotiation=dircet"))).toThrow(
      /Invalid sslnegotiation value/,
    );
  });

  it("does not ask for direct negotiation without TLS to negotiate", () => {
    // node-postgres refuses the combination outright, so preferring it must
    // not break every plaintext database.
    const { config, posture, warnings } = resolve(
      "postgres://mutex@localhost:5432/locks",
      { preferDirect: true },
    );

    expect(config.sslnegotiation).toBe("postgres");
    expect(posture.negotiation).toBe("postgres");
    expect(warnings).toEqual([]);
  });

  it("says so when a requested direct negotiation cannot be used", () => {
    const { config, warnings } = resolve(
      "postgres://mutex@localhost:5432/locks",
      { sslNegotiation: "direct" },
    );

    expect(config.sslnegotiation).toBe("postgres");
    expect(warnings[0]).toContain("does not use TLS");
  });

  it("lets a profile override the connection string's sslnegotiation", () => {
    const { config, posture } = resolve(
      at("?sslmode=require&sslnegotiation=direct"),
      {
        sslNegotiation: "postgres",
      },
    );

    expect(config).toMatchObject({ sslnegotiation: "postgres" });
    expect(posture.negotiation).toBe("postgres");
  });

  it("takes sslnegotiation from the connection string when no profile says", () => {
    const { config, posture } = resolve(
      at("?sslmode=require&sslnegotiation=direct"),
    );

    // Rebuilding the URL must not drop it on the way to the pool, which
    // nothing else would notice: the connection would simply be slower.
    expect(config).toMatchObject({ sslnegotiation: "direct" });
    expect(posture.negotiation).toBe("direct");
  });
});

describe("isDirectNegotiationFailure", () => {
  it.each([
    "Client network socket disconnected before secure TLS connection was established",
    "read ECONNRESET",
    "write EPROTO 123:error:0A00010B",
  ])("recognises %s", (message) => {
    expect(isDirectNegotiationFailure(new Error(message))).toBe(true);
  });

  it.each([
    'password authentication failed for user "mutex"',
    "self-signed certificate in certificate chain",
    "connection timeout expired",
  ])("leaves %s alone", (message) => {
    expect(isDirectNegotiationFailure(new Error(message))).toBe(false);
  });
});

describe("explainSslFailure", () => {
  const posture = (over: Partial<SslPosture>): SslPosture => ({
    declared: "require",
    effective: "verify-full",
    promoted: true,
    negotiation: "postgres",
    ...over,
  });

  it("blames direct negotiation for a socket that closed mid-handshake", () => {
    // Exactly what PostgreSQL 16 does when a client opens with TLS.
    const error = new Error(
      "Client network socket disconnected before secure TLS connection was established",
    );

    expect(
      explainSslFailure(error, posture({ negotiation: "direct" })),
    ).toContain("PostgreSQL 17");
  });

  it("explains a certificate rejection that the connection string never mentions", () => {
    const error = new Error("self-signed certificate in certificate chain");

    const hint = explainSslFailure(error, posture({}));
    expect(hint).toContain("sslmode=require");
    expect(hint).toContain("sslrootcert");
  });

  it("stays out of the way of unrelated failures", () => {
    expect(
      explainSslFailure(
        new Error("password authentication failed"),
        posture({}),
      ),
    ).toBeNull();
  });
});

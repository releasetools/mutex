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

import { CONNECTION_ENV_VAR, findConnectionString } from "../connection.js";
import { Logger } from "../logger.js";
import { ResolvedOptions } from "./args.js";
import { ConfigurationError } from "./exit-codes.js";

export interface Connection {
  value: string;
  /** Where it came from, for `--verbose` and for error messages. */
  source: string;
}

/**
 * Works out the PostgreSQL connection string.
 *
 * From `$MUTEX_DATABASE_URL`, or from the variable `--env-var` names; the
 * order the default is looked up in is shared with the Action, in
 * `connection.ts`.
 *
 * It comes from the environment, and only from there. Not from a flag,
 * because an argument lands in shell history and in `ps` output that every
 * user on the machine can read for as long as the process runs. And not from
 * a secret store either: reading one means reimplementing somebody else's
 * file formats and owning a decryption subprocess, which is a great deal of
 * surface for a lock tool to carry.
 *
 * Whatever holds the secret can put it in the environment instead:
 *
 *     MUTEX_DATABASE_URL="$(dotsecenv secret get myapp::DATABASE_URL)" mutex lock x
 *
 * or, interactively, the dotsecenv shell plugin exports it on `cd` and there
 * is nothing to pass at all.
 */
export async function resolveConnectionString(
  options: ResolvedOptions,
  log: Logger,
): Promise<Connection> {
  // --env-var is taken at its word: that name is read and no other, and the
  // deprecation does not apply to it, since nothing was left to default.
  if (options.envVar) {
    const value = process.env[options.envVar];
    if (!value) {
      throw notSet(options.envVar);
    }
    return { value, source: `the ${options.envVar} environment variable` };
  }

  const connection = findConnectionString((name) => process.env[name], log);
  if (!connection) {
    throw notSet(CONNECTION_ENV_VAR);
  }

  return {
    value: connection.value,
    source: `the ${connection.name} environment variable`,
  };
}

function notSet(name: string): ConfigurationError {
  return new ConfigurationError(
    `no connection string: ${name} is not set`,
    `Export it, or pass it for one command: ${name}=... mutex ...`,
  );
}

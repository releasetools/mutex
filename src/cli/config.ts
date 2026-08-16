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

import { Logger } from "../logger.js";
import { DotsecenvError } from "../dotsecenv/errors.js";
import { findSecenvFile } from "../dotsecenv/secenv.js";
import { resolveEnvValue } from "../dotsecenv/index.js";
import { ResolvedOptions } from "./args.js";
import { ConfigurationError } from "./exit-codes.js";

export interface Connection {
  value: string;
  /** Where it came from, for `--verbose` and for error messages. */
  source: string;
}

/**
 * Works out the PostgreSQL connection string, in order of precedence:
 *
 *   1. the environment (DATABASE_URL by default)
 *   2. ./.secenv, decrypted through the dotsecenv CLI
 *
 * The environment comes first, so a one-off override never has to fight with
 * whatever the project's `.secenv` says - and when it is set there is nothing
 * to resolve, so no vault is opened and no GPG prompt can appear for a value
 * that was already to hand.
 *
 * There is no flag. A connection string passed on the command line lands in
 * shell history, and in `ps` for every user on the machine to read for as long
 * as the process runs; an environment variable does neither.
 */
export async function resolveConnectionString(
  options: ResolvedOptions,
  log: Logger,
): Promise<Connection> {
  const fromEnvironment = process.env[options.envVar];
  if (fromEnvironment) {
    return {
      value: fromEnvironment,
      source: `the ${options.envVar} environment variable`,
    };
  }

  if (!options.useSecenv) {
    throw new ConfigurationError(
      `no connection string: ${options.envVar} is unset and --no-secenv was given`,
      `Export ${options.envVar}.`,
    );
  }

  const file = findSecenvFile();
  if (!file) {
    throw new ConfigurationError(
      `no connection string: ${options.envVar} is unset and there is no .secenv here`,
      `Export ${options.envVar}, or run this from the directory whose .secenv defines it.`,
    );
  }

  log.debug(`Reading ${file}`);

  let resolved;
  try {
    resolved = await resolveEnvValue(options.envVar, {
      binary: options.dotsecenvBin ?? undefined,
      config: options.dotsecenvConfig ?? undefined,
      log,
    });
  } catch (error) {
    if (error instanceof DotsecenvError) {
      throw new ConfigurationError(
        `could not resolve ${options.envVar} from .secenv:\n${error.describe()}`,
      );
    }
    throw error;
  }

  if (!resolved) {
    throw new ConfigurationError(
      `no connection string: ${file} does not define ${options.envVar}`,
      `Add it there, or export ${options.envVar}.`,
    );
  }

  const origin =
    resolved.kind === "secret"
      ? `${resolved.file} (secret '${resolved.secret}' in ${resolved.vault ?? "a configured vault"})`
      : resolved.file;

  return { value: resolved.value, source: origin };
}

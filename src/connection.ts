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

import { Logger } from "./logger.js";

/**
 * Where the connection string comes from.
 *
 * Prefixed on purpose. `DATABASE_URL` is the most reused name in the
 * ecosystem - frameworks, ORMs, PaaS providers and CI systems all set it, and
 * it points at the *application's* database far more often than at the one
 * holding locks. A repository that sets it for its app and then adds mutex
 * gets its locks in the app database, and is never told.
 */
export const CONNECTION_ENV_VAR = "MUTEX_DATABASE_URL";

/**
 * Still read, because it is what every workflow written against v1 passes.
 * Using it warns; removal is tracked in issue #70.
 */
export const DEPRECATED_CONNECTION_ENV_VAR = "DATABASE_URL";

export interface ConnectionSource {
  /** The connection string itself. Never printed, never logged. */
  value: string;
  /** The name it was found under, for `--verbose` and for error messages. */
  name: string;
}

/**
 * The precedence, in one place, for both front ends.
 *
 * `read` answers with what a name is worth where the caller stands: the CLI
 * reads the environment, the Action reads the environment and then its own
 * `with:` inputs. What they must agree on is the order the two names are
 * tried in and the warning the old one earns, which is why that lives here
 * rather than in each of them.
 *
 * Warns once, since each front end resolves the connection string once.
 */
export function findConnectionString(
  read: (name: string) => string | null | undefined,
  log: Logger,
): ConnectionSource | null {
  const preferred = read(CONNECTION_ENV_VAR);
  if (preferred) {
    return { value: preferred, name: CONNECTION_ENV_VAR };
  }

  const deprecated = read(DEPRECATED_CONNECTION_ENV_VAR);
  if (deprecated) {
    log.warning(
      `${DEPRECATED_CONNECTION_ENV_VAR} is deprecated; rename it to ${CONNECTION_ENV_VAR}. ` +
        "Almost everything sets that name, and usually to the application's " +
        "own database rather than the one holding locks.",
    );
    return { value: deprecated, name: DEPRECATED_CONNECTION_ENV_VAR };
  }

  return null;
}

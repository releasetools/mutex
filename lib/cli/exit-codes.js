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
/**
 * Exit codes are part of the CLI's contract: scripts branch on them, so they
 * distinguish "the lock is held by someone else" from "something broke".
 *
 * `mutex lock <id> -- <program>` is the exception - once the program starts,
 * its own exit status is passed through, exactly like flock.
 */
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_CONFIGURATION = 3;
/** Could not acquire the lock, or it is not held (status/renew). */
export const EXIT_UNAVAILABLE = 4;
/** Refused: another owner holds the lock and --force was not given. */
export const EXIT_REFUSED = 5;
/** The wrapped program could not be started. */
export const EXIT_NO_PROGRAM = 127;
/** Raised for anything the user can fix by changing the command line. */
export class UsageError extends Error {
    constructor(message) {
        super(message);
        this.name = "UsageError";
    }
}
/** Raised when the connection string cannot be worked out. */
export class ConfigurationError extends Error {
    hint;
    constructor(message, hint) {
        super(message);
        this.name = "ConfigurationError";
        this.hint = hint ?? null;
    }
}
//# sourceMappingURL=exit-codes.js.map
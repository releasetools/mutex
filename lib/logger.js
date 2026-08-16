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
const THRESHOLDS = {
    silent: 0,
    error: 1,
    warning: 2,
    info: 3,
    debug: 4,
};
/**
 * Writes every message to stderr.
 *
 * stdout is deliberately left alone: it carries command results (and, while
 * `mutex lock ... -- <command>` runs, the wrapped process' own output), so
 * diagnostics must never be mixed into it.
 */
export class ConsoleLogger {
    threshold;
    constructor(level = "info") {
        this.threshold = THRESHOLDS[level];
    }
    info(message) {
        this.write(THRESHOLDS.info, message);
    }
    warning(message) {
        this.write(THRESHOLDS.warning, `warning: ${message}`);
    }
    error(message) {
        this.write(THRESHOLDS.error, `error: ${message}`);
    }
    debug(message) {
        this.write(THRESHOLDS.debug, `debug: ${message}`);
    }
    write(level, message) {
        if (level <= this.threshold) {
            process.stderr.write(`${message}\n`);
        }
    }
}
/** Discards everything. Useful in tests and for `--quiet`-style callers. */
export class SilentLogger {
    info() { }
    warning() { }
    error() { }
    debug() { }
}
//# sourceMappingURL=logger.js.map
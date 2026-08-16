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

export type LogLevel = "silent" | "error" | "warning" | "info" | "debug";

/**
 * The logging contract shared by the GitHub Action and the CLI.
 *
 * The Action maps it onto `@actions/core` so annotations keep working; the CLI
 * maps it onto stderr. Keeping the mutex core behind this interface is what
 * lets `database.ts` and `mutex.ts` run outside a GitHub runner.
 */
export interface Logger {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

const THRESHOLDS: Record<LogLevel, number> = {
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
export class ConsoleLogger implements Logger {
  private readonly threshold: number;

  constructor(level: LogLevel = "info") {
    this.threshold = THRESHOLDS[level];
  }

  info(message: string): void {
    this.write(THRESHOLDS.info, message);
  }

  warning(message: string): void {
    this.write(THRESHOLDS.warning, `warning: ${message}`);
  }

  error(message: string): void {
    this.write(THRESHOLDS.error, `error: ${message}`);
  }

  debug(message: string): void {
    this.write(THRESHOLDS.debug, `debug: ${message}`);
  }

  private write(level: number, message: string): void {
    if (level <= this.threshold) {
      process.stderr.write(`${message}\n`);
    }
  }
}

/** Discards everything. Useful in tests and for `--quiet`-style callers. */
export class SilentLogger implements Logger {
  info(): void {}
  warning(): void {}
  error(): void {}
  debug(): void {}
}

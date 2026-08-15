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

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorStack(error: unknown): string {
  return error instanceof Error && error.stack ? error.stack : "N/A";
}

function prefixOf(description: string | null | undefined): string {
  return description ? `${description}: ` : "";
}

export function logError(
  log: Logger,
  error: unknown,
  description?: string | null,
): void {
  log.error(`${prefixOf(description)}${describeError(error)}`);
  log.debug(`Stack trace: ${errorStack(error)}`);
}

export function logWarning(
  log: Logger,
  error: unknown,
  description?: string | null,
): void {
  log.warning(`${prefixOf(description)}${describeError(error)}`);
  log.debug(`Stack trace: ${errorStack(error)}`);
}

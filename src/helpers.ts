/*
 * Copyright (c) 2025 Mihai Bojin
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

import * as core from "@actions/core";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function loadRequiredNonEmptyFromGHAInput(name: string): string {
  const data = core.getInput(name);
  if (data && data.trim().length > 0) {
    return data;
  }

  throw new Error(`🚨 ${name} not found or empty. Cannot continue...`);
}

export function loadRequiredFromEnvOrGHAInput(name: string): string {
  const token = process.env[name] || core.getInput(name);
  if (token) {
    return token;
  }

  throw new Error(`🚨 ${name} not found. Cannot continue...`);
}

export function loadFromEnvOrGHAInput(name: string): string | null {
  const token = process.env[name] || core.getInput(name);
  if (token) {
    return token;
  }

  core.warning(`⚠️ ${name} not found.`);
  return null;
}

export function printError(error: any, description: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  core.error(`${description + ": " || ""}${message}`);
  core.debug(`Stack trace: ${error instanceof Error ? error.stack : "N/A"}`);
}

export function printWarning(error: any, description: string | null) {
  const message = error instanceof Error ? error.message : String(error);
  core.warning(`${description + ": " || ""}${message}`);
  core.debug(`Stack trace: ${error instanceof Error ? error.stack : "N/A"}`);
}

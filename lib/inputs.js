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
import * as core from "@actions/core";
/**
 * Readers for GitHub Actions inputs.
 *
 * Kept separate from `helpers.ts` so the mutex core (and therefore the CLI)
 * never has to import the Actions toolkit.
 */
export function loadRequiredFromEnvOrGHAInput(name) {
    const token = process.env[name] || core.getInput(name);
    if (token) {
        return token;
    }
    throw new Error(`🚨 ${name} not found. Cannot continue...`);
}
/**
 * Reads something optional. Absence is not reported here: only the caller
 * knows whether it was wanted, and warning about every unset optional value
 * puts a ⚠️ in the log of a job that is configured exactly as intended.
 */
export function loadFromEnvOrGHAInput(name) {
    return process.env[name] || core.getInput(name) || null;
}
//# sourceMappingURL=inputs.js.map
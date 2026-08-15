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
import { DotsecenvError } from "../dotsecenv/errors.js";
import { findSecenvFiles } from "../dotsecenv/secenv.js";
import { resolveEnvValue } from "../dotsecenv/index.js";
import { ConfigurationError } from "./exit-codes.js";
/**
 * Works out the PostgreSQL connection string, in order of precedence:
 *
 *   1. --database-url
 *   2. the environment (DATABASE_URL by default)
 *   3. the .secenv chain, decrypted through the dotsecenv CLI
 *
 * The explicit sources come first so a one-off override never has to fight
 * with whatever the project's `.secenv` says.
 */
export async function resolveConnectionString(options, log) {
    if (options.databaseUrl) {
        return { value: options.databaseUrl, source: "--database-url" };
    }
    const fromEnvironment = process.env[options.envVar];
    if (fromEnvironment) {
        return {
            value: fromEnvironment,
            source: `the ${options.envVar} environment variable`,
        };
    }
    if (!options.useSecenv) {
        throw new ConfigurationError(`no connection string: ${options.envVar} is unset and --no-secenv was given`, `Pass --database-url, or export ${options.envVar}.`);
    }
    const files = findSecenvFiles({ cwd: options.secenvDir });
    if (files.length === 0) {
        throw new ConfigurationError(`no connection string: ${options.envVar} is unset and no .secenv file was found`, `Looked from ${options.secenvDir} up to the repository root. Pass --database-url, or point --secenv-dir at the project.`);
    }
    log.debug(`Reading .secenv files: ${files.join(", ")}`);
    let resolved;
    try {
        resolved = await resolveEnvValue(options.envVar, {
            cwd: options.secenvDir,
            binary: options.dotsecenvBin ?? undefined,
            config: options.dotsecenvConfig ?? undefined,
            log,
        });
    }
    catch (error) {
        if (error instanceof DotsecenvError) {
            throw new ConfigurationError(`could not resolve ${options.envVar} from .secenv:\n${error.describe()}`);
        }
        throw error;
    }
    if (!resolved) {
        throw new ConfigurationError(`no connection string: none of the .secenv files define ${options.envVar}`, `Searched ${files.join(", ")}.`);
    }
    const origin = resolved.kind === "secret"
        ? `${resolved.file} (secret '${resolved.secret}' in ${resolved.vault ?? "a configured vault"})`
        : resolved.file;
    return { value: resolved.value, source: origin };
}
//# sourceMappingURL=config.js.map
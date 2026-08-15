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
 * The dotsecenv CLI's documented exit codes (pkg/dotsecenv/output/exitcodes.go).
 * Mapping them to kinds is what lets the caller tell "this secret does not
 * exist" apart from "GPG could not decrypt it".
 */
const KIND_BY_EXIT_CODE = {
    1: "general",
    2: "config",
    3: "vault",
    4: "gpg",
    5: "auth",
    6: "validation",
    7: "fingerprint",
    8: "access-denied",
    9: "algorithm",
};
export function kindForExitCode(code) {
    return KIND_BY_EXIT_CODE[code] ?? "general";
}
export class DotsecenvError extends Error {
    kind;
    exitCode;
    stderr;
    hint;
    constructor(message, options) {
        super(message, { cause: options.cause });
        this.name = "DotsecenvError";
        this.kind = options.kind;
        this.exitCode = options.exitCode ?? null;
        this.stderr = options.stderr?.trim() ?? "";
        this.hint = options.hint ?? null;
    }
    /** A multi-line rendering that keeps the CLI's own message and the hint. */
    describe() {
        const lines = [this.message];
        if (this.stderr) {
            lines.push(...this.stderr.split("\n").map((line) => `  ${line}`));
        }
        if (this.hint) {
            lines.push(`  hint: ${this.hint}`);
        }
        return lines.join("\n");
    }
}
//# sourceMappingURL=errors.js.map
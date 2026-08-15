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

export type DotsecenvErrorKind =
  | "not-installed"
  | "general"
  | "config"
  | "vault"
  | "gpg"
  | "auth"
  | "validation"
  | "fingerprint"
  | "access-denied"
  | "algorithm"
  | "timeout"
  | "parse";

/**
 * The dotsecenv CLI's documented exit codes (pkg/dotsecenv/output/exitcodes.go).
 * Mapping them to kinds is what lets the caller tell "this secret does not
 * exist" apart from "GPG could not decrypt it".
 */
const KIND_BY_EXIT_CODE: Record<number, DotsecenvErrorKind> = {
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

export function kindForExitCode(code: number): DotsecenvErrorKind {
  return KIND_BY_EXIT_CODE[code] ?? "general";
}

export interface DotsecenvErrorOptions {
  kind: DotsecenvErrorKind;
  exitCode?: number | null;
  /** Whatever the CLI wrote to stderr. Never contains a decrypted value. */
  stderr?: string;
  /** A concrete next step for the user, appended when the error is printed. */
  hint?: string;
  cause?: unknown;
}

export class DotsecenvError extends Error {
  readonly kind: DotsecenvErrorKind;
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly hint: string | null;

  constructor(message: string, options: DotsecenvErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "DotsecenvError";
    this.kind = options.kind;
    this.exitCode = options.exitCode ?? null;
    this.stderr = options.stderr?.trim() ?? "";
    this.hint = options.hint ?? null;
  }

  /** A multi-line rendering that keeps the CLI's own message and the hint. */
  describe(): string {
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

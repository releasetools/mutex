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

import fs from "node:fs";
import path from "node:path";

/**
 * A parser for `.secenv` files.
 *
 * The rules mirror `_dotsecenv_parse_line` in the dotsecenv shell plugin, so a
 * file behaves the same whether it is loaded by the shell or by this client:
 *
 *   KEY=value                    plain value
 *   KEY="value" / KEY='value'    plain value, surrounding quotes stripped
 *   KEY={dotsecenv}              secret named KEY
 *   KEY={dotsecenv/}             secret named KEY
 *   KEY={dotsecenv/SECRET}       secret named SECRET
 *   KEY={dotsecenv/ns::SECRET}   secret named ns::SECRET
 *   # comment / empty            ignored
 */

export const SECENV_FILENAME = ".secenv";

/** Environment variable names: a letter or underscore, then word characters. */
export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Secret keys, optionally carrying a single `namespace::` prefix. */
export const SECRET_NAME_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*(::[A-Za-z_][A-Za-z0-9_]*)?$/;

const SECRET_REFERENCE = /^\{dotsecenv\/(.*)\}$/;

export interface SecenvEntry {
  key: string;
  kind: "plain" | "secret";
  /** For `plain`, the literal value. For `secret`, the vault key to fetch. */
  value: string;
  file: string;
  line: number;
}

export interface SecenvIssue {
  file: string;
  line: number;
  message: string;
}

export interface ParsedSecenv {
  file: string;
  entries: SecenvEntry[];
  issues: SecenvIssue[];
}

export function parseSecenv(content: string, file: string): ParsedSecenv {
  const entries: SecenvEntry[] = [];
  const issues: SecenvIssue[] = [];

  content.split("\n").forEach((raw, index) => {
    const line = index + 1;

    // Trim both ends, which also drops the trailing CR of a CRLF file so a
    // `{dotsecenv/}` reference keeps a clean closing brace.
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      return;
    }

    const separator = trimmed.indexOf("=");
    if (separator < 0) {
      return;
    }

    const key = trimmed.slice(0, separator);
    if (!KEY_PATTERN.test(key)) {
      return;
    }

    const value = stripQuotes(trimmed.slice(separator + 1));

    if (value === "{dotsecenv}") {
      entries.push({ key, kind: "secret", value: key, file, line });
      return;
    }

    const reference = SECRET_REFERENCE.exec(value);
    if (!reference) {
      entries.push({ key, kind: "plain", value, file, line });
      return;
    }

    const name = reference[1];
    if (name === "") {
      // `{dotsecenv/}` means the same as `{dotsecenv}`.
      entries.push({ key, kind: "secret", value: key, file, line });
      return;
    }

    if (name.includes("/")) {
      issues.push({
        file,
        line,
        message: `invalid syntax '${value}' - only one '/' allowed`,
      });
      return;
    }

    if (!SECRET_NAME_PATTERN.test(name)) {
      issues.push({
        file,
        line,
        message: `invalid secret name '${name}' in '${value}'`,
      });
      return;
    }

    entries.push({ key, kind: "secret", value: name, file, line });
  });

  return { file, entries, issues };
}

export async function readSecenv(file: string): Promise<ParsedSecenv> {
  const content = await fs.promises.readFile(file, "utf8");
  return parseSecenv(content, file);
}

/**
 * The `.secenv` in `cwd`, or null when there is none.
 *
 * Deliberately does not walk upwards. An upward search has to stop somewhere,
 * and outside a git repository there is no sensible somewhere: from
 * /tmp/build-1234 it reaches /tmp, which anybody can write to, and a planted
 * `.secenv` there would decide which database mutex locks against. Reading one
 * directory is predictable and cannot be steered from outside it.
 *
 * Point `--secenv-dir` at the project root to use a file that lives higher up.
 */
export function findSecenvFile(cwd: string = process.cwd()): string | null {
  const candidate = path.join(path.resolve(cwd), SECENV_FILENAME);
  return isFile(candidate) ? candidate : null;
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

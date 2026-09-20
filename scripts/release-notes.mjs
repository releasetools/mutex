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
import { parseArgs } from "node:util";

/**
 * Reads one version's section from CHANGELOG.md for the GitHub release body.
 *
 * Auto-generated notes are no use here: they are built from the commits
 * reachable from the tag, and release tags point at built commits on
 * `release/<major>` whose history is other releases, not the work. CHANGELOG.md
 * is where the notes actually live, so this reads them from there.
 */
export function releaseNotes(markdown, version) {
  const wanted = version.replace(/^v/, "");
  const lines = markdown.split("\n");

  const start = lines.findIndex((line) => {
    const heading = line
      .trim()
      .match(/^## v?(\d+\.\d+\.\d+)(?: - \d{4}-\d{2}-\d{2})?$/);
    return heading?.[1] === wanted;
  });
  if (start < 0) {
    return null;
  }

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end < 0 ? rest : rest.slice(0, end))
    .filter(
      (line) =>
        !/^### (Added|Changed|Deprecated|Removed|Fixed|Security)\s*$/.test(
          line,
        ),
    )
    .join("\n")
    .trim();
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      file: { type: "string", default: "CHANGELOG.md" },
    },
  });

  const markdown = fs.existsSync(values.file)
    ? fs.readFileSync(values.file, "utf8")
    : "";
  const notes = releaseNotes(markdown, values.version ?? "");

  if (notes === null) {
    process.stderr.write(
      `No section for ${values.version ?? ""} in ${values.file}.\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(`${notes || "No user-visible changes."}\n`);
  }
}

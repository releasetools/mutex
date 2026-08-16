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
// @ts-expect-error - build tooling, deliberately plain JS with no types
import { releaseNotes } from "../scripts/release-notes.mjs";

const MARKDOWN = `# Release notes

Newest first. One line per change.

## 1.2.0

- Added a CLI.
- Fixed lock expiry on non-UTC databases.

## 1.1.0

- The original.
`;

describe("releaseNotes", () => {
  it("takes one version's section and stops at the next", () => {
    expect(releaseNotes(MARKDOWN, "v1.2.0")).toBe(
      "- Added a CLI.\n- Fixed lock expiry on non-UTC databases.",
    );
  });

  it("reads the last section, which has no heading after it", () => {
    expect(releaseNotes(MARKDOWN, "v1.1.0")).toBe("- The original.");
  });

  it("accepts the version with or without its v", () => {
    expect(releaseNotes(MARKDOWN, "1.2.0")).toBe(
      releaseNotes(MARKDOWN, "v1.2.0"),
    );
  });

  it("returns null when the version has no section yet", () => {
    expect(releaseNotes(MARKDOWN, "v9.9.9")).toBeNull();
    expect(releaseNotes("", "v1.2.0")).toBeNull();
  });

  it("returns null for a heading with nothing under it", () => {
    expect(releaseNotes("## 1.2.0\n\n## 1.1.0\n- x\n", "v1.2.0")).toBeNull();
  });

  /** Guards the file's shape as much as the parser's. */
  it("finds the current version in the real RELEASE.md", () => {
    const version = JSON.parse(fs.readFileSync("package.json", "utf8"))
      .version as string;

    const notes = releaseNotes(fs.readFileSync("RELEASE.md", "utf8"), version);
    expect(notes).not.toBeNull();
    expect(notes).toContain("-");
  });
});

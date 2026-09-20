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
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
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

  it("returns an empty string for a heading with nothing under it", () => {
    expect(releaseNotes("## 1.2.0\n\n## 1.1.0\n- x\n", "v1.2.0")).toBe("");
  });

  it.each(["1.2.0", "v1.2.0"])(
    "reads dated %s headings from the plugin",
    (version) => {
      const markdown = `## ${version} - 2026-09-20\n\n### Added\n\n- Added a CLI.\n\n### Fixed\n\n- Fixed lock expiry.\n\n## 1.1.0 - 2026-07-26\n\n- Earlier release.\n`;
      const notes = releaseNotes(markdown, "v1.2.0");
      expect(notes).toContain("- Added a CLI.");
      expect(notes).toContain("- Fixed lock expiry.");
      expect(notes).not.toMatch(/###|Earlier release/);
    },
  );

  it("does not mistake a prerelease or longer version for the requested release", () => {
    expect(
      releaseNotes(
        "## 1.2.0-pre - 2026-09-20\n- Preview.\n## 1.2.01\n- Other.\n",
        "1.2.0",
      ),
    ).toBeNull();
  });

  /**
   * Guards the file's shape as much as the parser's.
   *
   * Between releases package.json carries a prerelease - `1.4.0-pre` while
   * 1.4.0 is being written - and the section it has to find is the release it
   * is heading for, `## 1.4.0`. Naming the section after the prerelease
   * instead would hide it from the release, which is dispatched as a plain
   * `vX.Y.Z` and reads the heading to fill in its body.
   *
   * Stripping the suffix belongs here rather than in the parser for the same
   * reason: `check-release-version.mjs` refuses anything but `vX.Y.Z`, so
   * nothing in production can ever ask it for a prerelease's notes.
   */
  it("finds the current version in the real CHANGELOG.md", () => {
    const version = (
      JSON.parse(fs.readFileSync("package.json", "utf8")).version as string
    ).replace(/[-+].*$/, "");

    const notes = releaseNotes(
      fs.readFileSync("CHANGELOG.md", "utf8"),
      version,
    );
    expect(notes).not.toBeNull();
  });
});

describe("release-notes CLI", () => {
  const script = path.resolve("scripts/release-notes.mjs");
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "mutex-release-notes-"));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("reads CHANGELOG.md by default and prints the selected release", () => {
    fs.writeFileSync(
      path.join(directory, "CHANGELOG.md"),
      "## 1.2.0 - 2026-09-20\n\n### Fixed\n\n- Locks expire on time.\n",
    );
    const result = spawnSync(
      process.execPath,
      [script, "--version", "v1.2.0"],
      { cwd: directory, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("- Locks expire on time.\n");
    expect(result.stderr).toBe("");
  });

  it.each([null, "## 1.1.0\n- Earlier release.\n"])(
    "fails when the requested section is absent from %s",
    (markdown) => {
      if (markdown !== null)
        fs.writeFileSync(path.join(directory, "CHANGELOG.md"), markdown);
      const result = spawnSync(
        process.execPath,
        [script, "--version", "v1.2.0"],
        { cwd: directory, encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("No section for v1.2.0 in CHANGELOG.md.\n");
    },
  );

  it("uses the default text for an empty section in an explicit file", () => {
    fs.writeFileSync(
      path.join(directory, "notes.md"),
      "## 1.2.0 - 2026-09-20\n\n",
    );
    const result = spawnSync(
      process.execPath,
      [script, "--version", "v1.2.0", "--file", "notes.md"],
      { cwd: directory, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("No user-visible changes.\n");
    expect(result.stderr).toBe("");
  });
});

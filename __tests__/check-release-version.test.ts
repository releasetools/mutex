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

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error - build tooling, deliberately plain JS with no types
import {
  checkReleaseVersion,
  compareVersions,
  fetchTags,
  highestVersion,
} from "../scripts/check-release-version.mjs";

const RELEASED = ["v1.0.0", "v1.0.1", "v1.1.0", "v1"];

describe("compareVersions", () => {
  it("orders by number, not by string", () => {
    // The reason for not sorting these as text: "v1.10.0" < "v1.9.0"
    // lexicographically, which would let a release go backwards unnoticed.
    expect(compareVersions("v1.10.0", "v1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.22", "v1.3.0")).toBeLessThan(0);
    expect(compareVersions("v2.0.0", "v1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "v1.2.3")).toBe(0);
  });
});

describe("highestVersion", () => {
  it("ignores the floating major and anything else that is not a version", () => {
    expect(highestVersion(RELEASED)).toBe("v1.1.0");
    expect(highestVersion(["v1", "latest", "nightly"])).toBeNull();
    expect(highestVersion([])).toBeNull();
  });

  it("does not sort numerically-larger versions below smaller ones", () => {
    expect(highestVersion(["v1.9.0", "v1.10.0", "v1.2.0"])).toBe("v1.10.0");
  });
});

describe("fetchTags", () => {
  /** A page of results, in the shape fetch hands back. */
  const page = (names: string[]) => ({
    ok: true,
    status: 200,
    json: async () => names.map((name) => ({ name })),
  });

  const serving = (...pages: string[][]) => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return page(pages[calls.length - 1] ?? []);
    };
    return { calls, fetchImpl };
  };

  it("returns the tag names", async () => {
    const { fetchImpl } = serving(["v1.0.0", "v1.1.0", "v1"]);

    await expect(
      fetchTags({ repo: "releasetools/mutex", fetchImpl }),
    ).resolves.toEqual(["v1.0.0", "v1.1.0", "v1"]);
  });

  /**
   * The reason this moved out of the workflow: `gh api --paginate` handled
   * this, and hand-rolled paging is where it would quietly stop at 100 tags
   * and start reading a release as the highest one when it is not.
   */
  it("keeps paging while the pages come back full", async () => {
    const full = Array.from({ length: 100 }, (_, i) => `v1.0.${i}`);
    const { calls, fetchImpl } = serving(full, ["v2.0.0", "v2.1.0"]);

    const tags = await fetchTags({ repo: "releasetools/mutex", fetchImpl });

    expect(tags).toHaveLength(102);
    expect(tags.at(-1)).toBe("v2.1.0");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("page=2");
  });

  it("stops at the first short page, without asking for an empty one", async () => {
    const { calls, fetchImpl } = serving(["v1.0.0"]);

    await fetchTags({ repo: "releasetools/mutex", fetchImpl });
    expect(calls).toHaveLength(1);
  });

  /**
   * A failed read must not look like a repository with no tags: that would
   * make every version the first release and skip both checks.
   */
  it("throws rather than reporting no tags when the API fails", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    await expect(
      fetchTags({ repo: "releasetools/mutex", fetchImpl }),
    ).rejects.toThrow(/403 Forbidden/);
  });

  it("says what is missing when there is no repository", async () => {
    await expect(
      fetchTags({ fetchImpl: async () => page([]) }),
    ).rejects.toThrow(/GITHUB_REPOSITORY/);
  });

  it("authenticates when given a token, and does not when not", async () => {
    const seen: Array<Record<string, string>> = [];
    const fetchImpl = async (
      _url: string,
      init: { headers: Record<string, string> },
    ) => {
      seen.push(init.headers);
      return page([]);
    };

    await fetchTags({ repo: "a/b", token: "t0ken", fetchImpl });
    await fetchTags({ repo: "a/b", fetchImpl });

    expect(seen[0].authorization).toBe("Bearer t0ken");
    expect(seen[1]).not.toHaveProperty("authorization");
  });

  it("honours a GitHub Enterprise API URL", async () => {
    const { calls, fetchImpl } = serving([]);

    await fetchTags({
      repo: "a/b",
      apiUrl: "https://github.example.com/api/v3/",
      fetchImpl,
    });

    expect(calls[0]).toBe(
      "https://github.example.com/api/v3/repos/a/b/tags?per_page=100&page=1",
    );
  });

  it("gives up rather than paging forever", async () => {
    const full = Array.from({ length: 100 }, (_, i) => `v1.0.${i}`);
    const fetchImpl = async () => page(full);

    await expect(
      fetchTags({ repo: "a/b", fetchImpl, maxPages: 3 }),
    ).rejects.toThrow(/stopped after 3 pages/);
  });
});

describe("checkReleaseVersion", () => {
  it("accepts a version above everything released", () => {
    expect(
      checkReleaseVersion({ version: "v1.2.0", tags: RELEASED }),
    ).toMatchObject({ version: "v1.2.0", previous: "v1.1.0", major: "v1" });
  });

  it("accepts the first release, when nothing exists yet", () => {
    expect(checkReleaseVersion({ version: "v1.0.0", tags: [] })).toMatchObject({
      previous: null,
    });
  });

  it("rejects a malformed version", () => {
    for (const version of ["1.2.0", "v1.2", "v1.2.0-rc1", "", "latest"]) {
      expect(() => checkReleaseVersion({ version, tags: RELEASED })).toThrow(
        /must look like v1\.3\.0/,
      );
    }
  });

  it("rejects a version that has already been released", () => {
    expect(() =>
      checkReleaseVersion({ version: "v1.1.0", tags: RELEASED }),
    ).toThrow(/already been released/);
  });

  /** The case from the brief: v1.3.0 released, then somebody asks for v1.2.22. */
  it("rejects going backwards", () => {
    const tags = [...RELEASED, "v1.3.0"];
    expect(() => checkReleaseVersion({ version: "v1.2.22", tags })).toThrow(
      /lower than v1\.3\.0/,
    );
  });

  it("lets a deliberate lower version through", () => {
    const tags = [...RELEASED, "v1.3.0"];
    expect(
      checkReleaseVersion({
        version: "v1.2.22",
        tags,
        allowLowerVersion: true,
      }),
    ).toMatchObject({ version: "v1.2.22" });
  });

  it("still rejects a released version even when going lower is allowed", () => {
    // Replacing an existing release is a different decision from releasing
    // out of order, so one flag must not quietly grant the other.
    expect(() =>
      checkReleaseVersion({
        version: "v1.1.0",
        tags: RELEASED,
        allowLowerVersion: true,
      }),
    ).toThrow(/already been released/);
  });

  it("lets a deliberate replacement through", () => {
    expect(
      checkReleaseVersion({
        version: "v1.1.0",
        tags: RELEASED,
        overwriteExisting: true,
      }),
    ).toMatchObject({ version: "v1.1.0" });
  });

  it("does not compare a replacement against itself", () => {
    // v1.1.0 is the highest release; re-releasing it must not read as going
    // backwards from itself.
    expect(
      checkReleaseVersion({
        version: "v1.1.0",
        tags: RELEASED,
        overwriteExisting: true,
      }),
    ).toMatchObject({ previous: "v1.0.1" });
  });

  it("reports the major, which the release branch and floating tag need", () => {
    expect(
      checkReleaseVersion({ version: "v2.0.0", tags: RELEASED }).major,
    ).toBe("v2");
  });
});

/**
 * Run as the release runs it, because what reaches $GITHUB_OUTPUT is not
 * visible from the exported functions.
 */
describe("the script as the workflow runs it", () => {
  const run = (args: string[], env: Record<string, string> = {}) => {
    const outputFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "gho-")),
      "output",
    );
    fs.writeFileSync(outputFile, "");

    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "scripts", "check-release-version.mjs"),
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputFile,
          GITHUB_REPOSITORY: "",
          GITHUB_TOKEN: "",
          GH_TOKEN: "",
          ...env,
        },
      },
    );

    return { ...result, output: fs.readFileSync(outputFile, "utf8") };
  };

  /**
   * Tag names come off the network now, and a step output carrying a newline
   * would let whoever pushed that tag declare any other output it liked. So
   * only the major goes to $GITHUB_OUTPUT, and it comes from --version.
   * (CodeQL js/http-to-file-access, alert 13.)
   */
  it("writes only the major to $GITHUB_OUTPUT", () => {
    const { output } = run([
      "--version",
      "v1.3.0",
      "--tags",
      "v1.0.0 v1.1.0 v1",
    ]);

    expect(output).toBe("major=v1\n");
  });

  it("does not put anything it read into $GITHUB_OUTPUT", () => {
    const { output, stdout } = run([
      "--version",
      "v1.3.0",
      "--tags",
      "v1.0.0 v1.1.0 v1",
    ]);

    // The previous release is a log line, not an output.
    expect(stdout).toContain("previous release: v1.1.0");
    expect(output).not.toContain("v1.1.0");
  });

  it("fails, and writes no output, when the version is refused", () => {
    const { status, stderr, output } = run([
      "--version",
      "v1.0.0",
      "--tags",
      "v1.1.0",
    ]);

    expect(status).toBe(1);
    expect(stderr).toContain("::error::");
    expect(output).toBe("");
  });
});

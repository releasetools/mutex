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
import os from "node:os";
import path from "node:path";
// @ts-expect-error - build tooling, deliberately plain JS with no types
import { packageAction } from "../scripts/package-action.mjs";

/**
 * The published tree is a subset of the repository, so nothing that consumes
 * it is exercised by running the repository itself. These are the checks that
 * would have caught the two defects found by hand-assembling it: an action.yml
 * naming a file that was not shipped, and a tree with no package.json, which
 * made the action report its version as "unknown".
 */

const ACTION_YML = `name: "Test action"

runs:
  using: "node24"
  main: "dist/main/index.js"
  post: "dist/post/index.js"
`;

function repository(overrides: { actionYml?: string; omit?: string[] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pkg-")));
  const omit = new Set(overrides.omit ?? []);

  const write = (relative: string, contents: string) => {
    if (omit.has(relative)) {
      return;
    }
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };

  write("action.yml", overrides.actionYml ?? ACTION_YML);
  write("LICENSE", "Apache 2.0");
  write("README.md", "# test");
  write("dist/main/index.js", "// main");
  write("dist/main/package.json", '{"type":"module"}');
  write("dist/post/index.js", "// post");
  write("dist/post/package.json", '{"type":"module"}');
  write(
    "package.json",
    JSON.stringify({
      name: "mutex",
      version: "1.2.3",
      description: "a lock",
      license: "Apache-2.0",
      scripts: { build: "tsc" },
      devDependencies: { typescript: "^6" },
    }),
  );

  return root;
}

describe("packageAction", () => {
  const roots: string[] = [];

  const build = (overrides?: Parameters<typeof repository>[0]) => {
    const root = repository(overrides);
    roots.push(root);
    return root;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("publishes exactly what a consumer needs", () => {
    const root = build();
    const { files } = packageAction({ root, out: path.join(root, "out") });

    expect(files.sort()).toEqual(
      [
        "LICENSE",
        "README.md",
        "action.yml",
        "dist/main/index.js",
        "dist/main/package.json",
        "dist/post/index.js",
        "dist/post/package.json",
        "package.json",
      ].sort(),
    );
  });

  /**
   * The action walks up from its bundle to the nearest package.json with a
   * version. ncc's marker file has none, so without this one the published
   * action reports "unknown" - and the release asserts that against the tag.
   */
  it("gives the tree a package.json carrying the version", () => {
    const root = build();
    const { target } = packageAction({ root, out: path.join(root, "out") });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(target, "package.json"), "utf8"),
    );
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.name).toBe("mutex");
  });

  it("leaves the repository's own scripts and devDependencies out of it", () => {
    const root = build();
    const { target } = packageAction({ root, out: path.join(root, "out") });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(target, "package.json"), "utf8"),
    );
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
  });

  /**
   * A declared-but-missing `post:` is the expensive one: the action works
   * right up until a job ends, and then never releases its lock.
   */
  it("refuses to publish a tree missing an entrypoint action.yml names", () => {
    const root = build({ omit: ["dist/post/index.js"] });

    expect(() => packageAction({ root, out: path.join(root, "out") })).toThrow(
      /runs\.post .* not in the published tree/,
    );
  });

  it("reads every entrypoint, not just main", () => {
    const root = build({
      actionYml:
        'runs:\n  using: "node24"\n  pre: "dist/nope.js"\n  main: "dist/main/index.js"\n',
    });

    expect(() => packageAction({ root, out: path.join(root, "out") })).toThrow(
      /runs\.pre/,
    );
  });

  it("says to build when there is nothing to publish", () => {
    const root = build({ omit: ["dist/main/index.js"] });
    fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });

    expect(() => packageAction({ root, out: path.join(root, "out") })).toThrow(
      /run `npm run build` first/,
    );
  });

  it("refuses a repository with no version to publish", () => {
    const root = build();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "mutex" }),
    );

    expect(() => packageAction({ root, out: path.join(root, "out") })).toThrow(
      /no version/,
    );
  });

  it("replaces whatever was there before", () => {
    const root = build();
    const out = path.join(root, "out");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "stale.js"), "from an older run");

    const { files } = packageAction({ root, out });
    expect(files).not.toContain("stale.js");
  });
});

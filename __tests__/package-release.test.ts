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
import { packageRelease } from "../scripts/package-release.mjs";
// @ts-expect-error - build tooling, deliberately plain JS with no types
import * as installer from "../scripts/install-agent-skills.mjs";

const { installAgentSkills } = installer;

/**
 * The published tree is a subset of the repository, so neither the Action nor
 * a CLI installed from a tag is exercised by running the repository itself.
 * These checks cover both entrypoint sets and the shared runtime manifest.
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
  write("bin/mutex.js", '#!/usr/bin/env node\nimport "../lib/cli/main.js";\n');
  write("scripts/install-agent-skills.mjs", "// installer");
  write("commands/lock.md", "---\nname: lock\ndescription: Take a lock\n---\n");
  write("skills/mutex/SKILL.md", "---\nname: mutex\ndescription: locks\n---\n");
  write("skills/mutex/agent-lock.mjs", "// helper");
  write("dist/main/index.js", "// main");
  write("dist/main/package.json", '{"type":"module"}');
  write("dist/post/index.js", "// post");
  write("dist/post/package.json", '{"type":"module"}');
  write("lib/cli/main.js", "// cli");
  write(
    "package.json",
    JSON.stringify({
      name: "@releasetools/mutex",
      version: "1.2.3",
      description: "a lock",
      license: "Apache-2.0",
      repository: {
        type: "git",
        url: "git+https://github.com/releasetools/mutex.git",
      },
      homepage: "https://github.com/releasetools/mutex#readme",
      bugs: { url: "https://github.com/releasetools/mutex/issues" },
      type: "module",
      bin: { mutex: "./bin/mutex.js" },
      engines: { node: ">=24.0.0" },
      dependencies: {
        "@actions/core": "^3.0.0",
        pg: "^8.16.3",
        "pg-format": "^1.0.4",
      },
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
      scripts: { build: "tsc" },
      devDependencies: { typescript: "^6" },
    }),
  );

  return root;
}

describe("packageRelease", () => {
  const roots: string[] = [];

  const build = (overrides?: Parameters<typeof repository>[0]) => {
    const root = repository(overrides);
    roots.push(root);
    return root;
  };
  const elsewhere = () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "elsewhere-")),
    );
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
    const { files } = packageRelease({ root, out: path.join(root, "out") });

    expect(files.sort()).toEqual(
      [
        "LICENSE",
        "README.md",
        "action.yml",
        "bin/mutex.js",
        "commands/lock.md",
        "dist/main/index.js",
        "dist/main/package.json",
        "dist/post/index.js",
        "dist/post/package.json",
        "lib/cli/main.js",
        "package.json",
        "scripts/install-agent-skills.mjs",
        "skills/mutex/SKILL.md",
        "skills/mutex/agent-lock.mjs",
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
    const { target } = packageRelease({ root, out: path.join(root, "out") });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(target, "package.json"), "utf8"),
    );
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.name).toBe("@releasetools/mutex");
    expect(manifest.description).toBe("a lock");
    expect(manifest.bin).toEqual({ mutex: "./bin/mutex.js" });
    expect(manifest.engines).toEqual({ node: ">=24.0.0" });
    expect(manifest.dependencies).toEqual({
      pg: "^8.16.3",
      "pg-format": "^1.0.4",
    });
    expect(manifest.repository.url).toBe(
      "git+https://github.com/releasetools/mutex.git",
    );
    expect(manifest.publishConfig).toEqual({
      access: "public",
      registry: "https://registry.npmjs.org/",
    });
  });

  it("leaves the repository's own scripts and devDependencies out of it", () => {
    const root = build();
    const { target } = packageRelease({ root, out: path.join(root, "out") });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(target, "package.json"), "utf8"),
    );
    expect(manifest.private).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
  });

  /**
   * The skill ships with the CLI because copying it out of a global install is
   * how Hermes, Gemini and Antigravity get it - there is no checkout to copy
   * from. That only works while the installer and the skill keep the same
   * relative positions in the published tree that they have here.
   */
  it("publishes the skill, and an installer that can still find it", () => {
    const root = build();
    const { target } = packageRelease({ root, out: path.join(root, "out") });
    const home = fs.mkdtempSync(path.join(root, "home-"));
    fs.mkdirSync(path.join(home, ".hermes"));
    fs.mkdirSync(path.join(home, ".gemini"));

    const { results } = installAgentSkills({ root: target, home });

    expect(results[0]).toEqual(
      expect.objectContaining({ agent: "hermes", status: "written" }),
    );
    expect(
      fs.existsSync(path.join(home, ".hermes/skills/devops/mutex/SKILL.md")),
    ).toBe(true);
    // The commands are rendered out of `commands/`, so that has to be in the
    // published tree as well - without it Gemini would install a skill and an
    // empty slash menu, and say nothing about it.
    expect(
      fs.existsSync(path.join(home, ".gemini/commands/mutex/lock.toml")),
    ).toBe(true);
  });

  it("refuses a checkout with no skill, without blaming the build", () => {
    const root = build({
      omit: ["skills/mutex/SKILL.md", "skills/mutex/agent-lock.mjs"],
    });

    expect(() => packageRelease({ root, out: path.join(root, "out") })).toThrow(
      "missing skills/ - cannot publish without it",
    );
  });

  /**
   * A declared-but-missing `post:` is the expensive one: the action works
   * right up until a job ends, and then never releases its lock.
   */
  it("refuses to publish a tree missing an entrypoint action.yml names", () => {
    const root = build({ omit: ["dist/post/index.js"] });

    expect(() => packageRelease({ root, out: path.join(root, "out") })).toThrow(
      /runs\.post .* not in the published tree/,
    );
  });

  it("reads every entrypoint, not just main", () => {
    const root = build({
      actionYml:
        'runs:\n  using: "node24"\n  pre: "dist/nope.js"\n  main: "dist/main/index.js"\n',
    });

    expect(() => packageRelease({ root, out: path.join(root, "out") })).toThrow(
      /runs\.pre/,
    );
  });

  it("says to build when there is nothing to publish", () => {
    const root = build({ omit: ["dist/main/index.js"] });
    fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });

    expect(() => packageRelease({ root, out: path.join(root, "out") })).toThrow(
      /run `npm run build` first/,
    );
  });

  it("refuses a repository with no version to publish", () => {
    const root = build();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "mutex" }),
    );

    expect(() => packageRelease({ root, out: path.join(root, "out") })).toThrow(
      /no version/,
    );
  });

  it("replaces whatever was there before", () => {
    const root = build();
    const out = path.join(root, "out");
    packageRelease({ root, out });
    fs.writeFileSync(path.join(out, "stale.js"), "from an older run");

    const { files } = packageRelease({ root, out });
    expect(files).not.toContain("stale.js");
  });

  /**
   * The published tree is a copy list, and a name on that list is trusted to be
   * the file it looks like. `existsSync` answers about where a link points, and
   * `cp -r` follows it, so an allowlisted name could stand in for a tree nobody
   * meant to publish.
   */
  describe("the copy list is names, not links", () => {
    it("refuses a file that is a link somewhere else", () => {
      const root = build();
      const secrets = path.join(elsewhere(), "secrets");
      fs.writeFileSync(secrets, "not ours\n");
      fs.rmSync(path.join(root, "README.md"));
      fs.symlinkSync(secrets, path.join(root, "README.md"));

      expect(() =>
        packageRelease({ root, out: path.join(root, "out") }),
      ).toThrow(/missing README\.md/);
    });

    it("refuses a directory that is a link somewhere else", () => {
      const root = build();
      const other = elsewhere();
      fs.writeFileSync(path.join(other, "not-a-skill.md"), "not ours\n");
      fs.rmSync(path.join(root, "skills"), { recursive: true });
      fs.symlinkSync(other, path.join(root, "skills"));

      expect(() =>
        packageRelease({ root, out: path.join(root, "out") }),
      ).toThrow(/skills is not a regular directory/);
    });
  });

  /**
   * `--out` is emptied before anything is written to it, so a mistyped one is
   * the most expensive argument this command takes.
   */
  describe("refusing to empty the wrong directory", () => {
    it("refuses a directory that contains the checkout", () => {
      const root = build();
      for (const out of [root, path.dirname(root), path.parse(root).root]) {
        expect(() => packageRelease({ root, out })).toThrow(
          /contains the checkout/,
        );
      }
    });

    it("refuses your home directory", () => {
      expect(() =>
        packageRelease({ root: build(), out: os.homedir() }),
      ).toThrow(/home directory/);
    });

    it("refuses a directory holding something it did not put there", () => {
      const root = build();
      const out = path.join(root, "out");
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, "notes.md"), "not a release tree\n");

      expect(() => packageRelease({ root, out })).toThrow(
        /refusing to empty it/,
      );
      expect(fs.existsSync(path.join(out, "notes.md"))).toBe(true);
    });

    /**
     * The marker says "this is my own previous output, empty it". Asking
     * `existsSync` about it would let a link at that path answer for whatever
     * it points at, which is the safeguard talked out of refusing.
     */
    it("is not talked round by a marker that is a link", () => {
      const root = build();
      const out = path.join(root, "out");
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, "notes.md"), "not a release tree\n");
      fs.symlinkSync(
        path.join(root, "action.yml"),
        path.join(out, "action.yml"),
      );

      expect(() => packageRelease({ root, out })).toThrow(
        /refusing to empty it/,
      );
      expect(fs.existsSync(path.join(out, "notes.md"))).toBe(true);
    });
  });
});

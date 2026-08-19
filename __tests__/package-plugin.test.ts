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
import { fileURLToPath } from "node:url";
// @ts-expect-error - packaging tooling, deliberately plain JS with no types
import { packagePlugin } from "../scripts/package-plugin.mjs";

/**
 * The plugin published to releasetools/agent-plugins is a copy of this
 * directory, not a pointer at it, so this list is what people install. The
 * repository around it holds tests, a build tree, benchmark runners that take
 * a connection string, and every development dependency - and none of that
 * should be able to arrive in somebody's agent by being added to a directory
 * the packaging happens to copy.
 */

const REPOSITORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const MANIFEST = {
  name: "mutex",
  version: "0.1.0",
  description: "Guard a shared resource with a distributed lock",
};

const temporary = (prefix: string) =>
  fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

/** A checkout with the plugin's files in it, and some that are not the plugin. */
function repository(
  overrides: { omit?: string[]; extra?: Record<string, string> } = {},
) {
  const root = temporary("pkg-plugin-");
  const omit = new Set(overrides.omit ?? []);
  const write = (relative: string, contents: string) => {
    if (omit.has(relative)) {
      return;
    }
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };

  write(".claude-plugin/plugin.json", JSON.stringify(MANIFEST));
  write(
    ".codex-plugin/plugin.json",
    JSON.stringify({
      ...MANIFEST,
      skills: "./skills/",
      commands: "./commands/",
      interface: {
        displayName: "mutex",
        shortDescription: "Distributed locks",
        longDescription: "Distributed locks for guarded operations",
        category: "Developer Tools",
      },
    }),
  );
  write("LICENSE", "Apache-2.0\n");
  write("PLUGIN.md", "# mutex, as an agent plugin\n");
  write("README.md", "# mutex\n\nForty pages about an Action and a CLI.\n");
  write(
    "skills/mutex/SKILL.md",
    "---\nname: mutex\ndescription: Takes locks\n---\n",
  );
  write("skills/mutex/agent-lock.mjs", "// helper\n");
  write(
    "commands/lock.md",
    "---\nname: lock\ndescription: Take a lock\nallowed-tools: Bash\n---\n" +
      'Run `node "${CLAUDE_PLUGIN_ROOT}/skills/mutex/agent-lock.mjs" lock`.\n',
  );
  write(
    "commands/help.md",
    "---\nname: help\ndescription: What this does\n---\n\n- /mutex:lock - take a lock\n",
  );
  write("hooks/hooks.json", JSON.stringify({ hooks: {} }));

  // The parts of the repository that are emphatically not the plugin.
  write("package.json", JSON.stringify({ name: "@releasetools/mutex" }));
  write("src/database.ts", "// the lock store\n");
  write("__tests__/mutex.test.ts", "// tests\n");
  write(
    "benchmarks/profiles.local.json",
    '{"url":"postgres://user:pw@host/db"}',
  );

  for (const [relative, contents] of Object.entries(overrides.extra ?? {})) {
    write(relative, contents);
  }
  return root;
}

describe("packagePlugin", () => {
  const roots: string[] = [];

  const build = (overrides?: Parameters<typeof repository>[0]) => {
    const root = repository(overrides);
    roots.push(root);
    return root;
  };
  const into = () => {
    const out = temporary("plugin-out-");
    roots.push(out);
    return out;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("copies the plugin and nothing else in the repository", () => {
    const { files } = packagePlugin({ root: build(), out: into() });

    expect(files).toEqual([
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      "LICENSE",
      "README.md",
      "commands/help.md",
      "commands/lock.md",
      "hooks/hooks.json",
      "skills/mutex/SKILL.md",
      "skills/mutex/agent-lock.mjs",
    ]);
  });

  /**
   * An agent host shows the plugin's README next to an install button. The
   * repository's is forty pages about an Action, a CLI and a pooled server.
   */
  it("publishes the plugin's README, not the repository's", () => {
    const out = into();
    packagePlugin({ root: build(), out });

    expect(fs.readFileSync(path.join(out, "README.md"), "utf8")).toBe(
      "# mutex, as an agent plugin\n",
    );
  });

  it("empties an output directory left over from last time", () => {
    const out = into();
    fs.writeFileSync(
      path.join(out, "withdrawn.md"),
      "from a previous version\n",
    );

    packagePlugin({ root: build(), out });

    expect(fs.existsSync(path.join(out, "withdrawn.md"))).toBe(false);
  });

  it.each([
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    "LICENSE",
    "PLUGIN.md",
  ])("refuses to publish without %s", (missing) => {
    expect(() =>
      packagePlugin({ root: build({ omit: [missing] }), out: into() }),
    ).toThrow(`missing ${missing}`);
  });

  it("refuses a symlink rather than publishing one", () => {
    const root = build();
    fs.symlinkSync("/etc/passwd", path.join(root, "skills/mutex/leak.md"));

    expect(() => packagePlugin({ root, out: into() })).toThrow(
      /not a regular file/,
    );
  });

  /**
   * The copy list and what the plugin declares are two different places, and
   * this is what happens when they disagree: everything installs, and the
   * command fails at the moment it runs.
   */
  it("refuses a plugin whose helper did not make it into the tree", () => {
    const root = build({
      extra: {
        "commands/lock.md":
          "---\nname: lock\ndescription: Take a lock\nallowed-tools: Bash\n---\n" +
          'Run `node "${CLAUDE_PLUGIN_ROOT}/tools/agent-lock.mjs" lock`.\n',
      },
    });
    fs.mkdirSync(path.join(root, "tools"));
    fs.writeFileSync(path.join(root, "tools/agent-lock.mjs"), "// helper\n");

    expect(() => packagePlugin({ root, out: into() })).toThrow(
      /does not validate[\s\S]*references a missing file: tools\/agent-lock\.mjs/,
    );
  });

  it("refuses to assemble the plugin over the checkout", () => {
    const root = build();
    expect(() => packagePlugin({ root, out: root })).toThrow(
      /directory of its own/,
    );
  });

  it("packages this repository into something that validates", () => {
    const out = into();
    const { name, version } = packagePlugin({ root: REPOSITORY, out });

    expect(name).toBe("mutex");
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(fs.existsSync(path.join(out, "skills/mutex/agent-lock.mjs"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(out, "package.json"))).toBe(false);
    expect(fs.existsSync(path.join(out, "src"))).toBe(false);
  });
});

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
import * as packaging from "../scripts/validate-agent-plugins.mjs";
// @ts-expect-error - packaging tooling, deliberately plain JS with no types
import * as installer from "../scripts/install-agent-skills.mjs";

const { parseStrictJson, validateAgentPlugins } = packaging;
const { DEFAULT_TARGETS, installAgentSkills } = installer;

/**
 * The plugin is a directory four different agents read, and none of them says
 * anything when the packaging is wrong: a skill they cannot find is
 * indistinguishable from a skill the model chose not to use. These are the
 * mistakes that would otherwise be discovered by somebody asking for a lock
 * and getting a conversation instead.
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

function plugin(overrides: Record<string, unknown> = {}) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "plugin-")),
  );
  const write = (relative: string, contents: string) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), contents);
  };

  const claude = { ...MANIFEST, ...((overrides.claude as object) ?? {}) };
  const codex = {
    ...MANIFEST,
    skills: "./skills/",
    ...((overrides.codex as object) ?? {}),
  };

  write(".claude-plugin/plugin.json", JSON.stringify(claude));
  write(".codex-plugin/plugin.json", JSON.stringify(codex));
  write(
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      name: "releasetools-mutex",
      owner: { name: "releasetools" },
      plugins: [
        {
          name: "mutex",
          source: "./",
          ...((overrides.entry as object) ?? {}),
        },
      ],
    }),
  );
  write(
    `skills/${overrides.skillDirectory ?? "mutex"}/SKILL.md`,
    `---\nname: ${overrides.skillName ?? "mutex"}\ndescription: Takes locks\n---\n\n# mutex\n`,
  );
  write("skills/mutex/agent-lock.mjs", "// helper\n");
  write(
    "hooks/hooks.json",
    JSON.stringify({
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command: `node "\${CLAUDE_PLUGIN_ROOT}/${overrides.hookTarget ?? "skills/mutex/agent-lock.mjs"}" nudge`,
              },
            ],
          },
        ],
      },
    }),
  );

  return root;
}

describe("the repository's own packaging", () => {
  it("passes validation", () => {
    expect(validateAgentPlugins({ root: REPOSITORY }).errors).toEqual([]);
  });

  it("ships one canonical skills directory, not a copy per product", () => {
    expect(fs.lstatSync(path.join(REPOSITORY, "skills")).isSymbolicLink()).toBe(
      false,
    );
    for (const product of [".claude-plugin", ".codex-plugin"]) {
      expect(fs.existsSync(path.join(REPOSITORY, product, "skills"))).toBe(
        false,
      );
    }
  });

  it("keeps the two manifests on the same version", () => {
    const read = (relative: string) =>
      JSON.parse(fs.readFileSync(path.join(REPOSITORY, relative), "utf8"));
    expect(read(".codex-plugin/plugin.json").version).toBe(
      read(".claude-plugin/plugin.json").version,
    );
  });
});

describe("validateAgentPlugins", () => {
  const roots: string[] = [];

  const build = (overrides?: Record<string, unknown>) => {
    const root = plugin(overrides);
    roots.push(root);
    return root;
  };

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a well-formed plugin", () => {
    expect(validateAgentPlugins({ root: build() }).errors).toEqual([]);
  });

  it("catches manifests that have drifted apart", () => {
    const root = build({ codex: { version: "0.2.0" } });
    expect(validateAgentPlugins({ root }).errors).toEqual([
      expect.stringContaining("manifest versions differ"),
    ]);
  });

  it("catches a version that does not match the release being cut", () => {
    const root = build();
    expect(
      validateAgentPlugins({ root, expected: "9.9.9" }).errors,
    ).toHaveLength(2);
  });

  it("catches Codex being pointed somewhere other than skills/", () => {
    const root = build({ codex: { skills: "./.codex-plugin/skills/" } });
    expect(validateAgentPlugins({ root }).errors).toEqual([
      expect.stringContaining('"skills": "./skills/"'),
    ]);
  });

  it("catches a skill whose front matter disagrees with its directory", () => {
    const root = build({ skillName: "locks" });
    expect(validateAgentPlugins({ root }).errors).toEqual([
      expect.stringContaining("is named 'locks'"),
    ]);
  });

  it("catches a hook pointing at a script that moved", () => {
    const root = build({ hookTarget: "skills/mutex/moved.mjs" });
    expect(validateAgentPlugins({ root }).errors).toEqual([
      expect.stringContaining("references a missing file"),
    ]);
  });

  it("catches a second copy of a skill under a product directory", () => {
    const root = build();
    fs.mkdirSync(path.join(root, ".codex-plugin", "skills", "mutex"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, ".codex-plugin", "skills", "mutex", "SKILL.md"),
      "---\nname: mutex\ndescription: a divergent copy\n---\n",
    );
    expect(validateAgentPlugins({ root }).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(".codex-plugin/skills must not exist"),
        expect.stringContaining("duplicates a skill"),
      ]),
    );
  });

  it("keeps the catalog from pinning a version the manifest owns", () => {
    const root = build({ entry: { version: "0.0.9" } });
    expect(validateAgentPlugins({ root }).errors).toEqual([
      expect.stringContaining("must not pin a plugin version"),
    ]);
  });
});

describe("parseStrictJson", () => {
  it("refuses a repeated key, which JSON.parse resolves silently", () => {
    expect(() =>
      parseStrictJson('{"version":"0.1.0","version":"0.2.0"}'),
    ).toThrow(/duplicate key 'version'/);
  });

  it("allows the same key in different objects", () => {
    expect(parseStrictJson('{"a":{"name":1},"name":2}')).toEqual({
      a: { name: 1 },
      name: 2,
    });
  });

  it("is not fooled by braces and quotes inside strings", () => {
    expect(parseStrictJson('{"a":"{\\"name\\":1}","name":2}')).toEqual({
      a: '{"name":1}',
      name: 2,
    });
  });
});

describe("installAgentSkills", () => {
  const homes: string[] = [];

  const home = (agents: string[]) => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "home-")),
    );
    for (const agent of agents) {
      fs.mkdirSync(path.join(root, agent), { recursive: true });
    }
    homes.push(root);
    return root;
  };

  afterEach(() => {
    for (const root of homes.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("leaves Claude and Codex to their manifests unless asked", () => {
    expect(DEFAULT_TARGETS).toEqual(["hermes", "gemini"]);
  });

  it("copies the skill into each agent that is installed", () => {
    const root = home([".hermes", ".gemini"]);
    const { results } = installAgentSkills({ root: REPOSITORY, home: root });

    expect(results.map((result: { status: string }) => result.status)).toEqual([
      "written",
      "written",
    ]);
    expect(
      fs.existsSync(path.join(root, ".hermes/skills/devops/mutex/SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".gemini/skills/mutex/SKILL.md")),
    ).toBe(true);
  });

  it("does not create a home for an agent that is not installed", () => {
    const root = home([".hermes"]);
    const { results } = installAgentSkills({ root: REPOSITORY, home: root });

    expect(
      results.find((result: { agent: string }) => result.agent === "gemini")
        .status,
    ).toBe("absent");
    expect(fs.existsSync(path.join(root, ".gemini"))).toBe(false);
  });

  it("writes nothing the second time, and reports staleness for CI", () => {
    const root = home([".hermes", ".gemini"]);
    installAgentSkills({ root: REPOSITORY, home: root });
    expect(
      installAgentSkills({ root: REPOSITORY, home: root, check: true }).results,
    ).toEqual([
      expect.objectContaining({ status: "current" }),
      expect.objectContaining({ status: "current" }),
    ]);

    fs.writeFileSync(
      path.join(root, ".hermes/skills/devops/mutex/SKILL.md"),
      "an older release",
    );
    const { results } = installAgentSkills({
      root: REPOSITORY,
      home: root,
      check: true,
    });
    expect(results[0].status).toBe("stale");
    expect(
      fs.readFileSync(
        path.join(root, ".hermes/skills/devops/mutex/SKILL.md"),
        "utf8",
      ),
    ).toBe("an older release");
  });

  it("refuses an agent it does not know how to install for", () => {
    expect(() =>
      installAgentSkills({
        root: REPOSITORY,
        home: home([]),
        targets: ["emacs"],
      }),
    ).toThrow(/unknown agent/);
  });
});

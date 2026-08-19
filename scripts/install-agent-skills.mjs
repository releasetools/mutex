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
import { parseArgs } from "node:util";

/**
 * Puts the skill where each agent looks for it.
 *
 * Claude Code and Codex read `skills/` through the manifests in
 * `.claude-plugin/` and `.codex-plugin/`, so they install the plugin rather
 * than a copy and are not touched unless asked for by name. The rest have no
 * manifest to read: they discover skills by walking a directory under their own
 * home, so the directory has to be there.
 *
 * Copies rather than symlinks. A symlink into a git worktree turns "I deleted
 * that branch" into "my agent lost a skill", and these directories outlive the
 * checkouts they came from.
 */

export const TARGETS = [
  {
    agent: "hermes",
    home: ".hermes",
    // Hermes groups skills by category; mutex belongs with the devops ones.
    skills: path.join("skills", "devops"),
  },
  {
    agent: "gemini",
    home: ".gemini",
    skills: "skills",
    note: "Antigravity reads the same directory",
  },
  {
    agent: "claude",
    home: ".claude",
    skills: "skills",
    manifest:
      "install the plugin instead: /plugin marketplace add releasetools/mutex",
  },
  {
    agent: "codex",
    home: ".codex",
    skills: "skills",
    manifest: "install the plugin instead: codex plugin add mutex",
  },
];

/** The ones installed unless the caller names others. */
export const DEFAULT_TARGETS = TARGETS.filter((target) => !target.manifest).map(
  (target) => target.agent,
);

function filesUnder(root, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesUnder(root, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

function sameContent(source, destination) {
  try {
    return fs.readFileSync(source).equals(fs.readFileSync(destination));
  } catch {
    return false;
  }
}

/**
 * The checkout this script ships in.
 *
 * Not the working directory: the useful way to run this is straight out of a
 * global install - `node "$(npm root -g)/@releasetools/mutex/scripts/install-agent-skills.mjs"` -
 * from wherever the user happens to be standing.
 */
export const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function installAgentSkills(options = {}) {
  const root = options.root ?? PACKAGE_ROOT;
  const home = options.home ?? os.homedir();
  const skill = options.skill ?? "mutex";
  const source = path.join(root, "skills", skill);
  const requested = options.targets?.length ? options.targets : DEFAULT_TARGETS;
  const write = !options.check && !options.dryRun;

  const unknown = requested.filter(
    (name) => !TARGETS.some((target) => target.agent === name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `unknown agent(s): ${unknown.join(", ")}. Known: ${TARGETS.map(({ agent }) => agent).join(", ")}`,
    );
  }
  if (!fs.existsSync(source)) {
    throw new Error(`no skill to install at ${source}`);
  }

  const contents = filesUnder(source);
  const results = [];

  for (const target of TARGETS.filter((candidate) =>
    requested.includes(candidate.agent),
  )) {
    const agentHome = path.join(home, target.home);
    const destination = path.join(agentHome, target.skills, skill);

    if (!fs.existsSync(agentHome)) {
      // Not installed here. Creating the directory would leave a skill for an
      // agent that will never read it, in a home that agent did not create.
      results.push({
        agent: target.agent,
        path: destination,
        status: "absent",
      });
      continue;
    }

    const changed = contents.filter(
      (relative) =>
        !sameContent(
          path.join(source, relative),
          path.join(destination, relative),
        ),
    );
    const status = !fs.existsSync(destination)
      ? "missing"
      : changed.length > 0
        ? "stale"
        : "current";

    if (write && changed.length > 0) {
      for (const relative of changed) {
        const file = path.join(destination, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.copyFileSync(path.join(source, relative), file);
      }
    }

    // Files the destination has and the source does not: an older layout left
    // behind. Reported rather than deleted, since this writes into directories
    // it does not own.
    const extra = fs.existsSync(destination)
      ? filesUnder(destination).filter(
          (relative) => !contents.includes(relative),
        )
      : [];

    results.push({
      agent: target.agent,
      path: destination,
      status: write && changed.length > 0 ? "written" : status,
      changed,
      extra,
      note: target.note,
    });
  }

  return { source, skill, results };
}

// Run directly, rather than imported by a test.
if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  const { values } = parseArgs({
    options: {
      target: { type: "string", multiple: true, short: "t" },
      skill: { type: "string" },
      check: { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    process.stdout.write(
      `install-agent-skills - copy skills/<name> into each agent's skills directory\n\n` +
        `Usage: node scripts/install-agent-skills.mjs [options]\n\n` +
        `Options:\n` +
        `  -t, --target <agent>  Repeatable. ${TARGETS.map(({ agent }) => agent).join(", ")}\n` +
        `                        (default: ${DEFAULT_TARGETS.join(", ")})\n` +
        `      --skill <name>    Which skill to install (default: mutex)\n` +
        `      --check           Report what is missing or stale, and change nothing\n` +
        `      --dry-run         Report what would be written, and change nothing\n` +
        `  -h, --help            Show this\n\n` +
        `Claude Code and Codex read skills/ through their own manifests, so they are\n` +
        `only touched when named with --target.\n`,
    );
    process.exit(0);
  }

  try {
    const targets = (values.target ?? []).flatMap((value) =>
      value
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
    const { source, results } = installAgentSkills({
      targets,
      skill: values.skill,
      check: values.check,
      dryRun: values["dry-run"],
    });

    process.stdout.write(`Source: ${source}\n`);
    for (const result of results) {
      const detail =
        result.status === "absent"
          ? "agent not installed here"
          : result.status === "current"
            ? "up to date"
            : `${result.changed.length} file(s)`;
      process.stdout.write(
        `  ${result.agent.padEnd(7)} ${result.status.padEnd(8)} ${result.path}  (${detail})\n`,
      );
      for (const extra of result.extra ?? []) {
        process.stdout.write(`      leftover, not removed: ${extra}\n`);
      }
      if (result.note) {
        process.stdout.write(`      ${result.note}\n`);
      }
    }

    if (
      values.check &&
      results.some(
        (result) => result.status === "missing" || result.status === "stale",
      )
    ) {
      process.exit(1);
    }
  } catch (error) {
    process.stderr.write(`install-agent-skills: ${error.message}\n`);
    process.exit(1);
  }
}

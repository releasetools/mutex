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
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * Checks the packaging that four different agents read from one directory.
 *
 * `skills/` is the plugin: Claude Code and Codex each find it through their own
 * manifest, and Hermes, Gemini and Antigravity get a copy of the same directory.
 * Nothing here is exercised by `npm test` running the repository, and none of
 * these tools complains loudly when packaging is wrong - a plugin with a
 * mistyped skill path simply never offers the skill, which looks exactly like
 * the model deciding not to use it.
 *
 * So the failures worth catching are the silent ones:
 *
 * - a skill directory renamed on one side of a manifest;
 * - a hook pointing at a script that moved, which fires and does nothing;
 * - the two manifests drifting to different versions, so what a Codex user
 *   installs is not what a Claude user installs;
 * - a copy of a skill inside a product directory, which is how two agents start
 *   reading different instructions from the same repository.
 */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PLUGIN_NAME = "mutex";
const CLAUDE_MANIFEST = ".claude-plugin/plugin.json";
const CODEX_MANIFEST = ".codex-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";
const HOOKS = "hooks/hooks.json";

/**
 * Parses JSON, and refuses a repeated key.
 *
 * `JSON.parse` resolves duplicates last-wins without a word, which in a
 * manifest means an edited version number that quietly does not take effect.
 * Node has no `object_pairs_hook`, so the keys are counted by scanning: string
 * literals are skipped whole, and a string only counts as a key when the
 * enclosing context is an object.
 */
export function parseStrictJson(text) {
  const value = JSON.parse(text);
  const stack = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (character === '"') {
      const start = index++;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === '"') {
          break;
        }
        index++;
      }
      const literal = text.slice(start, ++index);

      let after = index;
      while (after < text.length && /\s/.test(text[after])) {
        after++;
      }
      const context = stack[stack.length - 1];
      if (text[after] === ":" && context?.keys) {
        const key = JSON.parse(literal);
        if (context.keys.has(key)) {
          throw new Error(`duplicate key '${key}'`);
        }
        context.keys.add(key);
      }
      continue;
    }

    if (character === "{") {
      stack.push({ keys: new Set() });
    } else if (character === "[") {
      stack.push({});
    } else if (character === "}" || character === "]") {
      stack.pop();
    }
    index++;
  }

  return value;
}

/** The checkout this script ships in, so it validates the right tree. */
export const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function validateAgentPlugins({ root = PACKAGE_ROOT, expected } = {}) {
  const errors = [];
  const versions = {};

  const load = (relative) => {
    let text;
    try {
      text = fs.readFileSync(path.join(root, relative), "utf8");
    } catch (error) {
      errors.push(`cannot read ${relative}: ${error.message}`);
      return null;
    }
    try {
      return parseStrictJson(text);
    } catch (error) {
      errors.push(`invalid JSON in ${relative}: ${error.message}`);
      return null;
    }
  };

  const manifest = (label, relative) => {
    const value = load(relative);
    if (!value) {
      return null;
    }
    if (value.name !== PLUGIN_NAME) {
      errors.push(`${relative} name must be '${PLUGIN_NAME}'`);
    }
    if (typeof value.version !== "string" || !SEMVER.test(value.version)) {
      errors.push(`${relative} version must be strict X.Y.Z semver`);
    } else {
      versions[label] = value.version;
      if (expected && value.version !== expected) {
        errors.push(
          `${relative} version ${value.version} does not match the expected ${expected}`,
        );
      }
    }
    return value;
  };

  const claude = manifest("claude", CLAUDE_MANIFEST);
  const codex = manifest("codex", CODEX_MANIFEST);
  if (versions.claude && versions.codex && versions.claude !== versions.codex) {
    errors.push(
      `manifest versions differ: ${CLAUDE_MANIFEST} is ${versions.claude}, ` +
        `${CODEX_MANIFEST} is ${versions.codex}`,
    );
  }
  if (claude && codex && claude.description !== codex.description) {
    errors.push("the two manifests describe the plugin differently");
  }

  // The one line that makes Codex read the shared directory rather than
  // looking for skills of its own.
  if (codex && codex.skills !== "./skills/") {
    errors.push(`${CODEX_MANIFEST} must set "skills": "./skills/"`);
  }

  validateSkills(root, errors);
  validateCommands(root, codex, errors);
  validateNoProductCopies(root, errors);
  validateMarketplace(root, load(MARKETPLACE), errors);
  validateHooks(root, errors);

  return { version: versions.codex ?? versions.claude ?? null, errors };
}

/**
 * Every skill is a directory with a SKILL.md whose front matter names it.
 *
 * The name in the front matter is what an agent matches a request against, so
 * one that disagrees with its directory is a skill that loads and never fires.
 */
function validateSkills(root, errors) {
  const skills = path.join(root, "skills");
  let entries;
  try {
    if (fs.lstatSync(skills).isSymbolicLink()) {
      errors.push("skills/ must be a real directory, not a symlink");
      return;
    }
    entries = fs.readdirSync(skills, { withFileTypes: true });
  } catch {
    errors.push("skills/ is missing");
    return;
  }

  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length === 0) {
    errors.push("skills/ contains no skills");
  }

  for (const directory of directories) {
    const file = path.join(skills, directory.name, "SKILL.md");
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      errors.push(`skills/${directory.name} has no SKILL.md`);
      continue;
    }

    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!front) {
      errors.push(`skills/${directory.name}/SKILL.md has no front matter`);
      continue;
    }
    const name = /^name:\s*(.+)$/m.exec(front[1])?.[1]?.trim();
    if (name !== directory.name) {
      errors.push(
        `skills/${directory.name}/SKILL.md is named '${name ?? "(none)"}'`,
      );
    }
    if (!/^description:/m.test(front[1])) {
      errors.push(`skills/${directory.name}/SKILL.md has no description`);
    }
  }
}

/**
 * The commands that show up in an agent's slash menu.
 *
 * Claude Code and Codex both read `commands/` from the plugin root - Codex
 * falls back to it when the manifest names no path, and the manifest names it
 * anyway so the intent is on the page rather than in another tool's default.
 *
 * `help.md` lists them for the user, which is the one piece of this that can
 * quietly go stale: adding a command is easy, and remembering that a second
 * file describes it is not. A help text that omits a command is worse than no
 * help text, because it reads as a complete list.
 */
function validateCommands(root, codex, errors) {
  const directory = path.join(root, "commands");
  if (!fs.existsSync(directory)) {
    return;
  }

  if (codex && codex.commands !== "./commands/") {
    errors.push(`${CODEX_MANIFEST} must set "commands": "./commands/"`);
  }

  const names = [];
  for (const entry of fs.readdirSync(directory).sort()) {
    if (!entry.endsWith(".md")) {
      errors.push(`commands/${entry} is not a command file`);
      continue;
    }

    const name = path.basename(entry, ".md");
    names.push(name);
    const text = fs.readFileSync(path.join(directory, entry), "utf8");
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!front) {
      // Codex requires front matter outright; Claude Code shows a command with
      // no description as a blank row in the menu.
      errors.push(`commands/${entry} has no front matter`);
      continue;
    }
    const declared = /^name:\s*(.+)$/m.exec(front[1])?.[1]?.trim();
    if (declared && declared !== name) {
      errors.push(`commands/${entry} is named '${declared}'`);
    }
    if (!/^description:\s*\S/m.test(front[1])) {
      errors.push(`commands/${entry} has no description`);
    }
    // A command that runs the helper without saying so asks the user for
    // permission every time, which is the stall these commands exist to avoid.
    if (text.includes("agent-lock.mjs") && !/^allowed-tools:/m.test(front[1])) {
      errors.push(`commands/${entry} runs the helper without allowed-tools`);
    }
  }

  const help = names.includes("help")
    ? fs.readFileSync(path.join(directory, "help.md"), "utf8")
    : null;
  if (help) {
    for (const name of names.filter((candidate) => candidate !== "help")) {
      if (!help.includes(`/${PLUGIN_NAME}:${name}`)) {
        errors.push(`commands/help.md does not list /${PLUGIN_NAME}:${name}`);
      }
    }
  }
}

/**
 * One copy of every skill, and it lives in `skills/`.
 *
 * A second copy under a product directory is the failure this repository can
 * least afford: two agents reading the same repository would follow different
 * instructions about a tool whose whole purpose is that everybody agrees.
 */
function validateNoProductCopies(root, errors) {
  for (const product of [".claude-plugin", ".codex-plugin"]) {
    const directory = path.join(root, product);
    if (!fs.existsSync(directory)) {
      continue;
    }
    const stack = [directory];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "skills") {
            errors.push(`${product}/skills must not exist`);
          }
          stack.push(full);
        } else if (entry.name === "SKILL.md") {
          errors.push(`${path.relative(root, full)} duplicates a skill`);
        }
      }
    }
  }
}

/** The catalog entry, which must not pin a version of its own. */
function validateMarketplace(root, marketplace, errors) {
  if (!marketplace) {
    return;
  }
  const plugins = marketplace.plugins;
  if (!Array.isArray(plugins)) {
    errors.push(`${MARKETPLACE} plugins must be an array`);
    return;
  }
  const entries = plugins.filter((entry) => entry?.name === PLUGIN_NAME);
  if (entries.length !== 1) {
    errors.push(
      `${MARKETPLACE} must contain exactly one '${PLUGIN_NAME}' entry`,
    );
  }
  for (const entry of entries) {
    if ("version" in entry) {
      // Two places to bump is one place to forget, and the one that gets
      // forgotten is the one nobody reads.
      errors.push(
        `${MARKETPLACE} must not pin a plugin version; ${CLAUDE_MANIFEST} owns it`,
      );
    }
    if (entry.source !== "./") {
      errors.push(`${MARKETPLACE} entry source must be './'`);
    }
  }
}

/**
 * Hooks that point at something.
 *
 * A hook whose command is missing fails quietly at the moment it was supposed
 * to help - here, that means no warning before a lock expires, which is
 * indistinguishable from no lock being close to expiring.
 */
function validateHooks(root, errors) {
  const file = path.join(root, HOOKS);
  if (!fs.existsSync(file)) {
    return;
  }
  let hooks;
  try {
    // The same rule the manifests get: a repeated key here would resolve
    // last-wins and hide whichever hook was meant.
    hooks = parseStrictJson(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`invalid JSON in ${HOOKS}: ${error.message}`);
    return;
  }

  const commands = [];
  for (const matchers of Object.values(hooks.hooks ?? {})) {
    for (const matcher of matchers ?? []) {
      for (const hook of matcher.hooks ?? []) {
        if (typeof hook.command === "string") {
          commands.push(hook.command);
        }
      }
    }
  }

  for (const command of commands) {
    for (const [, reference] of command.matchAll(
      /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+)/g,
    )) {
      if (!fs.existsSync(path.join(root, reference))) {
        errors.push(`${HOOKS} references a missing file: ${reference}`);
      }
    }
  }
}

// Run directly, rather than imported by a test.
if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  const { positionals } = parseArgs({ allowPositionals: true });
  const expected = positionals[0]?.replace(/^v/, "");
  const { version, errors } = validateAgentPlugins({ expected });

  if (errors.length > 0) {
    process.stderr.write("Agent plugin validation failed:\n");
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`Agent plugin validation passed (version ${version})\n`);
}

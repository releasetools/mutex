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
import { parseArgs } from "node:util";
import { validateAgentPlugins } from "./validate-agent-plugins.mjs";

/**
 * Assembles the standalone plugin, which is what the marketplace publishes.
 *
 * `releasetools/agent-plugins` carries a copy of this directory rather than a
 * pointer at this repository, so whatever is assembled here is what a person
 * installs. That makes the list below a security boundary as much as a
 * packaging one: this repository holds tests, a build tree, a benchmark runner
 * that takes a connection string, and development dependencies, and none of it
 * belongs in something an agent loads on every session.
 *
 * So the artifact is an allowlist, not the repository minus exclusions - a new
 * directory here is invisible to the plugin until somebody adds it, which is
 * the failure mode worth having.
 *
 *     npm run plugin:package -- --out /tmp/mutex-plugin
 *     claude plugin validate --strict /tmp/mutex-plugin
 */

/** Copied verbatim, as `[source, destination]`. */
const FILES = [
  [".claude-plugin/plugin.json", ".claude-plugin/plugin.json"],
  [".codex-plugin/plugin.json", ".codex-plugin/plugin.json"],
  ["LICENSE", "LICENSE"],
  // The repository README is forty pages about an Action, a CLI and a pooled
  // server. What an agent host shows next to an install button is this one.
  ["PLUGIN.md", "README.md"],
];

/** Copied whole. Both manifests name the first two; Claude Code finds `hooks/`. */
const DIRECTORIES = ["commands", "hooks", "skills"];

export function packagePlugin({ root = process.cwd(), out } = {}) {
  const source = path.resolve(root);
  const target = path.resolve(out ?? path.join(source, "plugin"));

  refuseToEmpty(target, source);

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  for (const [from, to] of FILES) {
    const file = path.join(source, from);
    if (!isRegularFile(file)) {
      throw new Error(`missing ${from} - cannot publish the plugin without it`);
    }
    const destination = path.join(target, to);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination);
  }

  for (const directory of DIRECTORIES) {
    const from = path.join(source, directory);
    if (!fs.existsSync(from)) {
      throw new Error(
        `missing ${directory}/ - cannot publish the plugin without it`,
      );
    }
    copyTree(from, path.join(target, directory), directory);
  }

  // The same checks the repository gets, run against what actually shipped.
  // A skill or command that survives here but not there is a copy list that
  // has fallen behind, and nothing downstream would say so: an agent offers no
  // skill it cannot find, which looks exactly like the model not using it.
  const { errors, version } = validateAgentPlugins({ root: target });
  if (errors.length > 0) {
    throw new Error(
      `the assembled plugin does not validate:\n${errors.map((error) => `  - ${error}`).join("\n")}`,
    );
  }

  const name = readJson(path.join(target, ".claude-plugin/plugin.json")).name;
  return { target, name, version, files: listFiles(target) };
}

/**
 * Decides whether `--out` may be emptied, because emptying is what happens next.
 *
 * Assembling has to start from nothing - a file the previous version shipped
 * and this one does not would otherwise be published forever - so the output
 * directory is deleted rather than written over. That makes `--out` an
 * argument worth being suspicious of.
 *
 * Two rules. It may not contain the checkout, which rules out the filesystem
 * root, a home directory and the checkout itself in one comparison. And it may
 * not hold anything this command did not put there: an empty directory is
 * fine, a previous assembly is fine, and somebody's notes are one typo away
 * from being an argument here and should cost an error message rather than
 * the notes.
 */
function refuseToEmpty(target, source) {
  const within = path.relative(target, source);
  if (within === "" || (!within.startsWith("..") && !path.isAbsolute(within))) {
    throw new Error(
      `--out ${target} contains the checkout, which it would delete`,
    );
  }
  if (target === os.homedir()) {
    throw new Error(`--out ${target} is your home directory`);
  }

  let stats;
  try {
    stats = fs.lstatSync(target);
  } catch {
    return;
  }
  if (!stats.isDirectory()) {
    throw new Error(`--out ${target} is not a directory`);
  }
  if (
    fs.readdirSync(target).length > 0 &&
    !fs.existsSync(path.join(target, ".claude-plugin", "plugin.json"))
  ) {
    throw new Error(
      `--out ${target} holds something other than an assembled plugin; refusing to empty it`,
    );
  }
}

/**
 * Copies a directory, refusing anything that is not a plain file.
 *
 * A symlink would be published as a symlink, and where it pointed on the runner
 * says nothing about where it points on somebody's laptop - so it is either a
 * broken plugin or a file escaping the plugin directory, and neither is worth
 * supporting for a tree of markdown and one script.
 */
function copyTree(from, to, relative) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const within = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      copyTree(path.join(from, entry.name), path.join(to, entry.name), within);
    } else if (entry.isFile()) {
      fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    } else {
      throw new Error(
        `${within} is not a regular file; the plugin publishes no symlinks`,
      );
    }
  }
}

function isRegularFile(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function listFiles(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory()
        ? listFiles(full, base)
        : [path.relative(base, full)];
    })
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Run directly, rather than imported by a test.
if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  const { values } = parseArgs({
    options: { root: { type: "string" }, out: { type: "string" } },
  });

  try {
    const { target, name, version, files } = packagePlugin(values);
    process.stdout.write(
      `Packaged the ${name} plugin ${version} into ${target}\n`,
    );
    for (const file of files) {
      process.stdout.write(`  ${file}\n`);
    }
  } catch (error) {
    process.stderr.write(`package-plugin: ${error.message}\n`);
    process.exit(1);
  }
}

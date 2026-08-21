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
import { parseArgs } from "node:util";
import { isRealDirectory, isRegularFile, refuseToEmpty } from "./packaging.mjs";

/**
 * Assembles the tree that gets published as the action, the versioned CLI, and
 * the agent skill that drives it.
 *
 * `dist/` is not committed, so what a consumer of `releasetools/mutex@v1`
 * receives is built and staged at release time. This is that staging, kept
 * here rather than inline in the workflow so it can be run and inspected
 * without cutting a release:
 *
 *     npm run package:release
 *     node publish/dist/main/index.js
 *
 * That matters more than it sounds. The generated package.json below exists
 * because the action reports its own version by walking up from the bundle to
 * the nearest package.json that has one - and ncc's marker file has none, so
 * without this the published action reports "unknown" and the release's own
 * verification fails. It was found by assembling the tree and running it, and
 * would not have been found by reading the code.
 */

/** Copied verbatim into the published tree. */
const FILES = ["action.yml", "LICENSE", "README.md"];

/** Committed directories, published as they stand. */
const DIRECTORIES = ["bin"];

/**
 * Taken from a checkout of releasetools/agent-plugins, as `[from, to]`.
 *
 * The agent plugin is written and released there, not here. It still travels in
 * the npm package because Hermes, Gemini and Antigravity read no plugin
 * manifest - they discover skills by walking a directory under their own home,
 * and for most people a global install is the only checkout there is. So the
 * installer and the files it copies ship together, fetched at release time
 * rather than committed in two places.
 */
const FROM_MARKETPLACE = [
  ["plugins/mutex/skills", "skills"],
  ["plugins/mutex/commands", "commands"],
  ["scripts/install-agent-skills.mjs", "scripts/install-agent-skills.mjs"],
];

/** Directories that do not exist until the build has run. */
const BUILT_DIRECTORIES = ["dist", "lib"];

const CLI_DEPENDENCIES = ["pg", "pg-format"];

export function packageRelease({
  root = process.cwd(),
  out,
  marketplace,
} = {}) {
  const source = path.resolve(root);
  const target = path.resolve(out ?? path.join(source, "publish"));
  const plugins = path.resolve(
    marketplace ?? path.join(source, "..", "agent-plugins"),
  );

  const manifest = readJson(path.join(source, "package.json"));
  if (!manifest.version) {
    throw new Error(`${source}/package.json has no version`);
  }

  refuseToEmpty(target, source, {
    marker: "action.yml",
    what: "an assembled release tree",
  });

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  for (const file of FILES) {
    const from = path.join(source, file);
    // lstat, not existsSync: a name on the list that resolves somewhere else
    // publishes whatever is at the other end.
    if (!isRegularFile(from)) {
      throw new Error(`missing ${file} - cannot publish without it`);
    }
    const to = path.join(target, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  // Two lists, because the two absences mean different things: a missing
  // `lib/` is a forgotten build, and a missing `skills/` is a broken checkout.
  for (const [directories, remedy] of [
    [DIRECTORIES, "cannot publish without it"],
    [BUILT_DIRECTORIES, "run `npm run build` first"],
  ]) {
    for (const dir of directories) {
      const from = path.join(source, dir);
      if (!fs.existsSync(from)) {
        throw new Error(`missing ${dir}/ - ${remedy}`);
      }
      // `cp -r` follows a link to a directory, so an allowlisted name pointing
      // elsewhere would publish that tree in place of this one.
      if (!isRealDirectory(from)) {
        throw new Error(
          `${dir} is not a regular directory; nothing published is a symlink`,
        );
      }
      fs.cpSync(from, path.join(target, dir), { recursive: true });
    }
  }

  // A release that quietly shipped without the skill would seed nothing for
  // three agents and say so nowhere, so a missing marketplace stops it here.
  for (const [relative, destination] of FROM_MARKETPLACE) {
    const from = path.join(plugins, relative);
    const to = path.join(target, destination);
    if (isRealDirectory(from)) {
      fs.cpSync(from, to, { recursive: true });
    } else if (isRegularFile(from)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    } else {
      throw new Error(
        `missing ${relative} in ${plugins} - pass --marketplace <a checkout of releasetools/agent-plugins>`,
      );
    }
  }

  // Keep build tooling out, but retain what npm needs to install the compiled
  // CLI directly from a version tag. The same package.json also gives the
  // bundled Action the version it reports at runtime.
  writeJson(path.join(target, "package.json"), {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    license: manifest.license,
    repository: manifest.repository,
    homepage: manifest.homepage,
    bugs: manifest.bugs,
    type: manifest.type,
    bin: manifest.bin,
    engines: manifest.engines,
    dependencies: dependenciesFor(CLI_DEPENDENCIES, manifest.dependencies),
    publishConfig: manifest.publishConfig,
  });

  verifyEntrypoints(target);

  return { target, version: manifest.version, files: listFiles(target) };
}

/**
 * Every path action.yml names has to exist in what we publish.
 *
 * A `post:` that is declared but missing is the expensive case: the action
 * works right up until a job ends, and then never releases its lock.
 */
function verifyEntrypoints(target) {
  const declared = entrypointsOf(path.join(target, "action.yml"));
  if (declared.length === 0) {
    throw new Error("action.yml declares no entrypoints under `runs:`");
  }

  for (const [key, file] of declared) {
    if (!fs.existsSync(path.join(target, file))) {
      throw new Error(
        `action.yml runs.${key} is ${file}, which is not in the published tree`,
      );
    }
  }
}

/** The `main:`/`post:`/`pre:` paths from action.yml's `runs:` block. */
function entrypointsOf(actionFile) {
  const lines = fs.readFileSync(actionFile, "utf8").split("\n");
  const start = lines.findIndex((line) => /^runs:\s*$/.test(line));
  if (start < 0) {
    return [];
  }

  const found = [];
  for (const line of lines.slice(start + 1)) {
    // The block ends at the first line that is not indented.
    if (line.trim() !== "" && !/^\s/.test(line)) {
      break;
    }
    const match = /^\s+(main|post|pre):\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
    if (match) {
      found.push([match[1], match[2]]);
    }
  }
  return found;
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

function dependenciesFor(names, dependencies = {}) {
  return Object.fromEntries(
    names.map((name) => {
      if (!dependencies[name]) {
        throw new Error(`missing runtime dependency ${name}`);
      }
      return [name, dependencies[name]];
    }),
  );
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// Run directly, rather than imported by a test.
if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      out: { type: "string" },
      marketplace: { type: "string" },
    },
  });

  try {
    const { target, version, files } = packageRelease(values);
    process.stdout.write(`Packaged mutex ${version} into ${target}\n`);
    for (const file of files) {
      process.stdout.write(`  ${file}\n`);
    }
  } catch (error) {
    process.stderr.write(`package-release: ${error.message}\n`);
    process.exit(1);
  }
}

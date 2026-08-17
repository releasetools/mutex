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
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { compareVersions, parseVersion } from "./check-release-version.mjs";

export const NPM_PACKAGE = "@releasetools/mutex";
export const FIRST_NPM_RELEASE = "v1.3.0";
const NPM_REGISTRY = "https://registry.npmjs.org";

export function planNpmPublish({ manifest, requestedVersion, registry }) {
  if (manifest.name !== NPM_PACKAGE) {
    throw new Error(
      `refusing to publish ${manifest.name ?? "an unnamed package"}; expected ${NPM_PACKAGE}`,
    );
  }

  const version = `v${manifest.version}`;
  if (!parseVersion(version)) {
    throw new Error(
      `package version is not a release version: ${manifest.version}`,
    );
  }
  if (version !== requestedVersion) {
    throw new Error(
      `package version ${manifest.version} does not match ${requestedVersion}`,
    );
  }

  // Older tags were published before an npm package existed. Replacing one
  // must not manufacture a new package from today's source under an old
  // version number.
  if (compareVersions(version, FIRST_NPM_RELEASE) < 0) {
    return {
      action: "skip",
      reason: `npm publishing starts at ${FIRST_NPM_RELEASE}`,
    };
  }

  if (Object.hasOwn(registry.versions, manifest.version)) {
    return {
      action: "skip",
      reason: `${manifest.name}@${manifest.version} already exists and npm versions are immutable`,
    };
  }

  const latest = registry.latest;
  if (latest && !parseVersion(`v${latest}`)) {
    throw new Error(`npm's latest tag is not a release version: ${latest}`);
  }

  return {
    action: "publish",
    // An allowed backport must not move `latest` backwards. Exact versions
    // remain installable, while the deliberately generic tag stays separate.
    tag:
      latest && compareVersions(version, `v${latest}`) < 0
        ? "backport"
        : "latest",
  };
}

export async function readRegistryPackage(
  name,
  fetchImpl = fetch,
  registryUrl = NPM_REGISTRY,
) {
  const url = `${registryUrl.replace(/\/+$/, "")}/${encodeURIComponent(name)}`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) {
    return { latest: null, versions: {} };
  }
  if (!response.ok) {
    throw new Error(
      `GET ${url} returned ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
  }
  const document = await response.json();
  return {
    latest: document["dist-tags"]?.latest ?? null,
    versions: document.versions ?? {},
  };
}

export async function publishNpm({ directory, requestedVersion }) {
  const root = path.resolve(directory);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const preflight = planNpmPublish({
    manifest,
    requestedVersion,
    registry: { latest: null, versions: {} },
  });
  if (preflight.action === "skip") {
    process.stdout.write(`Skipping npm: ${preflight.reason}.\n`);
    writeOutputs(false, "not-applicable");
    return;
  }

  const registry = await readRegistryPackage(NPM_PACKAGE);
  const plan = planNpmPublish({ manifest, requestedVersion, registry });

  if (plan.action === "skip") {
    process.stdout.write(`Skipping npm: ${plan.reason}.\n`);
    writeOutputs(true, "existing");
    return;
  }

  process.stdout.write(
    `Publishing ${manifest.name}@${manifest.version} with dist-tag '${plan.tag}'.\n`,
  );
  const result = spawnSync(
    "npm",
    [
      "publish",
      root,
      "--access",
      "public",
      "--tag",
      plan.tag,
      "--provenance",
      "--registry",
      NPM_REGISTRY,
    ],
    { stdio: "inherit" },
  );
  if (result.error) {
    throw new Error(`could not start npm publish: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`npm publish exited with status ${result.status}`);
  }
  writeOutputs(true, "published");
}

function writeOutputs(available, status) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `available=${available}\nstatus=${status}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: {
      directory: { type: "string", default: "publish" },
      version: { type: "string" },
    },
  });

  try {
    if (!values.version) throw new Error("--version is required");
    await publishNpm({
      directory: values.directory,
      requestedVersion: values.version,
    });
  } catch (error) {
    process.stderr.write(`::error::${error.message}\n`);
    process.exit(1);
  }
}

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

import { parseArgs } from "node:util";

/**
 * Decides whether a proposed release version is allowed.
 *
 * Lives here rather than in the workflow because it is the part with actual
 * logic, and workflow YAML can only be exercised by releasing. Everything it
 * needs is passed in, so it is a pure function of (version, existing tags).
 *
 * Note what it does *not* do: walk the branch history looking for the last
 * tagged commit. Release tags point at built commits on `release/<major>`,
 * not at anything reachable from `main`, so that walk would find nothing.
 * The highest existing tag is the equivalent question, and it is the one
 * that stays true.
 */

const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/;

const TAGS_PER_PAGE = 100;

/**
 * Every tag name in the repository.
 *
 * The workflow used to do this with `gh api --paginate | tr '\n' ' '`, which
 * flattened the names into one string for the shell to pass back and this
 * script to split apart again. Doing it here drops the round trip, and turns
 * pagination into something the tests can exercise rather than something that
 * gets discovered at 101 tags.
 *
 * Deliberately no octokit: this runs before `npm ci`, so node_modules is not
 * on disk yet. Global fetch is what a release actually has to work with.
 */
export async function fetchTags({
  repo,
  token,
  apiUrl = "https://api.github.com",
  fetchImpl = fetch,
  maxPages = 100,
} = {}) {
  if (!repo) {
    throw new Error("no repository to read tags from (set GITHUB_REPOSITORY)");
  }

  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "releasetools/mutex release",
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const base = `${apiUrl.replace(/\/+$/, "")}/repos/${repo}/tags`;
  const names = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${base}?per_page=${TAGS_PER_PAGE}&page=${page}`;
    const response = await fetchImpl(url, { headers });

    if (!response.ok) {
      throw new Error(
        `GET ${url} returned ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      );
    }

    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error(`GET ${url} did not answer with a list of tags`);
    }

    for (const tag of batch) {
      names.push(tag.name);
    }

    // A short page is the last page. Without this the loop would keep asking
    // for pages GitHub answers with an empty list.
    if (batch.length < TAGS_PER_PAGE) {
      return names;
    }
  }

  throw new Error(
    `stopped after ${maxPages} pages of tags; that is more than any release should need`,
  );
}

export function parseVersion(tag) {
  const match = SEMVER.exec(tag);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative if a < b, positive if a > b, zero if equal. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }
  return 0;
}

/** The highest release tag in `tags`, or null when there are none. */
export function highestVersion(tags) {
  return (
    tags
      .filter((tag) => SEMVER.test(tag))
      .sort(compareVersions)
      .at(-1) ?? null
  );
}

export function checkReleaseVersion({
  version,
  tags = [],
  allowLowerVersion = false,
  overwriteExisting = false,
} = {}) {
  if (!SEMVER.test(version)) {
    throw new Error(
      `version must look like v1.3.0 (got: ${version || "<empty>"})`,
    );
  }

  if (tags.includes(version) && !overwriteExisting) {
    throw new Error(
      `${version} has already been released. Pass overwrite-existing to replace it, or pick a new version.`,
    );
  }

  const highest = highestVersion(tags.filter((tag) => tag !== version));

  // Nothing released yet, or the caller has said they know.
  if (highest === null || allowLowerVersion) {
    return { version, previous: highest, major: version.split(".")[0] };
  }

  if (compareVersions(version, highest) < 0) {
    throw new Error(
      `${version} is lower than ${highest}, which is already released. Pass allow-lower-version if that is deliberate.`,
    );
  }

  return { version, previous: highest, major: version.split(".")[0] };
}

// Run directly, rather than imported by a test.
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      tags: { type: "string" },
      "allow-lower-version": { type: "boolean", default: false },
      "overwrite-existing": { type: "boolean", default: false },
    },
  });

  try {
    // --tags is for running this by hand. Left off, it reads the repository,
    // which is what the release does.
    const tags =
      values.tags === undefined
        ? await fetchTags({
            repo: process.env.GITHUB_REPOSITORY,
            token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
            apiUrl: process.env.GITHUB_API_URL || undefined,
          })
        : values.tags.split(/\s+/).filter(Boolean);

    process.stdout.write(`Existing tags: ${tags.join(" ") || "none"}\n`);

    const result = checkReleaseVersion({
      version: values.version ?? "",
      tags,
      allowLowerVersion: values["allow-lower-version"],
      overwriteExisting: values["overwrite-existing"],
    });

    process.stdout.write(
      `${result.version} accepted (previous release: ${result.previous ?? "none"})\n`,
    );
    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `major=${result.major}\nprevious=${result.previous ?? ""}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`::error::${error.message}\n`);
    process.exit(1);
  }
}

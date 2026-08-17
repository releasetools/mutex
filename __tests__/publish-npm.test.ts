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

import fs from "node:fs";
// @ts-expect-error - release tooling, deliberately plain JS with no types
import * as npmPublishing from "../scripts/publish-npm.mjs";

const { NPM_PACKAGE, planNpmPublish, readRegistryPackage } = npmPublishing;

const manifest = (version = "1.3.0") => ({
  name: NPM_PACKAGE,
  version,
});

describe("npm publishing", () => {
  it("publishes the first npm release as latest", () => {
    expect(
      planNpmPublish({
        manifest: manifest(),
        requestedVersion: "v1.3.0",
        registry: { latest: null, versions: {} },
      }),
    ).toEqual({ action: "publish", tag: "latest" });
  });

  it("does not move latest backwards for a backport", () => {
    expect(
      planNpmPublish({
        manifest: manifest("1.3.1"),
        requestedVersion: "v1.3.1",
        registry: { latest: "1.4.0", versions: { "1.4.0": {} } },
      }),
    ).toEqual({ action: "publish", tag: "backport" });
  });

  it("skips an immutable version that is already published", () => {
    expect(
      planNpmPublish({
        manifest: manifest(),
        requestedVersion: "v1.3.0",
        registry: { latest: "1.3.0", versions: { "1.3.0": {} } },
      }),
    ).toMatchObject({
      action: "skip",
      reason: expect.stringMatching(/immutable/),
    });
  });

  it("does not retroactively publish tags from before npm distribution", () => {
    expect(
      planNpmPublish({
        manifest: manifest("1.2.2"),
        requestedVersion: "v1.2.2",
        registry: { latest: null, versions: {} },
      }),
    ).toMatchObject({
      action: "skip",
      reason: expect.stringMatching(/v1\.3\.0/),
    });
  });

  it("requires the release version and package identity to match", () => {
    expect(() =>
      planNpmPublish({
        manifest: manifest(),
        requestedVersion: "v1.3.1",
        registry: { latest: null, versions: {} },
      }),
    ).toThrow(/does not match/);
    expect(() =>
      planNpmPublish({
        manifest: { name: "mutex", version: "1.3.0" },
        requestedVersion: "v1.3.0",
        registry: { latest: null, versions: {} },
      }),
    ).toThrow(/refusing to publish/);
  });

  it("distinguishes a missing package from registry failures", async () => {
    const missing = await readRegistryPackage(
      NPM_PACKAGE,
      async () => new Response("not found", { status: 404 }),
    );
    expect(missing).toEqual({ latest: null, versions: {} });

    await expect(
      readRegistryPackage(
        NPM_PACKAGE,
        async () => new Response("unavailable", { status: 503 }),
      ),
    ).rejects.toThrow(/503/);
  });

  it("wires trusted npm publishing into the release after GitHub publication", () => {
    const workflow = fs.readFileSync(".github/workflows/release.yaml", "utf8");
    expect(workflow.match(/id-token: write/g)).toHaveLength(1);
    expect(workflow).toContain(
      "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
    );
    expect(workflow).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflow).toContain(
      'node source/scripts/publish-npm.mjs --directory package --version "$VERSION"',
    );
    expect(workflow).toContain(
      "npm_available: ${{ steps.npm.outputs.available }}",
    );
    expect(workflow).toContain(
      'npm install --global "@releasetools/mutex@${expected}"',
    );
    expect(workflow.indexOf("gh release create")).toBeLessThan(
      workflow.indexOf("node source/scripts/publish-npm.mjs"),
    );
  });
});

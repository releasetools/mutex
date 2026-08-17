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

describe("npm publishing", () => {
  it("wires trusted npm publishing into the release after GitHub publication", () => {
    const workflow = fs.readFileSync(".github/workflows/release.yaml", "utf8");
    expect(workflow.match(/id-token: write/g)).toHaveLength(1);
    expect(workflow).toContain(
      "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
    );
    expect(workflow).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflow).toContain("npm publish . \\");
    expect(workflow).toContain('name="$(node -p');
    expect(workflow).toContain('published="$(npm view');
    expect(workflow).toContain("tag=backport");
    expect(workflow).toContain("v1.0.*|v1.1.*|v1.2.*");
    expect(workflow).toContain(
      "npm_available: ${{ steps.npm.outputs.available }}",
    );
    expect(workflow).toContain(
      'npm install --global "@releasetools/mutex@${expected}"',
    );
    expect(workflow.indexOf("gh release create")).toBeLessThan(
      workflow.indexOf("npm publish ."),
    );
  });
});

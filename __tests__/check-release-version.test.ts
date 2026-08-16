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

// @ts-expect-error - build tooling, deliberately plain JS with no types
import {
  checkReleaseVersion,
  compareVersions,
  highestVersion,
} from "../scripts/check-release-version.mjs";

const RELEASED = ["v1.0.0", "v1.0.1", "v1.1.0", "v1"];

describe("compareVersions", () => {
  it("orders by number, not by string", () => {
    // The reason for not sorting these as text: "v1.10.0" < "v1.9.0"
    // lexicographically, which would let a release go backwards unnoticed.
    expect(compareVersions("v1.10.0", "v1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.22", "v1.3.0")).toBeLessThan(0);
    expect(compareVersions("v2.0.0", "v1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "v1.2.3")).toBe(0);
  });
});

describe("highestVersion", () => {
  it("ignores the floating major and anything else that is not a version", () => {
    expect(highestVersion(RELEASED)).toBe("v1.1.0");
    expect(highestVersion(["v1", "latest", "nightly"])).toBeNull();
    expect(highestVersion([])).toBeNull();
  });

  it("does not sort numerically-larger versions below smaller ones", () => {
    expect(highestVersion(["v1.9.0", "v1.10.0", "v1.2.0"])).toBe("v1.10.0");
  });
});

describe("checkReleaseVersion", () => {
  it("accepts a version above everything released", () => {
    expect(
      checkReleaseVersion({ version: "v1.2.0", tags: RELEASED }),
    ).toMatchObject({ version: "v1.2.0", previous: "v1.1.0", major: "v1" });
  });

  it("accepts the first release, when nothing exists yet", () => {
    expect(checkReleaseVersion({ version: "v1.0.0", tags: [] })).toMatchObject({
      previous: null,
    });
  });

  it("rejects a malformed version", () => {
    for (const version of ["1.2.0", "v1.2", "v1.2.0-rc1", "", "latest"]) {
      expect(() => checkReleaseVersion({ version, tags: RELEASED })).toThrow(
        /must look like v1\.3\.0/,
      );
    }
  });

  it("rejects a version that has already been released", () => {
    expect(() =>
      checkReleaseVersion({ version: "v1.1.0", tags: RELEASED }),
    ).toThrow(/already been released/);
  });

  /** The case from the brief: v1.3.0 released, then somebody asks for v1.2.22. */
  it("rejects going backwards", () => {
    const tags = [...RELEASED, "v1.3.0"];
    expect(() => checkReleaseVersion({ version: "v1.2.22", tags })).toThrow(
      /lower than v1\.3\.0/,
    );
  });

  it("lets a deliberate lower version through", () => {
    const tags = [...RELEASED, "v1.3.0"];
    expect(
      checkReleaseVersion({
        version: "v1.2.22",
        tags,
        allowLowerVersion: true,
      }),
    ).toMatchObject({ version: "v1.2.22" });
  });

  it("still rejects a released version even when going lower is allowed", () => {
    // Replacing an existing release is a different decision from releasing
    // out of order, so one flag must not quietly grant the other.
    expect(() =>
      checkReleaseVersion({
        version: "v1.1.0",
        tags: RELEASED,
        allowLowerVersion: true,
      }),
    ).toThrow(/already been released/);
  });

  it("lets a deliberate replacement through", () => {
    expect(
      checkReleaseVersion({
        version: "v1.1.0",
        tags: RELEASED,
        overwriteExisting: true,
      }),
    ).toMatchObject({ version: "v1.1.0" });
  });

  it("does not compare a replacement against itself", () => {
    // v1.1.0 is the highest release; re-releasing it must not read as going
    // backwards from itself.
    expect(
      checkReleaseVersion({
        version: "v1.1.0",
        tags: RELEASED,
        overwriteExisting: true,
      }),
    ).toMatchObject({ previous: "v1.0.1" });
  });

  it("reports the major, which the release branch and floating tag need", () => {
    expect(
      checkReleaseVersion({ version: "v2.0.0", tags: RELEASED }).major,
    ).toBe("v2");
  });
});

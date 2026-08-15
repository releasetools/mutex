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

/**
 * The version from the nearest package.json above this module.
 *
 * Walks up rather than using a fixed depth, because the same code ships from
 * four places at two different depths: `lib/main.js`, `lib/cli/main.js`,
 * `dist/main/index.js` and `dist/cli/index.js`. The ncc bundles also drop a
 * package.json of their own alongside them containing only `{"type":"module"}`,
 * so having a `version` field is what identifies the real one.
 *
 * Returns "unknown" rather than throwing: not knowing the version is never a
 * reason to fail an operation.
 */
export function readPackageVersion(): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return "unknown";
  }

  for (let depth = 0; depth < 6; depth++) {
    try {
      const manifest = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      const version = JSON.parse(manifest).version;
      if (typeof version === "string" && version.length > 0) {
        return version;
      }
    } catch {
      // No package.json here, or an unreadable one: keep walking up.
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return "unknown";
}

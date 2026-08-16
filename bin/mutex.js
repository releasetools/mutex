#!/usr/bin/env node
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

// Launcher for the compiled CLI, which is built rather than committed.
try {
  await import("../lib/cli/main.js");
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") {
    process.stderr.write("mutex: not built yet - run `npm run build`.\n");
    process.exit(1);
  }
  throw error;
}

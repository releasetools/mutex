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
import * as core from "@actions/core";
/**
 * Routes the mutex core's log output through the GitHub Actions toolkit, so
 * warnings and errors still surface as workflow annotations.
 *
 * This lives in its own module so the CLI never pulls `@actions/core` in.
 */
export class ActionsLogger {
    info(message) {
        core.info(message);
    }
    warning(message) {
        core.warning(message);
    }
    error(message) {
        core.error(message);
    }
    debug(message) {
        core.debug(message);
    }
}
//# sourceMappingURL=actions-logger.js.map
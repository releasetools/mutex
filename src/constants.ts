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

export const SKIP_LABEL = "SKIP_MUTEX";
export const TABLE_NAME = "releasetools_mutex";

/**
 * Where the connection string comes from, for both front ends.
 *
 * Prefixed on purpose. `DATABASE_URL` is the most reused name in the
 * ecosystem - frameworks, ORMs, PaaS providers and CI systems all set it, and
 * it points at the *application's* database far more often than at the one
 * holding locks. mutex read it until 1.3.0, warning as it went; a repository
 * that had one for its app and then added mutex was taking its locks in the
 * app database without being told.
 */
export const CONNECTION_ENV_VAR = "MUTEX_DATABASE_URL";

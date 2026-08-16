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

/**
 * How the lock durations relate to each other.
 *
 * Shared by the Action's inputs and the CLI's flags, which express the same
 * three numbers and used to derive them separately - so a change to one could
 * silently leave the other behind.
 */

export const DEFAULT_EXPIRATION_SECONDS = 60;
export const DEFAULT_POLL_INTERVAL_SECONDS = 10;

/** "Wait as long as the lease would have lasted." */
export const WAIT_FOR_THE_LEASE = -1;
export const DEFAULT_MAX_WAIT_SECONDS = WAIT_FOR_THE_LEASE;

/** A whole number of seconds, or the fallback for anything else. */
export function seconds(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * How long to keep trying, in milliseconds.
 *
 * `maxWait` of -1 - the default - means "for as long as this lock would have
 * lasted", which is the most useful thing to do when nobody says otherwise:
 * waiting longer than the lease you are about to take is rarely what you want.
 */
export function pollTimeoutMs(expiration: number, maxWait: number): number {
  const lease = Math.max(seconds(expiration, DEFAULT_EXPIRATION_SECONDS), 0);
  let wait = seconds(maxWait, WAIT_FOR_THE_LEASE);
  if (wait < WAIT_FOR_THE_LEASE) {
    wait = WAIT_FOR_THE_LEASE;
  }

  return (wait === WAIT_FOR_THE_LEASE ? lease : wait) * 1000;
}

/** How long to wait between attempts, in milliseconds. */
export function pollIntervalMs(pollInterval: number): number {
  const interval = seconds(pollInterval, DEFAULT_POLL_INTERVAL_SECONDS);
  return Math.max(interval, 0) * 1000;
}

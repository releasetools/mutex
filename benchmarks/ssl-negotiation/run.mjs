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
 * Measures what `ssl_negotiation = "direct"` is worth against the database in
 * $MUTEX_DATABASE_URL.
 *
 * Direct negotiation removes the SSLRequest packet and the server's one-byte
 * reply, so the saving is one network round trip and nothing else. Against a
 * database on loopback that is noise; the number only means something over the
 * link the CLI actually uses.
 */

import pg from "pg";
// The built tree, so this measures the configuration mutex really builds
// rather than a hand-rolled approximation of it. Run `npm run build` first.
import { resolveConnection } from "../../lib/connection.js";

const { Client } = pg;

const connectionString = process.env.MUTEX_DATABASE_URL;
const runs = Number(process.env.MUTEX_BENCH_RUNS ?? 20);

if (!connectionString) {
  console.error("error: MUTEX_DATABASE_URL is not available in this shell");
  process.exit(3);
}

const configFor = (negotiation) => ({
  ...resolveConnection(connectionString, { sslNegotiation: negotiation })
    .config,
  connectionTimeoutMillis: 10_000,
});

/** Times one connection, which is the only thing this option changes. */
async function connectOnce(negotiation) {
  const client = new Client(configFor(negotiation));
  const started = process.hrtime.bigint();
  await client.connect();
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  await client.end();
  return elapsed;
}

async function serverVersion() {
  const client = new Client(configFor("postgres"));
  await client.connect();
  try {
    const { rows } = await client.query("SHOW server_version");
    return rows[0].server_version;
  } finally {
    await client.end();
  }
}

const median = (samples) =>
  [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];

const report = (label, samples) =>
  `${label.padEnd(11)} median ${median(samples).toFixed(1)} ms  ` +
  `(min ${Math.min(...samples).toFixed(1)}, max ${Math.max(...samples).toFixed(1)})`;

const version = await serverVersion();
console.log(`Server: PostgreSQL ${version}`);

try {
  await connectOnce("direct");
} catch (error) {
  // Anything can be thrown, and a secondary TypeError here would hide the
  // failure this whole branch exists to report.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nDirect negotiation failed: ${message}`);
  console.error(
    "PostgreSQL 17 introduced it. Older servers read the TLS handshake as a\n" +
      "malformed startup packet and close the connection, which is what this\n" +
      "looks like. There is nothing to measure here.",
  );
  process.exit(1);
}

// One connection of each kind before timing anything: a serverless database
// may still be waking up, and that would land entirely on whichever ran first.
await connectOnce("postgres");
await connectOnce("direct");

const negotiated = [];
const direct = [];
// Interleaved, so a drift in network latency is shared rather than attributed
// to whichever style happened to run during it.
for (let run = 0; run < runs; run++) {
  negotiated.push(await connectOnce("postgres"));
  direct.push(await connectOnce("direct"));
}

console.log(`Runs:   ${runs} of each, interleaved\n`);
console.log(report("negotiated", negotiated));
console.log(report("direct", direct));
console.log(
  `\nSaving: ${(median(negotiated) - median(direct)).toFixed(1)} ms per connection ` +
    `(${(100 - (100 * median(direct)) / median(negotiated)).toFixed(0)}%)`,
);
console.log(
  "\nA direct CLI command opens one connection, so this is what it saves.\n" +
    "The server profile opens one per process and keeps it, so it saves that once.",
);

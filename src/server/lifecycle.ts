/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Logger } from "../logger.js";
import { resolveConnectionString } from "../cli/config.js";
import {
  ensureProfiles,
  MutexProfile,
  profilesPath,
  selectProfile,
} from "../cli/profiles.js";
import { ConfigurationError, EXIT_OK } from "../cli/exit-codes.js";
import { runServer, serverPaths } from "./server.js";
import { TcpMutexStore } from "./tcp-store.js";

export type ServerAction = "start" | "run" | "status" | "stop";

export async function serverCommand(
  action: ServerAction,
  requestedProfile: string | null,
  json: boolean,
  log: Logger,
): Promise<number> {
  const filePath = profilesPath();
  if (action === "start" || action === "run") {
    await ensureProfiles(process.stdin, process.stderr, filePath);
  }
  const { profile } = await selectProfile(requestedProfile, filePath);
  assertServerProfile(profile);

  switch (action) {
    case "run":
      process.chdir(profile.workingDir!);
      await runServer(profile, resolveConnectionString(), log);
      return EXIT_OK;
    case "start":
      return startServer(profile, log);
    case "status":
      return showStatus(profile, json);
    case "stop":
      return stopServer(profile, log);
  }
}

async function startServer(
  profile: MutexProfile,
  log: Logger,
): Promise<number> {
  // Check the secret before detaching so a configuration error is immediate.
  resolveConnectionString();
  const client = new TcpMutexStore(
    profile.bindAddress!,
    2_000,
    undefined,
    profile.name,
  );
  try {
    const status = await client.health();
    log.info(
      `mutex server '${profile.name}' is already running as PID ${status.pid} on ${status.bindAddress}`,
    );
    return EXIT_OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.startsWith("cannot reach mutex server") &&
      !message.includes("timed out")
    ) {
      throw new Error(
        `something is already listening on ${profile.bindAddress}, but it did not pass the '${profile.name}' server health check: ${message}`,
      );
    }
    // Expected when starting a stopped profile. Explicit server mode never
    // turns this into a direct database operation.
  }

  const launcher = path.resolve(process.argv[1]);
  try {
    await access(profile.workingDir!);
  } catch {
    throw new ConfigurationError(
      `working directory does not exist: ${profile.workingDir}`,
    );
  }
  const child = spawn(
    process.execPath,
    [launcher, "server", "run", "-p", profile.name],
    {
      cwd: profile.workingDir,
      env: process.env,
      detached: true,
      stdio: "ignore",
    },
  );
  const spawnFailure: { error: Error | null } = { error: null };
  child.once("error", (error) => {
    spawnFailure.error = error;
  });
  child.unref();

  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (spawnFailure.error) {
      throw new Error(
        `could not start mutex server: ${spawnFailure.error.message}`,
      );
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `mutex server exited during startup (${child.signalCode ?? `status ${child.exitCode}`}); run 'mutex server run -p ${profile.name}' to see the error`,
      );
    }
    try {
      const status = await client.health();
      log.info(
        `Started mutex server '${profile.name}' as PID ${status.pid} on ${status.bindAddress}.`,
      );
      log.info(`Operation log: ${status.logPath}`);
      return EXIT_OK;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(
    `mutex server did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}\n` +
      `  Run 'mutex server run -p ${profile.name}' to see the startup error.`,
  );
}

async function showStatus(
  profile: MutexProfile,
  json: boolean,
): Promise<number> {
  const status = await new TcpMutexStore(
    profile.bindAddress!,
    undefined,
    undefined,
    profile.name,
  ).health();
  if (json) {
    process.stdout.write(`${JSON.stringify(status)}\n`);
  } else {
    process.stdout.write(
      [
        `Profile: ${status.profile}`,
        `PID: ${status.pid}`,
        `Uptime: ${status.uptimeSeconds}s`,
        `Address: ${status.bindAddress}`,
        `Log: ${status.logPath}`,
        `Protocol: ${status.protocolVersion}`,
        `Pool: healthy (${status.pool.total} total, ${status.pool.idle} idle, ${status.pool.waiting} waiting)`,
        "",
      ].join("\n"),
    );
  }
  return EXIT_OK;
}

async function stopServer(profile: MutexProfile, log: Logger): Promise<number> {
  const client = new TcpMutexStore(
    profile.bindAddress!,
    undefined,
    undefined,
    profile.name,
  );
  const status = await client.health();
  await client.stop();

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await new TcpMutexStore(
        profile.bindAddress!,
        250,
        undefined,
        profile.name,
      ).health();
      await delay(100);
    } catch {
      log.info(`Stopped mutex server '${profile.name}' (PID ${status.pid}).`);
      return EXIT_OK;
    }
  }
  throw new Error(
    `mutex server '${profile.name}' did not stop within 10 seconds`,
  );
}

function assertServerProfile(profile: MutexProfile): void {
  if (profile.mode !== "server") {
    throw new ConfigurationError(
      `profile '${profile.name}' uses direct mode`,
      "Select a server profile with -p NAME.",
    );
  }
  // Validation normally happens while parsing TOML. Keep this assertion at
  // the process boundary as well, because tests and future callers can build
  // profile objects directly.
  if (!profile.bindAddress || !profile.workingDir) {
    throw new ConfigurationError(
      `server profile '${profile.name}' needs bind_address and working_dir`,
    );
  }
  const paths = serverPaths(profile);
  if (!paths.logPath || !paths.pidPath) throw new Error("invalid server paths");
}

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

import { CONNECTION_ENV_VAR } from "../constants.js";
import { logError } from "../helpers.js";
import { ConsoleLogger } from "../logger.js";
import { helpText, parseCommandLine } from "./args.js";
import type { CommandName } from "./args.js";
import {
  commandList,
  commandLock,
  commandPrune,
  commandRenew,
  commandStatus,
  commandUnlock,
} from "./commands.js";
import type { CommandContext } from "./commands.js";
import { resolveConnectionString } from "./config.js";
import {
  ConfigurationError,
  EXIT_CONFIGURATION,
  EXIT_ERROR,
  EXIT_OK,
  EXIT_USAGE,
  UsageError,
} from "./exit-codes.js";
import { Output } from "./output.js";
import { readPackageVersion } from "../version.js";
import type { LockStore } from "../mutex.js";
import type { ServerAction } from "../server/lifecycle.js";

export async function main(argv: string[]): Promise<number> {
  let commandLine;
  try {
    commandLine = parseCommandLine(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(
        `mutex: ${error.message}\n\nRun 'mutex help' for usage.\n`,
      );
      return EXIT_USAGE;
    }
    throw error;
  }

  if (commandLine.command === "help") {
    process.stdout.write(helpText(commandLine.topic));
    return EXIT_OK;
  }

  if (commandLine.command === "version") {
    process.stdout.write(`${readPackageVersion()}\n`);
    return EXIT_OK;
  }

  const { options, identifier, program } = commandLine;
  const log = new ConsoleLogger(options.logLevel);

  if (commandLine.command === "profile" || commandLine.command === "server") {
    try {
      if (commandLine.command === "profile") {
        const { profileCommand } = await import("./profiles.js");
        await profileCommand(identifier);
        return EXIT_OK;
      }
      const { serverCommand } = await import("../server/lifecycle.js");
      return await serverCommand(
        identifier as ServerAction,
        options.profile,
        options.json,
        log,
      );
    } catch (error) {
      return reportError(error, log);
    }
  }

  // Querying commands put their data on stdout; acting commands report to
  // stderr, so `mutex lock` looks the same with or without a wrapped program
  // and never pollutes a pipeline. A wrapped program owns stdout outright.
  const wrapping = program.length > 0;
  const queries: CommandName[] = ["status", "list", "prune"];
  const out = new Output(
    !wrapping && queries.includes(commandLine.command)
      ? process.stdout
      : process.stderr,
    wrapping ? process.stderr : process.stdout,
    options.json,
    options.logLevel === "error",
  );

  let mutex: LockStore | undefined;
  try {
    const { selectProfile } = await import("./profiles.js");
    const selected = await selectProfile(options.profile);
    if (selected.profile.mode === "direct") {
      const connection = resolveConnectionString();
      log.debug(
        `Using direct profile '${selected.profile.name}' and the connection string from $${CONNECTION_ENV_VAR}.`,
      );
      const { DatabaseMutex } = await import("../database.js");
      mutex = new DatabaseMutex(
        {
          dbConnectionString: connection,
          expiration: options.expiration,
          sslNegotiation: selected.profile.sslNegotiation,
        },
        log,
      );
    } else {
      log.debug(
        `Using server profile '${selected.profile.name}' at ${selected.profile.bindAddress}.`,
      );
      const { TcpMutexStore } = await import("../server/tcp-store.js");
      mutex = new TcpMutexStore(
        selected.profile.bindAddress!,
        undefined,
        undefined,
        selected.profile.name,
      );
    }

    const context: CommandContext = { mutex, options, log, out };

    switch (commandLine.command) {
      case "lock":
      case "try-lock":
        return await commandLock(
          context,
          identifier,
          program,
          commandLine.command,
        );
      case "unlock":
        return await commandUnlock(context, identifier);
      case "renew":
        return await commandRenew(context, identifier);
      case "status":
        return await commandStatus(context, identifier);
      case "list":
        return await commandList(context);
      case "prune":
        return await commandPrune(context);
      default:
        throw new UsageError(`unknown command '${commandLine.command}'`);
    }
  } catch (error) {
    return reportError(error, log);
  } finally {
    // Postgres keeps sockets open; without this the process lingers.
    await mutex?.close();
  }
}

function reportError(error: unknown, log: ConsoleLogger): number {
  if (error instanceof UsageError) {
    process.stderr.write(
      `mutex: ${error.message}\n\nRun 'mutex help' for usage.\n`,
    );
    return EXIT_USAGE;
  }
  if (error instanceof ConfigurationError) {
    log.error(
      error.hint ? `${error.message}\n  hint: ${error.hint}` : error.message,
    );
    return EXIT_CONFIGURATION;
  }
  logError(log, error, null);
  return EXIT_ERROR;
}

main(process.argv.slice(2))
  .then((code) => {
    // Set the code rather than calling exit(), so buffered output still drains.
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(
      `mutex: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = EXIT_ERROR;
  });

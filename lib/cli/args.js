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
import { parseArgs } from "node:util";
import { CONNECTION_ENV_VAR } from "../constants.js";
import { DEFAULT_EXPIRATION_SECONDS, DEFAULT_MAX_WAIT_SECONDS, DEFAULT_POLL_INTERVAL_SECONDS, pollIntervalMs, pollTimeoutMs, } from "../timing.js";
import { UsageError } from "./exit-codes.js";
/** Shared by both acquiring commands. */
const ACQUIRE_OPTIONS = ["reason", "expiration", "no-renew", "owner"];
/** Only `lock` waits, so only `lock` takes the options that describe waiting. */
const LOCK_OPTIONS = [...ACQUIRE_OPTIONS, "max-wait", "poll-interval"];
const GENERAL_OPTIONS = [
    "profile",
    "json",
    "quiet",
    "verbose",
    "help",
];
export const COMMANDS = {
    lock: {
        summary: "Acquire a lock, waiting for it to become free",
        usage: "mutex lock <id> [options] [-- <program> [args...]]",
        identifier: "required",
        acceptsProgram: true,
        options: [...LOCK_OPTIONS, ...GENERAL_OPTIONS],
    },
    "try-lock": {
        summary: "Acquire a lock in a single attempt, without waiting",
        usage: "mutex try-lock <id> [options] [-- <program> [args...]]",
        identifier: "required",
        acceptsProgram: true,
        options: [...ACQUIRE_OPTIONS, ...GENERAL_OPTIONS],
    },
    unlock: {
        summary: "Release a lock",
        usage: "mutex unlock <id> [options]",
        identifier: "required",
        acceptsProgram: false,
        options: ["owner", "max-wait", "poll-interval", ...GENERAL_OPTIONS],
    },
    renew: {
        summary: "Extend a lock you already hold",
        usage: "mutex renew <id> [--owner <name>] [--expiration <seconds>]",
        identifier: "required",
        acceptsProgram: false,
        options: ["expiration", "owner", ...GENERAL_OPTIONS],
    },
    status: {
        summary: "Show who holds a lock",
        usage: "mutex status <id> [options]",
        identifier: "required",
        acceptsProgram: false,
        options: [...GENERAL_OPTIONS],
    },
    list: {
        summary: "List every lock, expired ones included",
        usage: "mutex list [options]",
        identifier: "none",
        acceptsProgram: false,
        options: [...GENERAL_OPTIONS],
    },
    prune: {
        summary: "Delete locks that have already expired",
        usage: "mutex prune [--dry-run] [options]",
        identifier: "none",
        acceptsProgram: false,
        options: ["dry-run", ...GENERAL_OPTIONS],
    },
    profile: {
        summary: "Choose the profile used by default",
        usage: "mutex profile [name]",
        identifier: "optional",
        acceptsProgram: false,
        options: ["help"],
    },
    server: {
        summary: "Start, run, inspect, or stop a local mutex server",
        usage: "mutex server <start|run|status|stop> [-p <name>]",
        identifier: "optional",
        acceptsProgram: false,
        options: [...GENERAL_OPTIONS],
    },
    help: {
        summary: "Show this help, or help for one command",
        usage: "mutex help [command]",
        identifier: "none",
        acceptsProgram: false,
        options: [...GENERAL_OPTIONS],
    },
    version: {
        summary: "Print the mutex version",
        usage: "mutex version",
        identifier: "none",
        acceptsProgram: false,
        options: [...GENERAL_OPTIONS],
    },
};
const OPTION_CONFIG = {
    reason: { type: "string", short: "r" },
    expiration: { type: "string", short: "e" },
    "max-wait": { type: "string", short: "w" },
    "poll-interval": { type: "string", short: "i" },
    "no-renew": { type: "boolean" },
    owner: { type: "string", short: "o" },
    "dry-run": { type: "boolean" },
    profile: { type: "string", short: "p" },
    json: { type: "boolean" },
    quiet: { type: "boolean", short: "q" },
    verbose: { type: "boolean" },
    help: { type: "boolean", short: "h" },
};
/**
 * `renew` leases longer than `lock` does, because the two answer different
 * questions: a lock says how long the work is expected to take, a renewal says
 * how much longer it needs. Renewing is also the point at which a short
 * default is most expensive - it is called by things that have already been
 * running a while.
 */
export const DEFAULT_RENEW_EXPIRATION_SECONDS = 3600;
export function parseCommandLine(argv) {
    // Split on `--` before parsing, so the wrapped program's own flags are never
    // mistaken for mutex's.
    const separator = argv.indexOf("--");
    const own = separator === -1 ? argv : argv.slice(0, separator);
    const program = separator === -1 ? [] : argv.slice(separator + 1);
    let parsed;
    try {
        parsed = parseArgs({
            args: own,
            options: OPTION_CONFIG,
            allowPositionals: true,
            strict: true,
        });
    }
    catch (error) {
        throw new UsageError(error instanceof Error ? error.message : String(error));
    }
    const values = parsed.values;
    const positionals = parsed.positionals;
    // `--help`/`--version` win over whatever command was typed.
    let command;
    let topic = null;
    if (values.help) {
        command = "help";
        topic = asCommandName(positionals[0]) ?? null;
    }
    else if (positionals.length === 0) {
        command = "help";
    }
    else {
        const name = asCommandName(positionals[0]);
        if (!name) {
            throw new UsageError(`unknown command '${positionals[0]}'`);
        }
        command = name;
        if (command === "help") {
            topic = asCommandName(positionals[1]) ?? null;
        }
    }
    const spec = COMMANDS[command];
    const identifier = command === "help" ? "" : (positionals[1] ?? "");
    if (command !== "help") {
        if (spec.identifier === "required" && identifier === "") {
            throw new UsageError(`'${command}' needs a lock id\n  ${spec.usage}`);
        }
        const expected = spec.identifier === "none" ? 1 : 2;
        if (positionals.length > expected) {
            throw new UsageError(`unexpected argument '${positionals[expected]}'\n  ${spec.usage}`);
        }
    }
    if (command === "server" &&
        !["start", "run", "status", "stop"].includes(identifier)) {
        throw new UsageError(`'server' needs one of start, run, status, or stop\n  ${spec.usage}`);
    }
    if (program.length > 0 && !spec.acceptsProgram) {
        throw new UsageError(`'${command}' cannot wrap a program`);
    }
    // Not when asking for help: `mutex lock id -e 30 --help` is someone who
    // wants to know what --expiration does, and answering "'help' does not take
    // --expiration" is the least useful thing to say to them.
    if (command !== "help") {
        rejectInapplicableOptions(command, spec, values);
    }
    return {
        command,
        identifier,
        program,
        topic,
        options: resolveOptions(command, values),
    };
}
function resolveOptions(command, values) {
    const expiration = readNumber(values.expiration, "expiration", command === "renew"
        ? DEFAULT_RENEW_EXPIRATION_SECONDS
        : DEFAULT_EXPIRATION_SECONDS);
    if (expiration <= 0) {
        throw new UsageError("--expiration must be greater than 0");
    }
    const pollInterval = readNumber(values["poll-interval"], "poll-interval", DEFAULT_POLL_INTERVAL_SECONDS);
    if (pollInterval < 0) {
        throw new UsageError("--poll-interval cannot be negative");
    }
    const maxWait = readNumber(values["max-wait"], "max-wait", DEFAULT_MAX_WAIT_SECONDS);
    if (maxWait < DEFAULT_MAX_WAIT_SECONDS) {
        throw new UsageError(`--max-wait cannot be below ${DEFAULT_MAX_WAIT_SECONDS}, which already means "as long as the lease"`);
    }
    return {
        reason: typeof values.reason === "string" ? values.reason : "",
        expiration,
        // try-lock is exactly one attempt: no waiting, whatever else was passed.
        pollTimeoutMs: command === "try-lock" ? 0 : pollTimeoutMs(expiration, maxWait),
        pollIntervalMs: pollIntervalMs(pollInterval),
        autoRenew: values["no-renew"] !== true,
        owner: readOwner(values.owner),
        dryRun: values["dry-run"] === true,
        json: values.json === true,
        logLevel: values.quiet === true
            ? "error"
            : values.verbose === true
                ? "debug"
                : "info",
        profile: typeof values.profile === "string" && values.profile.trim()
            ? values.profile.trim()
            : null,
    };
}
/**
 * Who is taking the lock, or null when nobody says.
 *
 * Unowned is the default on purpose: it matches the GitHub Action's default, so
 * an unowned caller can unlock and renew an unowned lock, whichever of the two
 * took it. Naming an owner is what opts into the stricter guards.
 */
export function defaultOwner() {
    return process.env.MUTEX_OWNER?.trim() || null;
}
/**
 * An owner given on the command line, or the default.
 *
 * Blank counts as unowned, so `--owner "$CI_RUN"` degrades to unowned rather
 * than to an owner literally named "" when the variable is unset.
 */
function readOwner(value) {
    if (typeof value === "string") {
        return value.trim() || null;
    }
    return defaultOwner();
}
function rejectInapplicableOptions(command, spec, values) {
    const allowed = new Set(spec.options);
    for (const [name, value] of Object.entries(values)) {
        if (value === undefined || allowed.has(name)) {
            continue;
        }
        throw new UsageError(`'${command}' does not take --${name}\n  ${spec.usage}`);
    }
}
/** A whole number of seconds, and nothing else pretending to be one. */
const WHOLE_SECONDS = /^-?\d+$/;
function readNumber(value, name, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }
    // `-e=45` is a habit worth tolerating: node's parseArgs keeps the '=' for
    // short options, so the value arrives as "=45".
    const text = value.startsWith("=") ? value.slice(1) : value;
    // Number() alone is far too generous here: "" is 0, so `-e "$UNSET"` would
    // silently mean zero; "0x3c" is 60; "1e21" is an integer that reaches
    // Postgres as a syntax error. Only digits.
    if (!WHOLE_SECONDS.test(text)) {
        throw new UsageError(`--${name} must be a whole number of seconds, not '${value}'`);
    }
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed)) {
        throw new UsageError(`--${name} is out of range: '${value}'`);
    }
    return parsed;
}
function asCommandName(value) {
    // hasOwn, not `in`: `"toString" in COMMANDS` is true, and would be accepted
    // as a command whose spec is undefined.
    if (value && Object.hasOwn(COMMANDS, value)) {
        return value;
    }
    return null;
}
export function helpText(topic) {
    if (topic && topic !== "help") {
        const spec = COMMANDS[topic];
        return [
            spec.summary,
            "",
            `Usage: ${spec.usage}`,
            "",
            "Options:",
            ...spec.options.map((name) => `  --${name}`),
            "",
        ].join("\n");
    }
    const commands = Object.keys(COMMANDS)
        .map((name) => `  ${name.padEnd(10)} ${COMMANDS[name].summary}`)
        .join("\n");
    return `mutex - an advisory lock service for CI/CD pipelines, backed by PostgreSQL

Usage: mutex <command> [<id>] [options] [-- <program> [args...]]

Commands:
${commands}

renew extends a lock you already hold: the id and the owner must both match,
and it fails - rather than taking a new lock - if the lock expired or is gone.
It only ever moves an expiry further out, never nearer.

Lock options:
  -r, --reason <text>            Why the lock is being taken
  -e, --expiration <seconds>     How long the lock lasts (default: ${DEFAULT_EXPIRATION_SECONDS};
                                 renew: ${DEFAULT_RENEW_EXPIRATION_SECONDS}, and never shortens a lease)
  -w, --max-wait <seconds>       How long to wait for it (default: -1, i.e. --expiration)
  -i, --poll-interval <seconds>  Delay between attempts (default: ${DEFAULT_POLL_INTERVAL_SECONDS})
      --no-renew                 Do not renew the lock while a wrapped program runs
  -o, --owner <name>             Who is taking the lock (default: $MUTEX_OWNER, else unowned)

prune:
      --dry-run                  List what would be deleted, and delete nothing

General:
  -p, --profile <name>           Use this profile for one command
      --json                     Machine-readable output
  -q, --quiet                    Errors only
      --verbose                  Include debug output
  -h, --help                     Show help

Profiles select explicit server or direct access. Run "mutex profile" to set
one up or choose it, or pass -p <name> for one command. With no profiles file,
a valid $${CONNECTION_ENV_VAR} keeps direct access zero-configuration.

Direct commands and the server process read the connection string from
$${CONNECTION_ENV_VAR}. It is never accepted as an argument or stored in the
profiles file. Whatever manages the secret only needs to make it visible in
the process environment.

Exit codes: 0 ok, 1 error, 2 usage, 3 configuration, 4 not acquired / not held,
5 refused (owned by another). While wrapping a program, its status is returned.
`;
}
//# sourceMappingURL=args.js.map
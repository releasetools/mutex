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
 */

import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createInterface } from "node:readline/promises";
import { CONNECTION_ENV_VAR } from "../constants.js";
import { SslNegotiation } from "../connection.js";
import { ConfigurationError, UsageError } from "./exit-codes.js";

export const DEFAULT_BIND_ADDRESS = "localhost:5625";
export const PROFILES_FILENAME = "profiles.toml";

export type ProfileMode = "server" | "direct";

export interface MutexProfile {
  name: string;
  mode: ProfileMode;
  enabled: boolean;
  bindAddress?: string;
  workingDir?: string;
  /**
   * `direct` skips a round trip in the TLS handshake and needs PostgreSQL 17
   * or newer. It lives here rather than only in the connection string because
   * the connection string is a secret, often issued by somebody else, and this
   * is a property of the server it points at rather than a credential.
   */
  sslNegotiation?: SslNegotiation;
}

export interface ProfilesFile {
  path: string;
  profiles: MutexProfile[];
}

export interface SelectedProfile {
  profile: MutexProfile;
  /** Null for the zero-configuration direct path. */
  configPath: string | null;
}

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function profilesDirectory(
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): string {
  return env.XDG_CONFIG_HOME
    ? path.join(path.resolve(env.XDG_CONFIG_HOME), "releasetools-mutex")
    : path.join(home, ".config", "releasetools-mutex");
}

export function profilesPath(
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): string {
  return path.join(profilesDirectory(env, home), PROFILES_FILENAME);
}

/** A deliberately small TOML reader for the four profile keys we own. */
export function parseProfiles(
  text: string,
  filePath = PROFILES_FILENAME,
  requireEnabled = true,
): MutexProfile[] {
  const sections = new Map<string, Record<string, string | boolean>>();
  let current: Record<string, string | boolean> | null = null;

  for (const [index, original] of text.split(/\r?\n/).entries()) {
    const line = stripComment(original).trim();
    if (!line) {
      continue;
    }

    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) {
      const name = section[1].trim();
      if (!PROFILE_NAME.test(name)) {
        throw profileError(filePath, index, `invalid profile name '${name}'`);
      }
      if (sections.has(name)) {
        throw profileError(filePath, index, `duplicate profile '${name}'`);
      }
      current = {};
      sections.set(name, current);
      continue;
    }

    if (!current) {
      throw profileError(filePath, index, "setting outside a profile section");
    }
    const setting = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.+)$/.exec(line);
    if (!setting) {
      throw profileError(filePath, index, "expected key = value");
    }
    const [, key, raw] = setting;
    if (Object.hasOwn(current, key)) {
      throw profileError(filePath, index, `duplicate setting '${key}'`);
    }
    current[key] = parseValue(raw, filePath, index);
  }

  if (sections.size === 0) {
    throw new ConfigurationError(`no profiles are defined in ${filePath}`);
  }

  const profiles = [...sections].map(([name, values]) =>
    validateProfile(name, values, filePath),
  );
  const enabled = profiles.filter((profile) => profile.enabled);
  if (requireEnabled && enabled.length !== 1) {
    throw new ConfigurationError(
      `${filePath} must enable exactly one profile; found ${enabled.length}`,
      "Run 'mutex profile NAME' to choose one.",
    );
  }
  return profiles;
}

export function formatProfiles(profiles: MutexProfile[]): string {
  return `${profiles
    .map((profile) => {
      const lines = [
        `[${profile.name}]`,
        `mode = ${JSON.stringify(profile.mode)}`,
        `enabled = ${profile.enabled}`,
      ];
      if (profile.mode === "server") {
        lines.push(`bind_address = ${JSON.stringify(profile.bindAddress)}`);
        lines.push(`working_dir = ${JSON.stringify(profile.workingDir)}`);
      }
      if (profile.sslNegotiation) {
        lines.push(
          `ssl_negotiation = ${JSON.stringify(profile.sslNegotiation)}`,
        );
      }
      return lines.join("\n");
    })
    .join("\n\n")}\n`;
}

export async function loadProfiles(
  filePath = profilesPath(),
  requireEnabled = true,
): Promise<ProfilesFile | null> {
  try {
    const text = await readFile(filePath, "utf8");
    return {
      path: filePath,
      profiles: parseProfiles(text, filePath, requireEnabled),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function ensureProfiles(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stderr,
  filePath = profilesPath(),
): Promise<ProfilesFile> {
  const existing = await loadProfiles(filePath);
  if (existing) {
    return existing;
  }

  const suggested = path.dirname(filePath);
  let workingDir = suggested;
  if (input.isTTY) {
    const prompt = createInterface({ input, output });
    try {
      const answer = await prompt.question(
        `Working directory [${suggested}]: `,
      );
      if (answer.trim()) {
        workingDir = expandHome(answer.trim());
      }
    } finally {
      prompt.close();
    }
  }
  workingDir = path.resolve(workingDir);

  const profiles: MutexProfile[] = [
    {
      name: "server",
      mode: "server",
      enabled: true,
      bindAddress: DEFAULT_BIND_ADDRESS,
      workingDir,
    },
    { name: "direct", mode: "direct", enabled: false },
  ];
  const formatted = formatProfiles(profiles);

  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await mkdir(workingDir, { recursive: true, mode: 0o700 });
  await writeAtomic(filePath, formatted);
  output.write(`\n${formatted}Configuration written to ${filePath}\n`);
  return { path: filePath, profiles };
}

export async function selectProfile(
  requestedName: string | null,
  filePath = profilesPath(),
): Promise<SelectedProfile> {
  const loaded = await loadProfiles(filePath);
  if (!loaded) {
    if (requestedName) {
      throw new ConfigurationError(
        `profile '${requestedName}' is not defined because ${filePath} does not exist`,
        "Run 'mutex profile' to create it.",
      );
    }
    if (process.env[CONNECTION_ENV_VAR]) {
      return {
        configPath: null,
        profile: { name: "direct", mode: "direct", enabled: true },
      };
    }
    throw new ConfigurationError(
      `no mutex profile and ${CONNECTION_ENV_VAR} is not set`,
      "Run 'mutex profile' to configure the server, or export MUTEX_DATABASE_URL for direct access.",
    );
  }

  const profile = requestedName
    ? loaded.profiles.find((candidate) => candidate.name === requestedName)
    : loaded.profiles.find((candidate) => candidate.enabled);
  if (!profile) {
    throw new ConfigurationError(
      `profile '${requestedName}' is not defined`,
      `Defined profiles: ${loaded.profiles.map(({ name }) => name).join(", ")}`,
    );
  }
  return { profile, configPath: loaded.path };
}

export async function activateProfile(
  name: string,
  filePath = profilesPath(),
): Promise<ProfilesFile> {
  const loaded = await loadProfiles(filePath, false);
  if (!loaded) {
    throw new ConfigurationError(
      `${filePath} does not exist`,
      "Run 'mutex profile' to create it.",
    );
  }
  if (!loaded.profiles.some((profile) => profile.name === name)) {
    throw new UsageError(
      `unknown profile '${name}'\nDefined profiles: ${loaded.profiles
        .map((profile) => profile.name)
        .join(", ")}`,
    );
  }
  const profiles = loaded.profiles.map((profile) => ({
    ...profile,
    enabled: profile.name === name,
  }));
  await writeAtomic(filePath, formatProfiles(profiles));
  return { path: filePath, profiles };
}

export function formatProfileList(profiles: MutexProfile[]): string {
  return `${profiles
    .map(
      (profile) =>
        `${profile.enabled ? "*" : " "} ${profile.name} (${profile.mode})`,
    )
    .join("\n")}\n`;
}

export async function chooseProfile(
  loaded: ProfilesFile,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stderr,
): Promise<string | null> {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    output.write(formatProfileList(loaded.profiles));
    return null;
  }

  let selected = Math.max(
    loaded.profiles.findIndex((profile) => profile.enabled),
    0,
  );
  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  const render = (first = false) => {
    if (!first) {
      output.write(`\x1b[${loaded.profiles.length}A`);
    }
    for (const [index, profile] of loaded.profiles.entries()) {
      output.write(
        `\x1b[2K${index === selected ? ">" : " "} ${profile.name} (${profile.mode})\n`,
      );
    }
  };
  output.write("Select a mutex profile with ↑/↓ and Enter:\n");
  render(true);

  return new Promise<string>((resolve, reject) => {
    const finish = (name?: string, error?: Error) => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
      if (error) {
        reject(error);
      } else {
        resolve(name!);
      }
    };
    const onKeypress = (
      _text: string,
      key: { name?: string; ctrl?: boolean },
    ) => {
      if (key.ctrl && key.name === "c") {
        finish(undefined, new UsageError("profile selection cancelled"));
      } else if (key.name === "up") {
        selected =
          (selected - 1 + loaded.profiles.length) % loaded.profiles.length;
        render();
      } else if (key.name === "down") {
        selected = (selected + 1) % loaded.profiles.length;
        render();
      } else if (key.name === "return" || key.name === "enter") {
        finish(loaded.profiles[selected].name);
      }
    };
    input.on("keypress", onKeypress);
  });
}

export async function profileCommand(name: string): Promise<void> {
  if (name) {
    const filePath = profilesPath();
    if (!(await profileFileExists(filePath))) {
      await ensureProfiles(process.stdin, process.stderr, filePath);
    }
    await activateProfile(name, filePath);
    process.stderr.write(`Enabled profile '${name}' in ${filePath}\n`);
    return;
  }
  const filePath = profilesPath();
  const loaded =
    (await loadProfiles(filePath, false)) ??
    (await ensureProfiles(process.stdin, process.stderr, filePath));
  const selected = await chooseProfile(loaded);
  if (selected) {
    await activateProfile(selected, loaded.path);
    process.stderr.write(`Enabled profile '${selected}' in ${loaded.path}\n`);
  }
}

async function writeAtomic(filePath: string, contents: string): Promise<void> {
  const temporary = `${filePath}.${process.pid}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporary, filePath);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function validateProfile(
  name: string,
  values: Record<string, string | boolean>,
  filePath: string,
): MutexProfile {
  const allowed = new Set([
    "mode",
    "enabled",
    "bind_address",
    "working_dir",
    "ssl_negotiation",
  ]);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      throw new ConfigurationError(
        `unknown setting '${key}' in [${name}] of ${filePath}`,
      );
    }
  }
  if (
    values.ssl_negotiation !== undefined &&
    values.ssl_negotiation !== "postgres" &&
    values.ssl_negotiation !== "direct"
  ) {
    throw new ConfigurationError(
      `[${name}] in ${filePath} needs ssl_negotiation = "postgres" or "direct"`,
      "direct saves a round trip and requires PostgreSQL 17 or newer.",
    );
  }
  const sslNegotiation = values.ssl_negotiation as SslNegotiation | undefined;
  if (values.mode !== "server" && values.mode !== "direct") {
    throw new ConfigurationError(
      `[${name}] in ${filePath} needs mode = "server" or "direct"`,
    );
  }
  if (typeof values.enabled !== "boolean") {
    throw new ConfigurationError(
      `[${name}] in ${filePath} needs enabled = true or false`,
    );
  }

  if (values.mode === "direct") {
    if (values.bind_address !== undefined || values.working_dir !== undefined) {
      throw new ConfigurationError(
        `[${name}] is direct and must not define bind_address or working_dir`,
      );
    }
    return { name, mode: "direct", enabled: values.enabled, sslNegotiation };
  }

  if (typeof values.bind_address !== "string" || !values.bind_address) {
    throw new ConfigurationError(`[${name}] needs a non-empty bind_address`);
  }
  if (typeof values.working_dir !== "string" || !values.working_dir) {
    throw new ConfigurationError(`[${name}] needs a non-empty working_dir`);
  }
  if (!path.isAbsolute(values.working_dir)) {
    throw new ConfigurationError(
      `[${name}] working_dir must be an absolute path`,
    );
  }
  return {
    name,
    mode: "server",
    enabled: values.enabled,
    bindAddress: values.bind_address,
    workingDir: values.working_dir,
    sslNegotiation,
  };
}

function parseValue(
  raw: string,
  filePath: string,
  index: number,
): string | boolean {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const value = JSON.parse(raw) as unknown;
      if (typeof value === "string") return value;
    } catch {
      // Replaced with the line-aware error below.
    }
  }
  throw profileError(
    filePath,
    index,
    "values must be quoted strings or lowercase booleans",
  );
}

function stripComment(line: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\" && quoted) {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "#" && !quoted) {
      return line.slice(0, index);
    }
  }
  return line;
}

function profileError(
  filePath: string,
  zeroBasedLine: number,
  message: string,
) {
  return new ConfigurationError(`${filePath}:${zeroBasedLine + 1}: ${message}`);
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

/** Used by service setup tests without opening the file. */
export async function profileFileExists(
  filePath = profilesPath(),
): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

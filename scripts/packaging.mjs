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
import os from "node:os";
import path from "node:path";

/**
 * What the two packaging commands need to agree about.
 *
 * `package-release.mjs` assembles the Action and the npm package;
 * `package-plugin.mjs` assembles the agent plugin. Both copy a named list out
 * of this repository into a directory they emptied first, and both were written
 * on the assumption that a name on the list is the file it looks like. These
 * are the checks that make that assumption true.
 */

/**
 * Decides whether an output directory may be emptied.
 *
 * Assembling has to start from nothing - a file the previous version shipped
 * and this one does not would otherwise be published forever - so `--out` is
 * deleted rather than written over. That makes it the most expensive argument
 * either command takes.
 *
 * Two rules. It may not contain the checkout, which rules out the filesystem
 * root, a home directory and the checkout itself in one comparison. And it may
 * not hold anything the command did not put there: `marker` is a real file the
 * command always writes, so an empty directory is fine and its own previous
 * output is fine, while somebody's notes are one typo away from being an
 * argument here and should cost an error message rather than the notes.
 */
export function refuseToEmpty(target, source, { marker, what }) {
  const within = path.relative(target, source);
  if (within === "" || (!within.startsWith("..") && !path.isAbsolute(within))) {
    throw new Error(
      `--out ${target} contains the checkout, which it would delete`,
    );
  }
  if (target === os.homedir()) {
    throw new Error(`--out ${target} is your home directory`);
  }

  let stats;
  try {
    stats = fs.lstatSync(target);
  } catch {
    return;
  }
  if (!stats.isDirectory()) {
    throw new Error(`--out ${target} is not a directory`);
  }
  // `isRegularFile`, not `existsSync`, for the reason everything else in this
  // file exists: a link at the marker's path answers for whatever it points at,
  // and that is the whole safeguard talked out of refusing.
  if (
    fs.readdirSync(target).length > 0 &&
    !isRegularFile(path.join(target, marker))
  ) {
    throw new Error(
      `--out ${target} holds something other than ${what}; refusing to empty it`,
    );
  }
}

/**
 * A real file, not a link to one somewhere else.
 *
 * The copy lists are the whole security boundary: this repository holds tests,
 * a build tree and a benchmark runner that takes a connection string, and what
 * gets published is supposed to be the handful of names on the list. A name
 * that resolves elsewhere publishes whatever is at the other end, so the check
 * has to be `lstat` - `existsSync` follows the link and answers about the
 * destination.
 */
export function isRegularFile(file) {
  return statOf(file)?.isFile() ?? false;
}

/** A real directory, for the same reason. `cp -r` would follow a link to one. */
export function isRealDirectory(directory) {
  return statOf(directory)?.isDirectory() ?? false;
}

function statOf(entry) {
  try {
    return fs.lstatSync(entry);
  } catch {
    return null;
  }
}

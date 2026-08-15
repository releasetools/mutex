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
import { findSecenvFile, parseSecenv } from "../src/dotsecenv/secenv.js";

const FILE = "/project/.secenv";

function entries(content: string) {
  return parseSecenv(content, FILE).entries;
}

function issues(content: string) {
  return parseSecenv(content, FILE).issues;
}

describe("parseSecenv", () => {
  it("reads plain values", () => {
    expect(entries("HOST=localhost")).toEqual([
      { key: "HOST", kind: "plain", value: "localhost", file: FILE, line: 1 },
    ]);
  });

  it("strips matching surrounding quotes", () => {
    expect(entries('NAME="My Application"')[0].value).toBe("My Application");
    expect(entries("NAME='Has spaces'")[0].value).toBe("Has spaces");
  });

  it("leaves unbalanced or inner quotes alone", () => {
    expect(entries('NAME="unterminated')[0].value).toBe('"unterminated');
    expect(entries('NAME=a"b"c')[0].value).toBe('a"b"c');
    expect(entries('NAME="')[0].value).toBe('"');
  });

  it("keeps whitespace inside a value but trims the line", () => {
    expect(entries("  KEY=  spaced  ")[0].value).toBe("  spaced");
  });

  it("treats {dotsecenv} as a secret named after the key", () => {
    expect(entries("DATABASE_PASSWORD={dotsecenv}")[0]).toMatchObject({
      key: "DATABASE_PASSWORD",
      kind: "secret",
      value: "DATABASE_PASSWORD",
    });
  });

  it("treats an empty {dotsecenv/} the same way", () => {
    expect(entries("MY_API_KEY={dotsecenv/}")[0]).toMatchObject({
      kind: "secret",
      value: "MY_API_KEY",
    });
  });

  it("reads an explicit secret name", () => {
    expect(entries("MY_API_KEY={dotsecenv/API_KEY}")[0]).toMatchObject({
      key: "MY_API_KEY",
      kind: "secret",
      value: "API_KEY",
    });
  });

  it("reads a namespaced secret name", () => {
    expect(entries("DB_PASS={dotsecenv/prod::DB_PASSWORD}")[0]).toMatchObject({
      kind: "secret",
      value: "prod::DB_PASSWORD",
    });
  });

  it("recognises a secret reference even when it is quoted", () => {
    expect(entries('DB="{dotsecenv/prod::DB}"')[0]).toMatchObject({
      kind: "secret",
      value: "prod::DB",
    });
  });

  it("rejects a reference with more than one slash", () => {
    expect(issues("A={dotsecenv/a/b}")[0].message).toMatch(
      /only one '\/' allowed/,
    );
    expect(entries("A={dotsecenv/a/b}")).toHaveLength(0);
  });

  it("rejects a malformed secret name", () => {
    expect(issues("A={dotsecenv/9bad}")[0].message).toMatch(
      /invalid secret name/,
    );
    expect(issues("A={dotsecenv/a::b::c}")[0].message).toMatch(
      /invalid secret name/,
    );
  });

  it("ignores comments, blank lines and non-assignments", () => {
    const parsed = parseSecenv(
      [
        "# a comment",
        "   # indented comment",
        "",
        "   ",
        "not an assignment",
      ].join("\n"),
      FILE,
    );
    expect(parsed.entries).toHaveLength(0);
    expect(parsed.issues).toHaveLength(0);
  });

  it("ignores keys that are not valid variable names", () => {
    expect(entries("9INVALID=x")).toHaveLength(0);
    expect(entries("has-dash=x")).toHaveLength(0);
    expect(entries("_ok=x")).toHaveLength(1);
  });

  it("splits on the first '=' only", () => {
    expect(entries("URL=postgres://u:p@h/db?a=b")[0].value).toBe(
      "postgres://u:p@h/db?a=b",
    );
  });

  it("survives CRLF line endings", () => {
    const parsed = parseSecenv("A=1\r\nB={dotsecenv/}\r\n", FILE);
    expect(parsed.entries).toEqual([
      { key: "A", kind: "plain", value: "1", file: FILE, line: 1 },
      { key: "B", kind: "secret", value: "B", file: FILE, line: 2 },
    ]);
  });

  it("records the line each entry came from", () => {
    expect(entries("A=1\nB=2\n\nC=3")[2].line).toBe(4);
  });
});

describe("findSecenvFile", () => {
  let parent: string;
  let dir: string;

  beforeEach(() => {
    parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "secenv-")));
    dir = path.join(parent, "project");
    fs.mkdirSync(dir);
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("finds the .secenv in the given directory", () => {
    fs.writeFileSync(path.join(dir, ".secenv"), "A=1");
    expect(findSecenvFile(dir)).toBe(path.join(dir, ".secenv"));
  });

  it("returns null when there is none", () => {
    expect(findSecenvFile(dir)).toBeNull();
  });

  /**
   * No upward search. An upward search has to stop somewhere, and outside a
   * repository there is no sensible somewhere - from /tmp/build-1234 it would
   * reach world-writable /tmp, where anyone could plant the file that decides
   * which database mutex locks against.
   */
  it("does not look in the parent directory", () => {
    fs.writeFileSync(path.join(parent, ".secenv"), "OUTSIDE=1");
    expect(findSecenvFile(dir)).toBeNull();
  });

  it("does not look in a child directory", () => {
    const child = path.join(dir, "services");
    fs.mkdirSync(child);
    fs.writeFileSync(path.join(child, ".secenv"), "B=2");
    expect(findSecenvFile(dir)).toBeNull();
  });

  it("ignores a .secenv that is a directory", () => {
    fs.mkdirSync(path.join(dir, ".secenv"));
    expect(findSecenvFile(dir)).toBeNull();
  });

  it("resolves a relative directory", () => {
    fs.writeFileSync(path.join(dir, ".secenv"), "A=1");
    const found = findSecenvFile(dir);
    expect(found).toBe(path.resolve(dir, ".secenv"));
  });
});

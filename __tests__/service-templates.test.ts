/*
 * Copyright (c) 2025-2026 Mihai Bojin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { readFile } from "node:fs/promises";

describe("service-manager templates", () => {
  it("runs systemd in the foreground with an instance profile", async () => {
    const unit = await readFile(
      "contrib/systemd/releasetools-mutex@.service",
      "utf8",
    );
    expect(unit).toContain("User=mutex");
    expect(unit).toContain("Group=mutex");
    expect(unit).toContain("EnvironmentFile=/etc/releasetools-mutex/%i.env");
    expect(unit).toContain("ExecStart=/usr/local/bin/mutex server run -p %i");
    expect(unit).not.toContain("server start");
  });

  it("ships a rootless LaunchAgent that calls the secure wrapper", async () => {
    const plist = await readFile(
      "contrib/launchd/com.releasetools.mutex.plist",
      "utf8",
    );
    expect(plist).not.toContain("<key>UserName</key>");
    expect(plist).not.toContain("<key>GroupName</key>");
    expect(plist).toContain(
      "/Users/YOUR_USERNAME/.config/releasetools-mutex/run-mutex-server.zsh",
    );
    expect(plist).toContain("/Users/YOUR_USERNAME/.config/releasetools-mutex");
    expect(plist).not.toContain("/usr/local/var");
    expect(plist).not.toContain("MUTEX_DATABASE_URL");
    expect(plist).not.toContain("REPLACE_WITH_DATABASE_URL");
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
    expect(plist).not.toContain("<string>start</string>");
  });

  it("resolves the macOS database URL through dotsecenv outside the plist", async () => {
    const wrapper = await readFile(
      "contrib/launchd/run-mutex-server.zsh",
      "utf8",
    );
    expect(wrapper).toContain('cd "$MUTEX_WORKING_DIR"');
    expect(wrapper).toContain(
      '"$DOTSECENV_EXECUTABLE" --silent secret get "$DOTSECENV_SECRET"',
    );
    expect(wrapper).toContain("export MUTEX_DATABASE_URL");
    expect(wrapper).toContain('exec "$MUTEX_EXECUTABLE" server run -p server');
  });
});

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

  it("ships a valid LaunchDaemon using foreground run and a profile", async () => {
    const plist = await readFile(
      "contrib/launchd/com.releasetools.mutex.plist",
      "utf8",
    );
    expect(plist).toContain("<key>UserName</key>");
    expect(plist).toContain("<key>GroupName</key>");
    expect(plist).toContain("<string>run</string>");
    expect(plist).toContain("<string>-p</string>");
    expect(plist).not.toContain("<string>start</string>");
  });
});

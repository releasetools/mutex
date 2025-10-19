# mutex

[![CodeQL](https://github.com/releasetools/mutex/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/releasetools/mutex/security/code-scanning)

An advisory lock service for CI/CD pipelines, implemented as a GitHub Action. It prevents race conditions by ensuring mutual exclusion - only one job can access a shared resource concurrently.

## How it works

This action uses a PostgreSQL database to manage locks. When a workflow job needs to acquire a lock, it communicates with the lock service. If the lock is available, it's granted, and the job proceeds. If not, the job can wait or fail, depending on your workflow configuration.

## Features

- **Advisory Locking**: Create and manage locks within your GitHub Actions workflows.
- **Pull Request Integration**: Lock and release events are posted as PR comments.
- **Slack Notifications**: Choose if you want to be notified in your Slack channels about locking events.
- **Easy Disabling**: Skip locking for specific pull requests by:
  - adding a `SKIP_MUTEX` label
  - including `SKIP_MUTEX` in the PR's description or comment
  - or defining `SKIP_MUTEX=1` as an environment variable.

## Usage Example

Here is an example of how to use the `mutex` action in a workflow:

```yaml
- name: Acquire Lock
  uses: releasetools/mutex@v1
  permissions:
    contents: read
    pull-requests: write
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
  with:
    command: "lock"
    id: "my-resource"
    slack-channel: "#ci-cd"
```

Any other workflows or actions using a `mutex` on the same lock `id`, will not run until the lock is released.

## Configuration

### Prerequisites

- A **PostgreSQL database**: This action requires access to a PostgreSQL database to store lock information. You can use any standard Postgres provider. If you need a free one for getting started, consider using [Neon](https://neon.new).

### Environment Variables

The action supports the following environment variables (`env:`).

#### `DATABASE_URL`

Connection string for a PostgreSQL database. The action will create a table named `releasetools_mutex` if it doesn't exist. If the role specified in the connection string cannot create tables, ensure such a table exists. You can find the schema definition in [database.ts](./src/database.ts).

#### `GITHUB_TOKEN`

The action needs access to the GitHub API. It can be passed via `${{ secrets.GITHUB_TOKEN }}`. The workflow needs additional permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
```

#### `SLACK_BOT_TOKEN`

The Slack Bot Token for sending notifications. It requires the `chat:write` permission, and the associated bot must be invited to the specified `slack-channel`, otherwise it will fail to post.

### Action Inputs

The action can be configured using inputs (`with:`).

#### `command`

**Required.** The command to execute (e.g., `lock` or `release`).

#### `id`

**Required.** A unique identifier for the lock.

#### `reason`

Optional reason for taking the lock. Useful to provide context regarding which service took the lock and why.

#### `expiration`

Lock expiration in seconds from current time. Defaults to 60 seconds in the future.

#### `max-wait`

Maximum time in seconds to wait to acquire the lock, before failing.
If not specified, it defaults to `-1` which results in using the specified `expiration` as a timeout for the current run.

#### `poll-interval`

Allows changing the polling interval. Useful for long-duration locks.

#### `auto-release`

Used to signal if a lock should be automatically released when the workflow job ends. Defaults to `true`.

#### `disable-pr-updates`

By default, a comment will be posted on the Pull Request running the action, when locks are acquired or released.
Set it to `true` to never post comments on PRs.

#### `slack-channel`

**Required for Slack notifications.** The Slack channel to post updates to (e.g., `C12345678`).
The bot that owns the `SLACK_BOT_TOKEN` should be a member of this channel.

See [Slack API docs](https://docs.slack.dev/reference/methods/chat.postMessage/#channels) for channel ID formats.

## Development

**All contributions are welcome!**

1. Clone the repository:

   ```shell
   git clone https://github.com/releasetools/mutex.git
   cd mutex
   ```

2. Install dependencies and pre-commit hooks:

   ```shell
    npm install
    npm run prepare
   ```

The main entry point is `main.ts`, which handles 'lock' or 'release' actions. A post-job script in `post.ts` handles automatic lock release if enabled.

You can learn about creating GitHub actions in this [tutorial](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action).

## Releasing

You can use [releasetools-cli](https://github.com/releasetools/cli) to create release tags.

Run this command to tag the HEAD commit and also update the `v1` tag.

```shell
releasetools git::release --major --sign --force --push v1.0.2
```

Since `mutex` is a Javascript-based action, no other step is needed to make a new release available.

### Release notes

Use the template below to draft new releases. Update the changelog section to include all relevant changes/features/bugfixes.

```markdown
## Summary

- An advisory lock service for CI/CD pipelines, implemented as a GitHub Action.
- It prevents race conditions by ensuring mutual exclusion - only one job can access a shared resource concurrently.

## Features

- **Advisory Locking**: Create and manage locks within your GitHub Actions workflows.
- **Pull Request Integration**: Lock and release events are posted as PR comments.
- **Slack Notifications**: Choose if you want to be notified on Slack about locking events.
- **Easy Disabling**: Skip locking for specific pull requests by:
  - adding a `SKIP_MUTEX` label
  - including `SKIP_MUTEX` in the PR's description or comment
  - or defining `SKIP_MUTEX=1` as an environment variable.

## Changelog

- TBD.
```

## License

Copyright &copy; 2025 Mihai Bojin

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

<http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

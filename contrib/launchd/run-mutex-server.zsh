#!/bin/zsh

set -euo pipefail

readonly MUTEX_WORKING_DIR="/Users/YOUR_USERNAME/.config/releasetools-mutex"
readonly MUTEX_EXECUTABLE="/Users/YOUR_USERNAME/.local/bin/mutex"
readonly DOTSECENV_EXECUTABLE="/Users/YOUR_USERNAME/.local/bin/dotsecenv"
readonly DOTSECENV_SECRET="YOUR_NAMESPACE::MUTEX_DATABASE_URL"

cd "$MUTEX_WORKING_DIR"
MUTEX_DATABASE_URL="$("$DOTSECENV_EXECUTABLE" --silent secret get "$DOTSECENV_SECRET")"
export MUTEX_DATABASE_URL

exec "$MUTEX_EXECUTABLE" server run -p server

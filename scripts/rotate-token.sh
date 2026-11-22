#!/usr/bin/env bash
# Usage: scripts/rotate-token.sh <name>
# Issues a new token and invalidates the old one, which logs that user out everywhere.
source "$(dirname "$0")/_d1.sh"
NAME="${1:?usage: rotate-token.sh <name>}"
TOKEN="$(openssl rand -hex 32)"
HASH="$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)"
CHANGES="$(d1_query "UPDATE users SET token_hash = ? WHERE name = ?" \
  "$(jq -cn --arg h "$HASH" --arg n "$NAME" '[$h,$n]')" | jq '.result[0].meta.changes')"
[ "$CHANGES" = "1" ] || { echo "No user named '$NAME'"; exit 1; }
echo "New token for '$NAME':"; echo "$TOKEN"

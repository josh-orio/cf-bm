#!/usr/bin/env bash
# Usage: scripts/add-user.sh <name>
# Creates a user and prints their token ONCE. Only its hash is stored.
source "$(dirname "$0")/_d1.sh"
NAME="${1:?usage: add-user.sh <name>}"
TOKEN="$(openssl rand -hex 32)"
HASH="$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)"
d1_query "INSERT INTO users (id, name, token_hash) VALUES (?, ?, ?)" \
  "$(jq -cn --arg id "$(uuidgen | tr A-Z a-z)" --arg n "$NAME" --arg h "$HASH" '[$id,$n,$h]')" >/dev/null
echo "User '$NAME' created. Token (store it in a password manager, it won't be shown again):"
echo "$TOKEN"

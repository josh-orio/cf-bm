#!/usr/bin/env bash
# Create tables in D1. Safe to re-run.
source "$(dirname "$0")/_d1.sh"
d1_query "$(cat "$ROOT/worker/schema.sql")" | jq '.success'

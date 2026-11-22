# Shared helper: run SQL against the deployed D1 database through the Cloudflare API.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a
DB_ID="$(terraform -chdir="$ROOT/terraform" output -raw d1_database_id)"

# d1_query <sql> [json-params-array]
d1_query() {
  local body
  body="$(jq -n --arg sql "$1" --argjson params "${2:-[]}" '{sql:$sql, params:$params}')"
  curl -fsS -X POST \
    "https://api.cloudflare.com/client/v4/accounts/$TF_VAR_account_id/d1/database/$DB_ID/query" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
    --data "$body"
}

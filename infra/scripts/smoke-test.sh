#!/usr/bin/env bash
# Post-deploy smoke test against the stack outputs written by
# `cdk deploy --outputs-file`. Usage: smoke-test.sh <outputs.json> <stack-name>
set -euo pipefail

outputs_file=${1:?outputs file}
stack=${2:?stack name}
output() { jq -er --arg s "$stack" --arg k "$1" '.[$s][$k]' "$outputs_file"; }

web_url=$(output WebUrl)
api_url=$(output ApiUrl)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
fetch() { curl -sS --retry 5 --retry-all-errors --retry-delay 10 --max-time 20 "$@"; }

echo "Web app: $web_url"
fetch -D "$tmp/headers" -o "$tmp/index.html" -f "$web_url/"
grep -q '<app-root>' "$tmp/index.html"
grep -qi '^strict-transport-security:' "$tmp/headers"
grep -qi '^content-security-policy:' "$tmp/headers"

echo "Deep link falls back to the app shell"
fetch -o "$tmp/deep.html" -f "$web_url/accounts"
grep -q '<app-root>' "$tmp/deep.html"

echo "config.json points at this stack"
fetch -o "$tmp/config.json" -f "$web_url/config.json"
jq -e --arg api "$api_url" \
  '.environment == "aws" and .auth.mode == "cognito" and .apiBaseUrl == $api' "$tmp/config.json" >/dev/null

echo "API without a token: $api_url/overview"
status=$(fetch -o "$tmp/api.json" -w '%{http_code}' "$api_url/overview")
if [[ $status != 401 ]]; then
  echo "expected 401, got $status" >&2
  exit 1
fi
jq -e '.error.code == "unauthorized"' "$tmp/api.json" >/dev/null

echo "Smoke test passed"

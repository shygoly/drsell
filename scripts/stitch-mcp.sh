#!/usr/bin/env bash
# JSON-RPC helper for Google Stitch MCP (https://stitch.googleapis.com/mcp)
# Requires STITCH_API_KEY in the environment.
set -euo pipefail

if [[ -z "${STITCH_API_KEY:-}" ]]; then
  echo "STITCH_API_KEY is not set" >&2
  exit 1
fi

TOOL="${1:?usage: stitch-mcp.sh <tool_name> [json_arguments]}"
ARGS="${2:-{}}"
ID="${RANDOM}"

curl -sS -X POST "https://stitch.googleapis.com/mcp" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: ${STITCH_API_KEY}" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":${ID},\"method\":\"tools/call\",\"params\":{\"name\":\"${TOOL}\",\"arguments\":${ARGS}}}"

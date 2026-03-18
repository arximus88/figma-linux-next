#!/usr/bin/env bash
# Test the local Figma MCP server without burning LLM tokens.
# Usage: ./scripts/test-mcp.sh [fileKey] [nodeId]

MCP="http://127.0.0.1:3845/mcp"
FILE_KEY="${1:-TyNeW46l0RjIafvnnItZ1V}"
NODE_ID="${2:-262-3136}"

call() {
  local name="$1"
  local params="$2"
  echo "━━━ $name ━━━"
  curl -s -X POST "$MCP" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$params}}" \
    | python3 -m json.tool --no-ensure-ascii 2>/dev/null || cat
  echo
}

echo "━━━ tools/list ━━━"
curl -s -X POST "$MCP" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | python3 -c "import sys,json; tools=json.load(sys.stdin)['result']['tools']; [print(' •', t['name']) for t in tools]"
echo

call "get_design_context" "{\"fileKey\":\"$FILE_KEY\",\"nodeId\":\"$NODE_ID\"}"
call "get_variable_defs"  "{\"fileKey\":\"$FILE_KEY\",\"nodeId\":\"$NODE_ID\"}"
call "get_screenshot"     "{\"fileKey\":\"$FILE_KEY\",\"nodeId\":\"$NODE_ID\"}"
call "get_code_connect_map" "{}"

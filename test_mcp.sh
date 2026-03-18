#!/usr/bin/env bash
# ─── MCP Server Test Commands ──────────────────────────────────────────────────
# Run these after figma-linux-next starts with the MCP server integrated.
# All commands use curl against http://127.0.0.1:3845/mcp

set -euo pipefail

HOST="http://127.0.0.1:3845"
CT="Content-Type: application/json"

echo "━━━ Test 1: Initialize handshake ━━━"
INIT_RESPONSE=$(curl -s -i -X POST "$HOST/mcp" \
  -H "$CT" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "test-harness", "version": "1.0" }
    }
  }')

echo "$INIT_RESPONSE"
# Extract Mcp-Session-Id from response headers
SESSION_ID=$(echo "$INIT_RESPONSE" | grep -i "mcp-session-id" | awk '{print $2}' | tr -d '\r')
echo ""
echo "Session ID: $SESSION_ID"
echo ""

if [ -z "$SESSION_ID" ]; then
  echo "❌ No session ID returned — check if server is running"
  exit 1
fi

echo "━━━ Test 2: tools/list ━━━"
curl -s -X POST "$HOST/mcp" \
  -H "$CT" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' | python3 -m json.tool
echo ""

echo "━━━ Test 3: tools/call — get_metadata ━━━"
curl -s -X POST "$HOST/mcp" \
  -H "$CT" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": { "name": "get_metadata", "arguments": {} }
  }' | python3 -m json.tool
echo ""

echo "━━━ Test 4: tools/call — get_design_context (current selection) ━━━"
curl -s -X POST "$HOST/mcp" \
  -H "$CT" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": { "name": "get_design_context", "arguments": {} }
  }' | python3 -m json.tool
echo ""

echo "━━━ Test 5: tools/call — get_screenshot (current selection) ━━━"
SCREENSHOT_RESULT=$(curl -s -X POST "$HOST/mcp" \
  -H "$CT" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": { "name": "get_screenshot", "arguments": { "scale": 2 } }
  }')
echo "$SCREENSHOT_RESULT" | python3 -m json.tool

# If screenshot succeeded, try to download the asset
ASSET_URL=$(echo "$SCREENSHOT_RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
text = data.get('result',{}).get('content',[{}])[0].get('text','{}')
inner = json.loads(text)
print(inner.get('url',''))
" 2>/dev/null || true)

if [ -n "$ASSET_URL" ]; then
  echo ""
  echo "━━━ Test 5b: Download screenshot asset ━━━"
  curl -s -o /tmp/mcp_screenshot.png "$ASSET_URL" && \
    echo "✅ Screenshot saved to /tmp/mcp_screenshot.png ($(wc -c < /tmp/mcp_screenshot.png) bytes)" || \
    echo "❌ Failed to download screenshot"
fi
echo ""

echo "━━━ Test 6: ping ━━━"
curl -s -X POST "$HOST/mcp" \
  -H "$CT" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":6,"method":"ping"}' | python3 -m json.tool
echo ""

echo "━━━ Test 7: OAuth discovery ━━━"
curl -s "$HOST/.well-known/oauth-authorization-server" | python3 -m json.tool
echo ""

echo "✅ All tests complete"

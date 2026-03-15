#!/usr/bin/env bash
# マイプロテイン AI 抽出テスト（20件）。Next を起動した状態で実行。
# 結果は scripts/myprotein-ai-test-result.json に保存される。
set -e
BASE="${BASE_URL:-http://localhost:3001}"
LIMIT="${LIMIT:-20}"
OUT="${OUT:-scripts/myprotein-ai-test-result.json}"
echo "POST $BASE/api/manufacturers/ai-extract-test (limit=$LIMIT)"
curl -s -X POST "$BASE/api/manufacturers/ai-extract-test" \
  -H "Content-Type: application/json" \
  -d "{\"manufacturer_code\":\"myprotein\",\"limit\":$LIMIT}" \
  | tee "$OUT" | (command -v jq >/dev/null && jq -r '
    "total_fetched: \(.total_fetched // "?"),
     total_ai_ok: \(.total_ai_ok // "?"),
     total_with_nutrition: \(.total_with_nutrition // "?")"
  ' || echo "(install jq to see summary)")
echo "Full result: $OUT"

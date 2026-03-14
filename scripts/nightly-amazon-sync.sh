#!/usr/bin/env bash
# 毎日深夜バッチ用: Amazon 取得 → import → classify を無人で実行する。
# 使い方: プロジェクトルートで ./scripts/nightly-amazon-sync.sh
# または cron: 0 3 * * * cd /path/to/protein-log && ./scripts/nightly-amazon-sync.sh >> /tmp/amazon-sync.log 2>&1

set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"

# .env.local を読み込む（export して子プロセスに渡す）
if [ -f "$ROOT/.env.local" ]; then
  set -a
  source "$ROOT/.env.local"
  set +a
fi

# アプリのベース URL（import/classify を叩く先）
# 同じマシンで Next が動いている場合は http://localhost:3000
# Vercel など本番の場合は https://your-app.vercel.app を指定
APP_URL="${APP_URL:-http://localhost:3000}"

# 検索ページ数・取得件数（必要に応じて変更）
SEARCH_PAGES="${AMAZON_SYNC_SEARCH_PAGES:-5}"
MAX_PRODUCTS="${AMAZON_SYNC_MAX_PRODUCTS:-50}"

log() { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] $*"; }
log "nightly-amazon-sync: start (headless, ${SEARCH_PAGES} pages, max ${MAX_PRODUCTS} products)"

# 1) Playwright で Amazon 取得 → scraped_products に upsert（ヘッドレス）
python3 "$ROOT/app/api/amazon_product_sync.py" "プロテインパウダー" "$SEARCH_PAGES" "$MAX_PRODUCTS" 1
log "sync done"

# 2) import: scraped_products → protein_source_texts
curl -sS -X POST "${APP_URL}/api/source-texts/import" \
  -H "Content-Type: application/json" \
  -d '{"targets":["amazon"],"limit":500}' || true
echo ""
log "import done"

# 3) classify: pending → AI 分類 → product_classification_results
curl -sS -X POST "${APP_URL}/api/batch/classify" \
  -H "Content-Type: application/json" \
  -d '{"limit":150}' || true
echo ""
log "classify done"

log "nightly-amazon-sync: end"

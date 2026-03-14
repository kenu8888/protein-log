# 実装サマリー（ここまでの対応）

Amazon・メーカー・楽天の取得〜表示までの実装状況と、関連ドキュメントへのリンクをまとめる。

---

## データの流れ（共通）

```
[取得] 各ソース用 API / スクリプト
    ↓
[取得元テーブル]  scraped_products / manufacturer_products / rakuten_products
    ↓
[import]  POST /api/source-texts/import  (targets: amazon | manufacturer | rakuten)
    ↓
protein_source_texts  (source_key = "amazon:ASIN" | "manufacturer:upsert_key" | "rakuten:item_code")
    ↓
[classify]  POST /api/batch/classify  (Gemini)
    ↓
product_classification_results  （画面表示。価格・画像・URL は取得元テーブルから補完）
```

---

## ソース別の実装

| ソース | 取得 | 取得元テーブル | 備考 |
|--------|------|----------------|------|
| **Amazon** | `app/api/amazon_product_sync.py`（Playwright） / または SerpAPI 等 | `scraped_products` | 拡張カラム（栄養等）は migration 適用後・環境変数で有効化。深夜バッチ用 `scripts/nightly-amazon-sync.sh`、GitHub Actions `.github/workflows/amazon-sync.yml`。 |
| **メーカー** | `POST /api/manufacturers/scrape` | `manufacturer_products` | MY ROUTINE は一覧＋「もっと見る」（admin-ajax.php）で全件取得し、各詳細ページから価格等をパース。 |
| **楽天** | `POST /api/rakuten/sync`（楽天 Ichiba API） | `rakuten_products` | アプリID登録時にサーバ情報が必要。未登録の場合は migration とコードのみコミット済み。 |

---

## DB migration

- `20260315000000_add_extended_columns_to_scraped_products.sql` … scraped_products に栄養・フレーバー等の拡張カラム
- `20260315010000_add_nutrition_to_manufacturer_products.sql` … manufacturer_products に栄養カラム（任意）
- `20260316000000_add_rakuten_products.sql` … rakuten_products テーブル新設

---

## ドキュメント一覧

| ファイル | 内容 |
|----------|------|
| `docs/AMAZON_DATA_INTEGRATION.md` | Amazon データ連携・scraped_products 仕様 |
| `docs/AMAZON_PRODUCT_SYNC_DESIGN.md` | Amazon 同期スクリプト設計・運用 |
| `docs/RUN_AMAZON_SYNC.md` | Amazon 取得の実行手順・深夜バッチ |
| `docs/DATABASE_DESIGN_SOURCES_AND_DISPLAY.md` | 取得元テーブルと表示用 DB の設計方針 |
| `docs/MANUFACTURER_SCRAPE_IMPROVEMENT.md` | メーカー取得の精度改善・欠損調査・MY ROUTINE の「もっと見る」 |
| `docs/RAKUTEN_INTEGRATION_DESIGN.md` | 楽天 API 連携の設計・取得可否・実装後のチェックリスト（アプリID登録はサーバ情報が必要な場合あり） |
| `docs/IMPLEMENTATION_SUMMARY.md` | 本サマリー |

---

## 楽天アプリIDについて

楽天 Web Service のアプリ登録では、**サーバ情報（コールバックURL等）** を求められることがある。本番サーバやドメインが決まっていない場合は、仮のURLで登録するか、サーバ準備後に登録する。登録後、`.env.local` に `RAKUTEN_APPLICATION_ID` を設定すれば `POST /api/rakuten/sync` で取得〜一覧反映まで利用可能。

# Amazon 商品同期スクリプト 設計・運用方針

Playwright で取得した Amazon プロテイン商品データを `scraped_products` に流し込み、既存の import → classify パイプラインで画面表示までつなぐための設計と運用をまとめる。

---

## 1. 推奨アーキテクチャ（優先順位付き）

### 1.1 全体フロー（変わらず）

```
[1] 検索取得 (Playwright)  →  [2] 商品詳細取得 (Playwright)
         ↓                              ↓
     ProductSeed 一覧            ScrapedProductRow 一覧
                                         ↓
[3] 正規化 (ASIN 重複除去・マージ)  →  [4] Supabase scraped_products upsert
                                         ↓
[5] import (protein_source_texts)  →  [6] classify (product_classification_results)
                                         ↓
                                    画面表示
```

- **既存を壊さない**: 新スクリプトは「[1]〜[4]」まで担当し、[5][6] は既存の API / バッチのまま利用する。
- **一意キー**: `scraped_products` は `asin` で upsert。同じ ASIN は上書き。

### 1.2 責務の整理

| 段階 | 担当 | 入出力 |
|------|------|--------|
| 1. 検索取得 | amazon_product_sync.py | 検索語 → ProductSeed 一覧 (asin, source_url, title, brand, image_url, price, price_value, rating) |
| 2. 商品詳細取得 | 同上 | ProductSeed → 詳細ページを開き → ScrapedProductRow（現行カラム + 拡張カラム） |
| 3. 正規化 | 同上 | ScrapedProductRow 一覧 → ASIN でマージ（後勝ち or 欠損補完） |
| 4. Supabase upsert | 同上 | ScrapedProductRow 一覧 → scraped_products（**現行スキーマの列だけ送る**） |
| 5. import | 既存 API / バッチ | scraped_products → protein_source_texts (source_key = amazon:{asin}) |
| 6. classify | 既存 API / バッチ | protein_source_texts (pending) → Gemini → product_classification_results |

---

## 2. テーブル設計方針

### 2.1 今すぐ保存するもの（現行 scraped_products のみ）

- **保存する**: asin, title, brand, image_url, price, price_value, availability_raw, is_available, net_weight_kg, price_per_kg, rating, source_url  
  → 既存の import / classify / 画面表示がそのまま動く。
- **保存しない（スクリプトでは取得するが DB には送らない）**: manufacturer, flavor, calories, protein_g, carbs_g, fat_g, nutrition_basis_raw, nutrition_raw_text, net_weight_raw  
  → 列が存在しないため、upsert 時に「列なし」エラーになるのを防ぐ。

### 2.2 拡張カラムを追加した場合（migration 適用後）

- 上記の「保存しない」項目を **別テーブルにしない** 方針で、`scraped_products` にそのまま追加する案を推奨。
  - 理由: 1 ASIN = 1 行で扱え、import 時の raw_text 拡張や将来の AI 入力にも使いやすい。
- 追加する列:
  - manufacturer (text)
  - flavor (text)
  - calories (numeric)
  - protein_g, carbs_g, fat_g (numeric)
  - nutrition_basis_raw (text)
  - nutrition_raw_text (text)
  - net_weight_raw (text)

Migration は `supabase/migrations/20260315000000_add_extended_columns_to_scraped_products.sql` に用意済み。適用後、スクリプト側で `AMAZON_SYNC_USE_EXTENDED_COLUMNS=1` を付けると payload にこれらの列を含める。

### 2.3 後段（別テーブル・後処理）に回すもの

- **栄養・フレーバー等の「解釈結果」**: 現状は AI 分類（product_classification_results）側の display_* / flavor_category / calories 等に任せる。  
  scraped_products の拡張列は「生データ」として持ち、必要に応じて classify の入力や管理画面用に参照する。
- **レビュー本文**: 別テーブル（レビュー用）を検討。本スクリプトの対象外。

---

## 3. コード修正方針（実施済み）

### 3.1 現行 scraped_products のみ対応

- **to_supabase_payload**: 送信するキーを「現行テーブルに存在する列」に限定。
  - 定数 `SCRAPED_PRODUCTS_CORE_COLUMNS` に asin, title, brand, image_url, price, price_value, availability_raw, is_available, net_weight_kg, price_per_kg, rating, source_url のみ列挙。
  - payload は `{k: v for k, v in payload.items() if k in allowed}` でフィルタし、存在しない列を送らない。
- **ScrapedProductRow**: 従来どおり manufacturer, flavor, calories 等も保持。詳細取得ロジックはそのまま。DB に送るかどうかは payload のフィルタで制御。

### 3.2 拡張列を見据えた版

- **SCRAPED_PRODUCTS_EXTENDED_COLUMNS** を定義し、`to_supabase_payload(row, use_extended_columns=True)` で拡張列を含める。
- 環境変数 **AMAZON_SYNC_USE_EXTENDED_COLUMNS** が `1` / `true` / `yes` のときだけ拡張列を payload に含め、migration 未適用の環境では指定しなければ現行のみで動く。

### 3.3 その他の修正

- **PROJECT_ROOT**: 固定パスではなく `Path(__file__).resolve().parent.parent.parent` に変更し、どこから実行しても .env.local を探せるようにした。
- **save_local_json**: `to_supabase_payload` の結果（現行列のみ or 拡張含む）をそのまま保存。デバッグ用。

---

## 4. 実装ステップ（優先順位）

1. **すぐやる**: 上記の payload 制限により、**migration なしで** 既存の scraped_products にだけ upsert する。  
   → `python app/api/amazon_product_sync.py "プロテインパウダー" 2 5` などで動作確認。

2. **次**: import → classify を実行し、トップ・詳細ページに反映する。  
   - 例: `POST /api/source-texts/import` (targets: amazon) → `POST /api/batch/classify`

3. **拡張する場合**: migration `20260315000000_add_extended_columns_to_scraped_products.sql` を適用し、`AMAZON_SYNC_USE_EXTENDED_COLUMNS=1` でスクリプトを実行。  
   → メーカー・フレーバー・栄養の生データが scraped_products に保存される。

4. **定期実行**: 下記「5. 1日1回の運用」のいずれかで 1 日 1 回実行。

---

## 5. 1日1回の定期同期の運用方法

| 方法 | メリット | デメリット | 推奨度 |
|------|----------|------------|--------|
| **ローカル** | 実装不要、デバッグしやすい | PC が起動している必要がある | 開発・検証用 |
| **VPS / 自前サーバー** | 安定、cron で確実に実行可能 | サーバー管理・コスト | 本番向け |
| **GitHub Actions** | サーバー不要、無料枠で試しやすい | Playwright のセットアップ・実行時間制限（〜6h）、Secrets に Supabase キーが必要 | 中〜小規模 |
| **Supabase Cron / Edge Functions** | DB と同一基盤 | Edge 上で Playwright は動かせない。別サービスでスクレイプし、Supabase に書き込む形なら可 | スクレイプ本体には不向き |

### 推奨

- **開発・検証**: ローカルで手動実行 or ローカル cron。
- **本番（1日1回）**:  
  - **VPS がある**: cron で `amazon_product_sync.py` 実行後、`curl` で import API と classify API を叩く。  
  - **VPS がない**: GitHub Actions で「Playwright 入りジョブ」を 1 日 1 回実行し、スクリプト実行 → 同一ワークフロー内で import/classify を HTTP で呼ぶ。  
    - 注意: Actions の無料枠は 2000 分/月。1 回 10 分として 1 日 1 回なら約 300 分/月で収まる想定。

### GitHub Actions 例（概要）

```yaml
# .github/workflows/amazon-sync.yml
on:
  schedule:
    - cron: '0 4 * * *'  # 毎日 4:00 UTC = 13:00 JST
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install playwright supabase python-dotenv
      - run: playwright install chromium --with-deps
      - run: python app/api/amazon_product_sync.py "プロテインパウダー" 2 20 1
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      - run: |
          curl -X POST "${{ secrets.APP_URL }}/api/source-texts/import" \
            -H "Content-Type: application/json" \
            -d '{"targets":["amazon"]}'
          curl -X POST "${{ secrets.APP_URL }}/api/batch/classify" \
            -H "Content-Type: application/json" \
            -d '{"limit":150}'
```

- `secrets.APP_URL` は Next アプリの URL（Vercel など）。import/classify が認証なしで叩ける前提。必要なら API キー等を検討。

---

## 6. まとめ

- **今**: スクリプトは「現行 scraped_products の列だけ」送るように修正済み。migration なしで upsert 可能。
- **拡張**: migration を適用し、`AMAZON_SYNC_USE_EXTENDED_COLUMNS=1` でメーカー・フレーバー・栄養を保存可能。
- **パイプライン**: 検索 → 詳細取得 → 正規化 → upsert までスクリプト、import → classify は既存のまま。
- **定期実行**: ローカル / VPS cron または GitHub Actions で 1 日 1 回を推奨。

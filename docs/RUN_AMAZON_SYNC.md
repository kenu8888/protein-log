# 新 Amazon 取得（amazon_product_sync.py）の実行手順

Playwright で Amazon を検索し、商品詳細を取得して `scraped_products` に投入するまでの手順です。

---

## 1. 前提

- **Python 3.10+** が入っていること
- **プロジェクトルート**（`protein-log/`）で以下を実行する想定

---

## 2. 環境変数

`.env.local` に以下があること（既存の Supabase 設定で可）。

| 変数 | 説明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` または `SUPABASE_URL` | Supabase の URL |
| `SUPABASE_SERVICE_ROLE_KEY` または `SUPABASE_SECRET_KEY` | サービスロールキー（scraped_products に書き込むため） |

拡張カラム（栄養・フレーバー等）を DB に送りたい場合は、**migration `20260315000000_add_extended_columns_to_scraped_products.sql` を適用したうえで**:

```bash
export AMAZON_SYNC_USE_EXTENDED_COLUMNS=1
```

（未設定の場合は現行カラムのみ送信され、列なしエラーにはならない。）

---

## 3. 依存のインストール

```bash
# プロジェクトルートで（pip が無い場合は python3 -m pip を使う）
python3 -m pip install playwright supabase python-dotenv
python3 -m playwright install chromium
```

`playwright install chromium` はブラウザバイナリのダウンロードなので初回のみ必要です。

---

## 4. 実行コマンド

```bash
# プロジェクトルートで
python3 app/api/amazon_product_sync.py [検索語] [検索ページ数] [取得件数] [ヘッドレス]
```

| 引数 | デフォルト | 説明 |
|------|------------|------|
| 1: 検索語 | `プロテインパウダー` | Amazon の検索キーワード |
| 2: 検索ページ数 | `5` | 検索結果を何ページまで見るか |
| 3: 取得件数 | 全件 | 何件まで詳細取得するか。`all` で制限なし |
| 4: ヘッドレス | `0`（ブラウザ表示） | `1` でヘッドレス（画面非表示） |

**例（まず少なめに試す）**

```bash
# 検索 2 ページ、詳細取得 5 件、ブラウザ表示（動作確認しやすい）
python3 app/api/amazon_product_sync.py "プロテインパウダー" 2 5 0
```

```bash
# 検索 3 ページ、10 件、ヘッドレス
python3 app/api/amazon_product_sync.py "プロテインパウダー" 3 10 1
```

---

## 5. 実行後の流れ

1. **検索** → 検索結果から ASIN 一覧を取得
2. **詳細取得** → 各商品ページを開き、価格・在庫・栄養等を取得
3. **ローカル保存**  
   - `output/scraped_products_payload.json` に投入予定の JSON  
   - `output/product_debug/<ASIN>.html` に各詳細ページの HTML（デバッグ用）
4. **Supabase** → `scraped_products` に upsert（`asin` で上書き）

---

## 6. 画面まで反映したい場合

1. **Import**（scraped_products → protein_source_texts）  
   - 画面の「取り込み」から Amazon を実行する  
   - または `POST /api/source-texts/import` で `targets: ["amazon"]`
2. **Classify**（AI 分類）  
   - 画面の「分類」実行  
   - または `POST /api/batch/classify`

ここまででトップ一覧・詳細に Amazon 由来の商品が表示されます。

---

## 7. 毎日深夜に自動でデータ取得（人手なし）

今の仕組みの延長で、**ヘッドレス実行 → import → classify** までをまとめたバッチを用意してあります。以下のいずれかで「毎日深夜に自動実行」できます。

### 7.1 用意したスクリプト

| ファイル | 役割 |
|----------|------|
| `scripts/nightly-amazon-sync.sh` | ① sync（ヘッドレス）→ ② import API → ③ classify API を順に実行 |

**手動で試す場合（プロジェクトルートで）**

```bash
./scripts/nightly-amazon-sync.sh
```

- スクリプト内で `.env.local` を読み込み、`python3 app/api/amazon_product_sync.py ... 1`（最後の 1 でヘッドレス）を実行したあと、`APP_URL` に向けて import / classify を POST します。
- **APP_URL**: 同じマシンで Next を動かす場合は `http://localhost:3000`（未設定時のデフォルト）。本番のドメインで叩く場合は実行前に `export APP_URL=https://your-app.vercel.app` などで指定。

**環境変数で件数だけ変えたい場合**

```bash
export AMAZON_SYNC_SEARCH_PAGES=5    # 検索ページ数（デフォルト 5）
export AMAZON_SYNC_MAX_PRODUCTS=50   # 詳細取得する最大件数（デフォルト 50）
./scripts/nightly-amazon-sync.sh
```

### 7.2 cron で毎日深夜に実行（同一マシン）

スクリプトを実行するマシンで cron を設定します。例: 毎日 3:00 に実行。

```bash
crontab -e
```

次の行を追加（パスは環境に合わせて変更）。

```cron
0 3 * * * cd /Volumes/5TB\ HDD/protein-log && ./scripts/nightly-amazon-sync.sh >> /tmp/amazon-sync.log 2>&1
```

- **注意**: このマシンで Next が動いていない場合は、`APP_URL` を本番 URL にしておく必要があります。その場合、import/classify が外部から叩ける状態（認証なし or API キー等）になっている必要があります。
- Mac の場合は「スリープしない」設定にするか、実行時刻にマシンが起動している必要があります。

### 7.3 GitHub Actions で毎日実行（サーバー不要）

リポジトリに `.github/workflows/amazon-sync.yml` を入れておくと、**毎日指定時刻に GitHub 上で sync → import → classify まで実行**できます。Supabase とアプリの URL は Secrets に登録します。詳細は `docs/AMAZON_PRODUCT_SYNC_DESIGN.md` の「5. 1日1回の定期同期」およびワークフローファイル内のコメントを参照してください。

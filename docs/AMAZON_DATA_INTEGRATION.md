# Amazon データ連携仕様（外部API・Supabase 連携用）

別システム／別AIで取得した Amazon 商品データを Protein Log に取り込むためのテーブル仕様とデータフローをまとめます。

---

## 1. データフロー概要

```
[Amazon データ取得]  ← 現行: SerpAPI / 今後: 別API
        ↓
  scraped_products  （1商品 = 1ASIN = 1行、upsert キー: asin）
        ↓
  （オプション）価格・在庫・重量の補完バッチ
        ↓
  protein_source_texts  （source_key = "amazon:{ASIN}"、raw_text は scraped_products から生成）
        ↓
  AI 分類バッチ（Gemini）
        ↓
  product_classification_results  （画面表示の主データ。価格・画像・在庫は scraped_products を参照）
```

- **画面に表示される一覧・詳細**は `product_classification_results` を参照しています。
- Amazon 由来の行は、**価格・画像・在庫**を `scraped_products` の同じ ASIN の行から補完して保存します。
- したがって **「新しい Amazon API は `scraped_products` に投入する形」** で連携すれば、既存の import → 分類パイプラインがそのまま使えます。

---

## 2. テーブル: `scraped_products`

Amazon 検索／詳細取得結果を格納するテーブル。**一意キーは `asin`**（UNIQUE 制約）。同一 ASIN は upsert で上書き。

### 2.1 カラム一覧

| カラム | 型 | 必須 | 説明 |
|--------|------|------|------|
| **id** | uuid | 自動 | PK。insert 時は自動採番。upsert 時は `onConflict: "asin"` のため未指定でよい。 |
| **asin** | text | **必須** | Amazon の ASIN（10文字）。**一意キー。** |
| **title** | text | 推奨 | 商品タイトル。一覧・AI 分類の raw_text に使う。 |
| **brand** | text | 任意 | ブランド名。 |
| **image_url** | text | 任意 | 商品画像 URL。詳細ページのサムネ等。 |
| **price** | text | 任意 | 価格の表示用文字列（例: "￥3,980"）。 |
| **price_value** | numeric | 任意 | 価格の数値（円）。画面・分類結果の price_jpy に使う。 |
| **availability_raw** | text | 任意 | 在庫状況の生テキスト（例: "在庫あり"）。 |
| **is_available** | boolean | 任意 | 在庫ありなら true、在庫切れなら false。 |
| **net_weight_kg** | numeric | 任意 | 内容量（kg）。例: 1, 0.5, 2.27。price_per_kg 計算に使用。 |
| **price_per_kg** | numeric | 任意 | 1kg あたりの参考価格（円）。未設定時はバッチで price_value / net_weight_kg から計算することあり。 |
| **rating** | numeric | 任意 | 星評価（例: 4.5）。 |
| **source_url** | text | 推奨 | 商品詳細ページの URL（amazon.co.jp/dp/{asin} など）。 |

その他（運用用）:

| カラム | 型 | 説明 |
|--------|------|------|
| first_seen_at | timestamptz | 初回登録日時。更新時はトリガで維持。 |
| updated_at | timestamptz | 最終更新日時。トリガで自動更新。 |
| created_at | timestamptz | 作成日時。 |

### 2.2 Upsert 仕様

- **衝突キー**: `asin`（UNIQUE）
- **投入方法**: 同じ ASIN が既にあれば **UPDATE**、なければ **INSERT**。
- 例（Supabase / JavaScript）:
  ```js
  await supabase.from("scraped_products").upsert(rows, { onConflict: "asin" })
  ```
- **重複対策**: 同一リクエスト内に同じ ASIN が複数あると「同一行を二重更新」でエラーになるため、**ASIN ごとに1件にまとめてから** upsert すること。

### 2.3 新 API が用意すべき1行の例（最小）

```json
{
  "asin": "B0XXXXXXXX",
  "title": "プロテイン ホエイ チョコレート 1kg",
  "brand": "EXAMPLE",
  "image_url": "https://m.media-amazon.com/images/...",
  "price": "￥3,980",
  "price_value": 3980,
  "source_url": "https://www.amazon.co.jp/dp/B0XXXXXXXX"
}
```

- `rating`, `availability_raw`, `is_available`, `net_weight_kg`, `price_per_kg` は任意。あると画面・分類でそのまま利用される。
- `price_value` が数値で入っていれば、分類結果の `price_jpy` に反映される。
- `net_weight_kg` と `price_value` の両方があれば、`price_per_kg` はバッチ側で計算も可能（未設定なら後段バッチで補完可）。

---

## 3. テーブル: `protein_source_texts`（取り込み中間）

`scraped_products` の内容を「AI に渡す生テキスト」として登録するテーブル。

- **source_key**: `amazon:{ASIN}` 形式で **一意**。同じ ASIN は1件だけ。
- **source_name**: `"amazon"` 固定で、分類結果保存時に Amazon 由来と判別する。
- **raw_text**: 下記のような改行区切りテキスト。**import 時に `scraped_products` の列から自動生成**するため、新 API は **`scraped_products` だけ更新すればよい**。

現行の生成ロジック（参考）:

```
【Amazon】
ブランド: {brand}
商品名: {title}
価格: {price}
評価: {rating}
ASIN: {asin}
URL: {source_url}
```

- 新 API が直接 `protein_source_texts` をいじる必要はありません。既存の「import バッチ」または「import API」が `scraped_products` を読んで `protein_source_texts` を更新します。

---

## 4. テーブル: `product_classification_results`（画面表示用）

AI 分類結果と、画面の一覧・詳細で使うメインテーブル。

- **1行 = 1商品（1 ASIN 相当）**。`source_text_id` で `protein_source_texts` に 1:1 で紐づく。
- Amazon 由来の行では、保存時に **`scraped_products` を `source_key` → ASIN で引いて** 以下を上書きします:
  - `product_image_url` ← `scraped_products.image_url`
  - `price_jpy` ← `scraped_products.price_value`
  - `price_per_kg` ← `scraped_products.price_per_kg`
  - `is_in_stock` ← `scraped_products.is_available`

したがって、**新 API は `scraped_products` に正しく upsert すれば、既存の import → 分類パイプラインでそのまま画面に反映されます。**

---

## 5. 現行の Amazon 取得・補完の流れ（参考）

| 段階 | 手段 | 説明 |
|------|------|------|
| 1. 一覧取得 | `POST /api/scrape-protein` | SerpAPI の Amazon 検索で `organic_results` / `featured_products` を取得し、`scraped_products` に upsert。 |
| 2. 詳細・価格・在庫 | `npm run batch:fetch-amazon-details` | SerpAPI の `amazon_product` で ASIN ごとに価格・在庫・バリエーションを取得。既存行を更新し、variants の ASIN は新規行として追加。 |
| 3. 重量・price_per_kg | `npm run batch:backfill-amazon-prices` | `title` から `net_weight_kg` を推定し、`price_value` と合わせて `price_per_kg` を計算。 |
| 4. 取り込み | `POST /api/source-texts/import`（targets: amazon）または `npm run batch:import` | `scraped_products` を読んで `protein_source_texts` に upsert（source_key = `amazon:{ASIN}`）。 |
| 5. 分類 | `POST /api/batch/classify` または `npm run batch:classify` | pending の `protein_source_texts` を AI 分類し、`product_classification_results` に保存（価格・画像・在庫は `scraped_products` から補完）。 |

新 API で「1. 一覧取得」を置き換える場合、**出力を `scraped_products` の行形式に合わせて upsert する**だけで、2〜5 は既存のまま利用できます。2 の詳細取得も、新 API 側で価格・在庫・画像を返すなら、2 を省略または簡略化できます。

---

## 6. 連携方法の選択肢

### A. 新 API が Supabase に直接書き込む場合

- 新 API が Supabase クライアント（または REST API）で **`scraped_products` に upsert** する。
- 投入するオブジェクトは **2.3 の例** に沿った形にし、`asin` をキーに重複排除してから upsert。
- その後、既存どおり「import → 分類」を実行すれば画面に反映される。
  - 例: `POST /api/source-texts/import`（body: `{ "targets": ["amazon"] }`）→ `POST /api/batch/classify`

### B. 新 API が JSON を返し、こちらのスクリプトが DB に書く場合

- 新 API のレスポンスを、`scraped_products` の行の配列（少なくとも `asin`, `title`, `brand`, `source_url`、できれば `price`, `price_value`, `image_url`）に合わせる。
- 既存の「import 用」スクリプトや API を拡張し、そのレスポンスを `scraped_products` に upsert する。

### C. ファイル連携（CSV/JSON）の場合

- 新 API が CSV または JSON を出力し、バッチがそれを読み込んで `scraped_products` に upsertする。
- その場合も、列名・キー名を **2.1 のカラム** に合わせる。

---

## 7. 注意事項

- **ASIN は 10 文字** が前提。不正な ASIN は UNIQUE 制約や後の import で問題になる可能性があるので、投入前に検証推奨。
- **同じ ASIN は1行にまとめる**: 複数ソースから同じ ASIN が返る場合は、マージしてから upsert すること。
- **日付列**: `first_seen_at` / `updated_at` / `created_at` は、トリガまたは DB デフォルトに任せればよい。新 API で明示的に送る必要はない。
- **日本語・文字コード**: `title` や `brand` は UTF-8 で保存される想定。Shift-JIS 等の場合は UTF-8 に変換してから投入すること。

---

## 8. まとめ：新 Amazon API が満たすとよい仕様

1. **出力**  
   各商品を、少なくとも次のキーを持つオブジェクト（またはカラム）として扱えること。  
   - 必須: `asin`, `title`, `source_url`  
   - 推奨: `brand`, `price`, `price_value`, `image_url`  
   - 任意: `rating`, `availability_raw`, `is_available`, `net_weight_kg`, `price_per_kg`

2. **保存先**  
   上記を **`scraped_products` に `asin` をキーに upsert** する（直接 DB でも、こちらの API 経由でも可）。

3. **その先**  
   既存の「import（protein_source_texts）→ 分類（product_classification_results）」を実行すれば、トップ・詳細ページに反映される。

以上が、Amazon データを別 API から連携するための Supabase テーブルと現行スクリプトの概要です。

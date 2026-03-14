# データ取得元と表示用 DB 設計方針

Amazon 取得スクリプトとメーカー取得 API の両方を踏まえ、「どこに何を保存するか」と「DB 構成を変えるべきか」を整理する。

---

## 1. 現状の構成とデータの流れ

```
[Amazon]  Playwright 等 → scraped_products (asin で一意)
                              ↓
[メーカー] POST /api/manufacturers/scrape → manufacturer_products (upsert_key で一意)
                              ↓
          import (API / batch) → protein_source_texts (source_key = "amazon:ASIN" or "manufacturer:upsert_key")
                              ↓
          classify (Gemini)    → product_classification_results (画面表示の主テーブル)
```

- **画面の一覧・詳細**は `product_classification_results` のみ参照している。
- 価格・画像・在庫は、分類保存時に **source_name + source_key で scraped_products または manufacturer_products を参照して補完**している。
- つまり「取得元ごとの生データ」と「表示用の 1 商品 1 行」が分離できている。

---

## 2. 各テーブルの役割と「何をどこに置くか」

### 2.1 scraped_products（Amazon 取得専用）

| 役割 | 1 行 = 1 Amazon 商品（1 ASIN）。検索・詳細スクレイプの生データ。 |
|------|----------------------------------------------------------------|
| 一意キー | asin |
| 持つべきデータ | ・識別: asin, source_url<br>・表示補完用: title, brand, image_url, price, price_value, availability_raw, is_available, rating<br>・単価: net_weight_kg, price_per_kg<br>・拡張（取得できるなら）: manufacturer, flavor, calories, protein_g, carbs_g, fat_g, nutrition_raw_text, net_weight_raw |
| メーカーとの関係 | 別テーブル。取得元が違うためスキーマも違う（ASIN vs メーカー名+商品名+フレーバー）。 |

- **結論**: 現行カラムに加え、**拡張カラム（flavor, 栄養など）は scraped_products に持つ**。既存 migration で追加済み。

### 2.2 manufacturer_products（メーカー取得専用）

| 役割 | 1 行 = 1 商品バリアント（メーカー + 商品名 + フレーバー + 単位）。メーカーサイトの生データ。 |
|------|--------------------------------------------------------------------------------------------|
| 一意キー | upsert_key（manufacturer_name \| product_name \| flavor \| unit_text） |
| 持つべきデータ | ・識別: manufacturer_name, product_name, flavor, unit_text, unit_kg, source_url<br>・表示補完用: price_text, price_yen, price_per_kg, image_url<br>・生テキスト: raw_product_name, raw_flavor, raw_unit_text, raw_price_text<br>・拡張（将来）: 栄養（calories, protein_g, carbs_g, fat_g, nutrition_raw_text）をメーカーから取るならここにも持つと対称 |
| Amazon との関係 | 別テーブル。同じ「プロテイン商品」が Amazon とメーカー両方にあっても、**同じ 1 行にまとめない**（1 取得元 1 行のまま）。 |

- **結論**: 現状のまま運用で問題なし。メーカー側でも栄養をパースするなら、**scraped_products と対称に栄養カラムを追加**する選択肢あり（後述）。

### 2.3 protein_source_texts（取り込み中間）

| 役割 | import 時に「どの取得元のどの 1 件か」を一意にし、AI への入力テキスト（raw_text）を保持。 |
|------|------------------------------------------------------------------------------------------|
| 一意キー | source_key（amazon:ASIN または manufacturer:upsert_key） |
| 持つべきデータ | source_name, source_url, source_key, raw_text, status（pending/processed/excluded/error） |
| 変更の要否 | **変更不要**。raw_text は scraped_products / manufacturer_products の列から import 側で組み立てる。 |

### 2.4 product_classification_results（画面表示の主テーブル）

| 役割 | 1 行 = 画面の「1 商品」（1 フレーバー単位）。AI 分類結果 + 取得元テーブルからの価格・画像・在庫の補完。 |
|------|--------------------------------------------------------------------------------------------------------|
| 一意 | source_text_id（= protein_source_texts 1 件に 1 対 1） |
| 持つべきデータ | ・AI 出力: manufacturer, product_name, flavor, is_protein_powder, flavor_category, display_* など<br>・取得元補完: price_jpy, price_per_kg, product_image_url, product_url, is_in_stock（saveClassificationResult で scraped_products / manufacturer_products から取得）<br>・栄養: calories, protein_grams_per_serving, carbs, fat（AI または将来的に取得元の値を補完） |
| 変更の要否 | **列の追加は不要**。取得元の栄養を「補完」するなら **saveClassificationResult のロジック**で、scraped_products / manufacturer_products の値を参照して null を埋めるようにする。 |

---

## 3. 方針: 既存のまま行くか / DB 構成を変えるか

### 3.1 推奨: 「取得元 2 テーブル」は維持し、追加は「列の拡張」までに留める

- **維持するもの**
  - **scraped_products** と **manufacturer_products** の 2 本立て（取得元ごとにスキーマが違うため、1 テーブルに統合すると NULL だらけか JSONB 依存になり、可読性・運用が悪くなる）。
  - **protein_source_texts** の役割と **product_classification_results** が「表示の正」である構造。
- **変えるもの（小さな拡張のみ）**
  - **scraped_products**: 拡張カラム（flavor, 栄養など）を **既に提案済みの migration で追加**する。
  - **manufacturer_products**: メーカー側でも栄養を取る場合、**同じ概念の列を追加**する（calories, protein_g, carbs_g, fat_g, nutrition_raw_text）。任意。
- **新規テーブルは作らない**
  - 「同一商品を Amazon とメーカーで 1 行にマージする」ような **product_offers** や **product_identities** は、現時点では不要とする。同じ商品が 2 行（Amazon 由来 1 行・メーカー由来 1 行）あっても、一覧で「2 件」出るだけで、将来的にマージ・重複表示制御が必要になった段階で検討する。

### 3.2 やらない方がよいこと

- **scraped_products と manufacturer_products を 1 テーブルに統合する**: キーが asin vs upsert_key で異なり、列の意味も違うため、無理に 1 つにすると複雑になる。
- **product_classification_results を分割する**: 画面が 1 テーブル参照で完結している利点がなくなる。
- **栄養だけ別テーブルにする**: 取得元ごとに「その行に紐づく栄養」を持った方が、import や補完ロジックが単純。product_classification_results は「表示用のコピー」で十分。

---

## 4. 具体的な DB 変更提案（まとめ）

### 4.1 必須（すでに用意済み）

- **scraped_products 拡張カラム**  
  - ファイル: `supabase/migrations/20260315000000_add_extended_columns_to_scraped_products.sql`  
  - 内容: manufacturer, flavor, calories, protein_g, carbs_g, fat_g, nutrition_basis_raw, nutrition_raw_text, net_weight_raw の追加。  
  - 適用すれば、Amazon 取得スクリプトで「現行＋拡張」を保存できる。

### 4.2 任意（メーカー側の栄養を対称に持たせる場合）

- **manufacturer_products に栄養カラムを追加**  
  - メーカーサイトから栄養をパースして持たせる場合、scraped_products と揃えると後段の補完ロジックを共通化しやすい。  
  - 追加候補: calories, protein_g, carbs_g, fat_g, nutrition_raw_text（いずれも NULL 許容）。  
  - 追加用の migration を下記に記載する。

### 4.3 コード側の拡張（DB 変更なし）

- **saveClassificationResult**  
  - product_classification_results の calories / protein_grams_per_serving / carbs / fat が AI で null のとき、  
    - Amazon 由来なら scraped_products の calories, protein_g, carbs_g, fat_g を参照して補完  
    - メーカー由来なら manufacturer_products の同様の列（追加後）を参照して補完  
  するようにすると、スクレイプで取れた栄養がそのまま画面に出る。

---

## 5. manufacturer_products 拡張用 migration（任意）

メーカー側でも栄養を保存する場合にのみ実行する。

```sql
-- supabase/migrations/20260315010000_add_nutrition_to_manufacturer_products.sql
alter table manufacturer_products
  add column if not exists calories numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists nutrition_raw_text text;

comment on column manufacturer_products.calories is '1食あたりカロリー (kcal)';
comment on column manufacturer_products.protein_g is '1食あたりタンパク質 (g)';
comment on column manufacturer_products.carbs_g is '1食あたり炭水化物 (g)';
comment on column manufacturer_products.fat_g is '1食あたり脂質 (g)';
comment on column manufacturer_products.nutrition_raw_text is '栄養成分の生テキスト';
```

- 既存のメーカー取得 API では、現状は栄養をパースしていないため、**この migration は「メーカー側でも栄養を取る実装をするとき」でよい**。  
- 先に **scraped_products の拡張だけ**適用し、Amazon 側を確実に動かすことを推奨する。

---

## 6. 「どこに何を保存するか」一覧

| データの種類 | scraped_products | manufacturer_products | product_classification_results |
|--------------|------------------|------------------------|---------------------------------|
| 識別子 | asin, source_url | upsert_key, source_url | (source_text_id で source に紐づく) |
| 商品名・ブランド | title, brand | product_name, manufacturer_name | product_name, display_*, manufacturer |
| フレーバー | flavor（拡張） | flavor | flavor, display_flavor |
| 価格 | price, price_value, price_per_kg | price_text, price_yen, price_per_kg | price_jpy, price_per_kg（取得元から補完） |
| 画像 | image_url | image_url | product_image_url（取得元から補完） |
| 在庫 | availability_raw, is_available | （現状なし） | is_in_stock（主に Amazon から補完） |
| 容量 | net_weight_kg, net_weight_raw（拡張） | unit_text, unit_kg | （必要なら AI や price_per_kg から推論） |
| 栄養 | calories, protein_g, carbs_g, fat_g, nutrition_*（拡張） | 同上（migration 任意） | calories, protein_grams_per_serving, carbs, fat（AI or 取得元補完） |
| 評価 | rating | （現状なし） | avg_rating |

- **取得元 2 テーブル**: それぞれ「その取得元の生データ」を保持。  
- **product_classification_results**: 画面用の「1 商品 1 行」で、取得元テーブルから価格・画像・在庫（および任意で栄養）を補完する。

---

## 7. 結論

- **DB 構成は「既存の 2 取得元テーブル + 中間 + 表示用」のまま**でよい。  
- **変えるのは「列の追加」だけ**で十分。  
  - **scraped_products**: 拡張 migration を適用する。  
  - **manufacturer_products**: 栄養を持たせる場合のみ、上記の任意 migration を追加する。  
- **新テーブルや取得元の統合は行わない**。  
- 必要に応じて **saveClassificationResult** で、scraped_products / manufacturer_products の栄養を product_classification_results に補完するロジックを足すと、取得元と表示の一貫性が取りやすくなる。

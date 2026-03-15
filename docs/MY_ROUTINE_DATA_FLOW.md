# MY ROUTINE のデータ取得フロー

価格・栄養が一覧に出ないときの切り分け用。どこで値が入るか・どこで途切れるかを追う。

---

## 全体の流れ（5段階）

```
[1] manufacturer_sources（登録URL）
        ↓
[2] スクレイプ (POST /api/manufacturers/scrape)
        → 詳細ページ HTML を fetch
        → parseMyroutinePage(html) で価格・栄養・容量をパース
        → manufacturer_products に upsert（upsert_key で一意）
        ↓
[3] import（source-texts 取り込み）
        → manufacturer_products の直近 N 件を読む
        → protein_source_texts に 1 行ずつ upsert
        → source_key = "manufacturer:" + upsert_key
        ↓
[4] classify（POST /api/batch/classify）
        → protein_source_texts の raw_text を AI 分類
        → saveClassificationResult で product_classification_results に保存
        → このとき source_key で manufacturer_products を引いて価格・画像・栄養を「補完」
        ↓
[5] 一覧（トップページ）
        → product_classification_results を is_protein_powder=true で表示
```

**価格・栄養が入るのは [2] でパース → [2] で DB に保存 → [4] で「補完」の2箇所。**  
[2] で manufacturer_products に price_yen 等が入っていないと、[4] で補完しようがなく、一覧にも出ない。

---

## [1] 登録 URL（manufacturer_sources）

- MY ROUTINE 用の 1 行が登録されている前提。
- `manufacturer_code = 'myroutine'` または URL が `myroutine.jp` かつパスが `product_protein` または商品詳細のとき、MY ROUTINE 専用パーサーが使われる。

---

## [2] スクレイプ（価格・栄養が「取れるか」の本命）

### 2-A. 全体スクレイプ（body なし or product_url なし）

1. `manufacturer_sources` から MY ROUTINE の行を取得。
2. `src.url` を fetch（一覧ページ: `.../product_protein/` など）。
3. **一覧ページ**の場合:
   - `parseMyroutineListPage(html, src.url)` で商品詳細 URL のリストを取得（初期 HTML + admin-ajax の「もっと見る」で最大 80 件程度）。
   - 各詳細 URL を 1 本ずつ fetch → `parseMyroutinePage(detailHtml, { ...src, url: detailUrl })` で 1 商品 1 件の `ParsedProduct` を取得。
4. **詳細ページを直接叩く**場合（後述の 2-B）は、その 1 回だけ `parseMyroutinePage`。
5. 全 `ParsedProduct` を `buildUpsertKey(p)` でキー化し、`manufacturer_products` に upsert。  
   - キー: `manufacturer_name|product_name|flavor|unit_text`  
   - ここに **price_yen, price_per_kg, calories, protein_g, unit_text** などが入る。

### 2-B. 1 商品だけスクレイプ（body に product_url あり）

- `product_url` に例: `https://www.myroutine.jp/product_protein/h01-myroutinemaxstr-3000` を指定。
- その URL を 1 回 fetch → `parseMyroutinePage(html, { ...src, url: product_url })` のみ実行。
- 得られた 1 件を同じく `manufacturer_products` に upsert。

### 2-C. 価格・栄養が入る場所（parseMyroutinePage 内）

- **価格**: `extractMyroutinePriceText($, html)`  
  - `.price1` と `.price2` を結合（例: `11,000` + `円(税込)`）  
  - または HTML 正規表現で `<span class="price1">11,000</span>` を探す。  
  - → `parsePrice(priceBlockText)` で `price_yen` を算出。
- **栄養**: `details` の summary が「栄養成分」のものを探し、その中の `.answer` テキストを取得 → `parseMyroutineNutrition(html, detailsAnswerText)` で calories / protein_g 等を抽出。
- **容量**: タイトルから `parseUnit(raw_product_name)` で unit_text / unit_kg を算出。  
- 最後に `price_per_kg = price_yen / unit_kg` を計算し、`ParsedProduct` に詰めて返す。

**ここで price_yen や nutrition が null のままなら、その時点で manufacturer_products にも null で保存される。**  
（import / classify は「既に DB に入っている値」を写すだけなので、スクレイプで取れていないと一生入らない。）

---

## [3] import（manufacturer_products → protein_source_texts）

- `manufacturer_products` を `updated_at` 降順で N 件取得。
- 各行について:
  - `source_key = "manufacturer:" + upsert_key`
  - `raw_text = buildRawTextFromManufacturer(r)`（メーカー名・商品名・フレーバー・容量・価格テキスト・URL などを改行区切りで連結）
- `protein_source_texts` に upsert（onConflict: source_key）。  
→ **import 時点では「価格が入っているか」は変えず、manufacturer_products の内容をそのまま写すだけ。**

---

## [4] classify（product_classification_results への保存と補完）

- `protein_source_texts` の行（pending または productMatch で指定した行）について:
  1. `raw_text` を AI で分類 → 商品名・フレーバー・プロテインかどうかなど。
  2. `saveClassificationResult(sourceTextId, result)` を実行。
     - `protein_source_texts` からその行の **source_key** を取得。
     - `source_name` が `"manufacturer"` かつ `source_key` が `manufacturer:xxxx` のとき、**`xxxx` を upsert_key として manufacturer_products を 1 件検索**。
     - 見つかった行の **price_yen, price_per_kg, image_url, unit_text, calories, protein_g, ...** を取得し、分類結果に「補完」してから `product_classification_results` に upsert。

**補完が効く条件**:  
`protein_source_texts.source_key` の `manufacturer:` 以降の文字列と、`manufacturer_products.upsert_key` が **完全一致**していること。  
（スクレイプで product_name が「マッスルストロベリー風味 3kg」、import 時に別のキーで取り込まれている、などでずれると補完されない。）

---

## [5] 一覧表示

- `product_classification_results` のうち `is_protein_powder = true` を表示。
- 表示している価格・画像・栄養は、すべて [4] までで入った値（＝ [2] で manufacturer_products に入り、[4] で補完されたもの）。

---

## 価格が「何も入ってない」ときに確認すること

1. **manufacturer_products に価格が入っているか**  
   - Supabase で `SELECT manufacturer_name, product_name, price_yen, price_per_kg, unit_text, upsert_key FROM manufacturer_products WHERE manufacturer_name ILIKE '%MY ROUTINE%' OR product_name ILIKE '%マッスル%' LIMIT 20;` などで確認。  
   - ここで price_yen が null なら、**原因は [2] のパース**。  
     - 実際に fetch している HTML に `.price1` / `.price2` があるか、または正規表現で拾える形か確認する必要あり。

2. **補完が効いているか（source_key と upsert_key の一致）**  
   - 診断 API:  
     `GET /api/manufacturers/scrape-diagnose?product=マッスルストロベリー`  
   - `product_investigation.classification_results_matching` の **expected_mp_key** と、`manufacturer_products_matching` の **upsert_key** が一致しているか確認。  
   - 一致していないと [4] で manufacturer_products を引けず、価格は null のまま。

3. **import は実行したか**  
   - スクレイプの直後に「import」を実行しないと、新しい manufacturer_products の行が protein_source_texts に反映されない。  
   - 反映後、該当商品だけ classify するなら:  
     `POST /api/batch/classify` body: `{ "productMatch": { "manufacturer": "My Routine", "productName": "マッスルストロベリー" } }`

---

## 価格が取れないときのデバッグ（パース段階の確認）

**指定URLで「取得HTML」と「パース結果」だけ見る:**

```bash
curl "http://localhost:3000/api/manufacturers/scrape-debug?product_url=https://www.myroutine.jp/product_protein/h01-myroutinemaxstr-3000"
```

レスポンスで次を確認する。

- **price.extracted_text**: 抽出した価格テキスト（空ならセレクタか HTML 構造が違う）
- **price.parse_result**: `parsePrice` の結果（price_yen が null なら表記が想定外）
- **nutrition.details_block_found**: 栄養の `details` ブロックを見つけたか
- **html_snippet_around_price**: 価格付近の生 HTML（サーバーが返している実際のタグを確認できる）

ここで `extracted_text` も `parse_result.price_yen` も取れていれば、スクレイプ本番でも同じ HTML が返っている限り DB に入る。取れていなければ、HTML の違い（JS で差し替えている・別テンプレート）を疑う。

---

## 関連ファイル（コード上の入口）

| 段階 | ファイル・API |
|------|----------------|
| [1] 登録 | Supabase `manufacturer_sources` テーブル |
| [2] スクレイプ | `app/api/manufacturers/scrape/route.ts` — `POST`, `parseMyroutineListPage`, `parseMyroutinePage`, `extractMyroutinePriceText`, `parseMyroutineNutrition` |
| [3] import | `src/batch/import-source-texts.ts` の `importManufacturer` または `POST /api/source-texts/import`（targets: manufacturer） |
| [4] 補完 | `src/lib/batchDb.ts` の `saveClassificationResult`（source_key → manufacturer_products 検索） |
| [5] 一覧 | `app/page.tsx`（product_classification_results を取得して表示） |
| デバッグ | `GET /api/manufacturers/scrape-debug?product_url=...` — 指定URLの取得・パース結果と HTML スニペット |

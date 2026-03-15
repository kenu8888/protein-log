# メーカー取得データが画面に出ないときの切り分け

スクレイプは成功したが、一覧に価格・栄養などが表示されない場合の確認手順。

---

## データの流れ（概要）

```
[スクレイプ] → manufacturer_products（価格・栄養を保存）
     ↓
[import]    → protein_source_texts（source_key = "manufacturer:upsert_key"）
     ↓
[classify]  → product_classification_results（manufacturer_products から価格・栄養を補完）
     ↓
[画面]      → product_classification_results を is_protein_powder=true で表示
```

どこで途切れているかを順に確認する。

---

## ステップ 1: manufacturer_products に価格・栄養が入っているか

Supabase SQL Editor で実行:

```sql
-- MY ROUTINE の直近 23 件: price_yen / 栄養が null でないか
SELECT
  manufacturer_name,
  product_name,
  flavor,
  price_yen,
  price_per_kg,
  calories,
  protein_g,
  upsert_key,
  updated_at
FROM manufacturer_products
WHERE manufacturer_name ILIKE '%MY ROUTINE%'
ORDER BY updated_at DESC
LIMIT 25;
```

**確認ポイント**

- `price_yen` がほとんど null → スクレイプの価格パース（.price1 + .price2）が効いていない、または対象ページのHTMLが想定と違う。
- `calories` / `protein_g` が null → 栄養パース（栄養成分表示ブロックの正規表現）が効いていない。
- 行自体が 0 件 → スクレイプ対象メーカーが別名で保存されている。`SELECT DISTINCT manufacturer_name FROM manufacturer_products;` で名称を確認。

---

## ステップ 2: protein_source_texts に取り込まれているか

```sql
-- メーカー由来の source_text が pending で残っていないか / 件数
SELECT status, COUNT(*) as cnt
FROM protein_source_texts
WHERE source_name = 'manufacturer'
GROUP BY status;
```

**確認ポイント**

- `pending` がたくさん残っている → classify の limit（150）を超えているか、classify が失敗している。
- メーカー行が 0 件 → import が動いていない、または manufacturer_products の `updated_at` が古くて import の「直近 limit 件」に含まれていない。

**source_key と manufacturer_products.upsert_key の対応**

補完は `source_key` の **`manufacturer:` 以降** を `upsert_key` として manufacturer_products を引く。一致しないと価格・栄養が補完されない。

手動で比較する例:

```sql
-- protein_source_texts の source_key（: 以降が upsert_key）
SELECT source_key FROM protein_source_texts WHERE source_name = 'manufacturer' ORDER BY created_at DESC LIMIT 5;
-- manufacturer_products の upsert_key
SELECT upsert_key FROM manufacturer_products WHERE manufacturer_name ILIKE '%MY ROUTINE%' ORDER BY updated_at DESC LIMIT 5;
```

`source_key` が `manufacturer:メーカー名|商品名|フレーバー|容量` のとき、`メーカー名|商品名|フレーバー|容量` が `upsert_key` と完全一致している必要がある。

---

## ステップ 3: product_classification_results に反映されているか

```sql
-- メーカー由来で is_protein_powder=true の行に価格が入っているか
SELECT
  id,
  manufacturer,
  display_product_name,
  price_jpy,
  price_per_kg,
  protein_grams_per_serving,
  calories,
  is_protein_powder,
  product_url
FROM product_classification_results
WHERE manufacturer ILIKE '%MY ROUTINE%'
ORDER BY created_at DESC
LIMIT 25;
```

**確認ポイント**

- 行が 0 件 → classify で「プロテイン」と判定されていない（`is_protein_powder = false` になっている）、または import されていない。
- `price_jpy` が null → ステップ 1 で manufacturer_products に price_yen がない、またはステップ 2 の upsert_key 不一致で補完されていない。
- `is_protein_powder = false` が多い → 分類ロジック／プロンプトの見直し。

---

## ステップ 4: 画面が参照しているテーブル・カラム

一覧は `product_classification_results` を `is_protein_powder = true` で取得し、`price_jpy` / `price_per_kg` 等を表示している。  
ステップ 3 でここに値が入っていれば、画面にも出る。

---

## デバッグ API（件数だけさっと見る）

開発サーバー起動中に、**ブラウザで開く**か、**ターミナルで curl** する。

```bash
curl http://localhost:3000/api/manufacturers/scrape-diagnose
```

（ポートが 3001 の場合は `http://localhost:3001/...` に変える。`GET` はコマンドではないので `curl` を使う。）

- **manufacturer_products**: 直近30件の価格・栄養の有無、サンプル3件
- **protein_source_texts**: メーカー由来の件数、status 別内訳、source_key サンプル
- **product_classification_results**: 直近50件の is_protein_powder / price_jpy の有無、サンプル5件

**特定商品で「同じ商品が複数出る」「価格・容量が空」を調査するとき**

```bash
curl "http://localhost:3000/api/manufacturers/scrape-diagnose?product=マッスルストロベリー"
```

レスポンスの `product_investigation` に以下が入る。

- **manufacturer_products_matching**: 商品名に「マッスルストロベリー」を含む manufacturer_products の行（upsert_key, price_yen, unit_text 等）。ここに価格・容量があればスクレイプは取れている。
- **classification_results_matching**: 同じく該当する product_classification_results の行と、それぞれの `source_text_id` に対応する **source_key_from_texts**（＝ protein_source_texts.source_key）。  
  **expected_mp_key** が manufacturer_products_matching のいずれかの **upsert_key** と一致していれば補完される。一致していないと価格が入らない（import 時の upsert_key と scrape 保存時の upsert_key の差など）。

---

## よくある原因まとめ

| 現象 | 想定原因 |
|------|----------|
| 価格が全部 null | スクレイプの価格セレクタ（.price1 + .price2）が対象ページと合っていない |
| 栄養が全部 null | 栄養ブロックの正規表現がページ表記と合っていない / migration 未適用 |
| 一覧にメーカー商品が出ない | is_protein_powder が false になっている、または import/classify が動いていない |
| 価格が DB にはあるが一覧にない | source_key と upsert_key の不一致で補完されていない |

---

## 診断結果の読み方の例

- **manufacturer_products.with_price_yen が 24 など十分ある**のに、**product_classification_results の MY ROUTINE の price_jpy が null** のとき:
  - **protein_source_texts.by_status** を確認する。`pending` や `error` が多く、`processed` が少ないと、価格が入っているメーカー行がまだ分類されていないか、分類でエラーになっている。
  - **error が多い場合**: Supabase で `SELECT id, source_key, error_message FROM protein_source_texts WHERE status = 'error' LIMIT 10;` を実行し、`error_message` の内容を確認する（API キー・レート制限・スキーマ不一致など）。
  - **対処**: メーカーを再取得したあとは、**import をやり直してから classify をやり直す**と、現在の manufacturer_products の upsert_key と source_key が揃い、補完が効きやすくなる。

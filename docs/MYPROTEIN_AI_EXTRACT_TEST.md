# マイプロテイン AI 抽出テスト

メーカー（マイプロテイン）で `/api/ai-extract-product` の精度を確認するためのテスト API と実行方法。

## 前提

- Next を起動済み（`npm run dev`）
- `GENAI_API_KEY`（または `GOOGLE_GENAI_API_KEY`）が設定されていること
- `manufacturer_sources` に `manufacturer_code = 'myprotein'` の行が登録されていること

## テストの流れ

1. **商品URLの取得**
   - `manufacturer_sources` の myprotein の URL（例: https://www.myprotein.jp/）を取得
   - そのページの HTML から **商品詳細ページのみ** のリンクを収集（パスが `/p/カテゴリ/商品スラグ/数値ID/` または `.../数値ID.html` の形式に限定。カテゴリ一覧 `/c/...` は除外）
   - 各リンク先を取得し、`#product-title` があるページだけを「詳細ページ」と判定し、最大 20 件に絞る
   - 一覧が JS 描画でリンクが取れない場合は、後述の **手動で URLs を渡す** 方法を使う

2. **各詳細ページで**
   - HTML を fetch し、本文テキストを抽出（script/style 除去）
   - そのテキストを `POST /api/ai-extract-product` に送り、栄養・価格・フレーバー等を取得
   - 既存の `manufacturer_products` の行（同じ source_url）があれば `existing` として返却し、AI 結果と比較可能にする

3. **レスポンス**
   - `total_fetched`: 対象にした URL 数
   - `total_ai_ok`: AI が「単体商品ページ」と判定した件数
   - `total_with_nutrition`: タンパク質（protein_g）が取れた件数
   - `results`: 各 URL ごとの `url`, `existing`（DB の値）, `ai`（AI 抽出結果）, `page_text_preview`

## 実行方法

### 1) 自動で最大 20 件（一覧からリンク収集）

**注意**: 20 件だと「一覧取得 → 各詳細 fetch → 各ページで AI 呼び出し」のため **5〜10 分**かかります。curl はレスポンスが返るまで何も表示されません。まずは **limit: 3** で動作確認してから 20 に増やすことを推奨します。

```bash
# 動作確認（3件・1分以内に返ることが多い）
curl -X POST "http://localhost:3001/api/manufacturers/ai-extract-test" \
  -H "Content-Type: application/json" \
  -d '{"manufacturer_code":"myprotein","limit":3}' \
  --max-time 120 \
  -o myprotein-ai-test-result.json

# 20件（5〜10分かかる。--max-time 600 推奨）
curl -X POST "http://localhost:3001/api/manufacturers/ai-extract-test" \
  -H "Content-Type: application/json" \
  -d '{"manufacturer_code":"myprotein","limit":20}' \
  --max-time 600 \
  -o myprotein-ai-test-result.json
```

処理中は **Next を起動しているターミナル** にログが出ていればサーバーは動いています。レスポンスは「全件処理が終わってから」一括で返ります。

または用意したスクリプト:

```bash
# LIMIT=20 がデフォルト。結果は scripts/myprotein-ai-test-result.json
./scripts/run-myprotein-ai-test.sh
```

### 2) 手動で URL を指定（JS 描画で一覧から取れない場合）

ブラウザでマイプロテインの商品詳細ページを 20 件開き、URL をコピーして `urls` で渡す。

```bash
curl -X POST "http://localhost:3001/api/manufacturers/ai-extract-test" \
  -H "Content-Type: application/json" \
  -d '{
    "manufacturer_code": "myprotein",
    "limit": 20,
    "urls": [
      "https://www.myprotein.jp/products/xxx",
      "https://www.myprotein.jp/products/yyy"
    ]
  }' \
  --max-time 600 \
  -o myprotein-ai-test-result.json
```

## 精度の確認の仕方（Amazon の check_sync_result と同様）

### 取得率レポート（推奨）

テスト結果を JSON で保存したあと、次のコマンドで **項目ごとの取得率** を表示できる。

```bash
# デフォルト: scripts/myprotein-ai-test-result.json を読む
npm run batch:check-myprotein-ai-result

# 別ファイルを指定
npx tsx scripts/check-myprotein-ai-result.ts path/to/result.json
```

表示内容:

- 各項目（メーカー・フレーバー・価格・栄養・1食あたりg など）の **取得件数 / 総件数** と **取得率（%）** のバー
- **コア4項目**（価格・内容量・単価・容量表記）すべて取得した件数
- **拡張4項目**（カロリー・蛋白・メーカー・フレーバー）すべて取得した件数

### 未取得の製品一覧（URL 付き）

```bash
npx tsx scripts/check-myprotein-ai-result.ts --missing scripts/myprotein-ai-test-result.json
```

フレーバー・栄養成分・1食あたり(g) のいずれかが未取得の製品を、URL と未取得項目付きで一覧する（Amazon の `--missing` と同じ考え方）。

### 手動で確認する場合

1. **サマリ**
   - `total_ai_ok` が 20 に近いか（＝ほぼすべて「単体商品ページ」と判定されているか）
   - `total_with_nutrition` が何件か（＝栄養が取れているか）

2. **results を 1 件ずつ**
   - `ai.manufacturer` / `ai.flavor` / `ai.unit_text` / `ai.price_jpy` が妥当か
   - `ai.calories` / `ai.protein_g` / `ai.carbs_g` / `ai.fat_g` が実際の表示と一致するか
   - `existing` がある行は、Cheerio パース結果（価格・フレーバー等）と AI 結果を並べて比較できる

3. **エラー**
   - `ai.error` や `fetch_error` が出ている行は、ネットワーク・API 制限・ページ構造のどれかで失敗している可能性がある

## 404 判定の仕様（マイプロテイン専用）

終了・削除された商品は 200 で「お探しのページは見つかりませんでした」の HTML を返す。  
これを検知して `fetch_error: "ページが見つかりませんでした（404）"` とし、AI 抽出対象から外している。

- **対象とする HTML**: `<script>` / `<style>` / `<noscript>` を除いた HTML（全ページに含まれる tenantConfig の翻訳 JSON に同じ文言があるため、script 内のヒットは無視する）。
- **404 とみなす条件**: 上記 HTML 内の **`<h1>`** のいずれかに「お探しのページは見つかりませんでした」が含まれる場合のみ。  
  マイプロテインの 404 ページは `<h1 class="text-small-xl md:text-xl">お探しのページは見つかりませんでした</h1>` で表示するため、この条件で確実に判定する。
- 商品ページにはこの h1 は存在しないため、誤検知を避けつつ終了ページだけを除外できる。

## 「お探しのページは見つかりませんでした」が未取得に出る場合の調査

未取得の URL をブラウザで開くと **お探しのページは見つかりませんでした** と表示される場合、  
「サーバー取得時には何が返っていたか」を **diagnostic** で確認できる。

### 結果 JSON で見る項目

各 `results[]` の要素に **`diagnostic`** が含まれる（その URL を fetch したときの情報）。

| キー | 意味 |
|------|------|
| `has_404_phrase` | 取得した HTML に「お探しのページは見つかりませんでした」が **含まれていたか** |
| `is_404_phrase_visible` | script 除く HTML の **`<h1>`** に「お探しのページは見つかりませんでした」が含まれるか。マイプロテインの 404 ページはこの h1 で表示するため、ここで 404 を判定する。 |
| `product_title_preview` | `#product-title` のテキスト（先頭80文字）。空なら `"(空)"` |
| `product_title_length` | `#product-title` の文字数（0＝空） |
| `doc_title` | `<title>` の内容（先頭80文字） |

### 調べ方（精度を上げるための切り分け）

1. **未取得一覧に出た URL** を結果 JSON で検索する（`results[].url` で一致）。
2. その要素の **`diagnostic`** を確認する。404 判定は **`<h1>` に該当文言があるか**（`is_404_phrase_visible`）で行っている。

| 状況 | 想定と次のアクション |
|------|------------------------|
| `is_404_phrase_visible: true` なのに未取得に出ている | 本来は 404 として除外されるはず。h1 セレクタや script 除外の不具合を疑う。 |
| `is_404_phrase_visible: false` だがブラウザでは 404 | 取得時 HTML には 404 用 h1 が無かった。サーバーとブラウザで返す内容が違う可能性。User-Agent 調整や手動 `urls` 運用を検討。 |
| `has_404_phrase: true` かつ `is_404_phrase_visible: false` | 文言は script 内（翻訳 JSON）にのみ存在。正しく 404 扱いされていない（商品ページ）。 |

3. **複数 URL で同じ傾向か** を見る。  
4. 判定ロジックは `app/api/manufacturers/ai-extract-test/route.ts` の `hasMyprotein404Heading` / `isMyproteinNotFoundPage` を参照。

### コマンド例（未取得 URL の diagnostic を確認）

```bash
# 未取得一覧と一緒に diagnostic を表示（has_404_phrase / product_title_length / doc_title）
npx tsx scripts/check-myprotein-ai-result.ts --missing --diagnostic
```

結果 JSON を直接 jq する場合:

```bash
jq '.results[] | select(.ai != null and .fetch_error == null) | select(.ai.protein_g == null or .ai.flavor == null) | {url, diagnostic}' myprotein-ai-test-result.json
```

## 一覧から URL が取れないときの調査（debug）

一覧ページからのリンク収集が動かない場合、原因を切り分けるために **debug モード** を使う。

```bash
curl -s -X POST "http://localhost:3001/api/manufacturers/ai-extract-test" \
  -H "Content-Type: application/json" \
  -d '{"debug":true}'
```

返却される JSON の見方と、`steps` を順に確認する方法。

### レスポンスの全体構造

```json
{
  "message": "一覧URL取得のデバッグ結果。どの step で ok:false か確認してください。",
  "list_url": "https://www.myprotein.jp/",
  "steps": [
    { "step": "1_manufacturer_sources", "ok": true, "ms": 120, "detail": { "data": [...], "error": null } },
    { "step": "2_manufacturer_products", "ok": true, "ms": 80 },
    ...
  ]
}
```

| キー | 意味 |
|------|------|
| **message** | デバッグの説明文。 |
| **list_url** | 一覧として取得に使った URL（DB の manufacturer_sources の値）。 |
| **steps** | 各ステップの結果の配列。**上から順に** 1 → 2 → … と実行した結果。 |

### steps の各要素の見方

各要素は次の形です。

| キー | 意味 |
|------|------|
| **step** | ステップ名（1_manufacturer_sources, 2_manufacturer_products, …）。 |
| **ok** | `true`＝成功、`false`＝失敗 or タイムアウト。 |
| **ms** | そのステップにかかった時間（ミリ秒）。 |
| **error** | 失敗時のみ。理由（例: `タイムアウト(20000ms)`）。 |
| **detail** | 成功時の中身（件数・status・links_count など）。 |

### 各 step の意味と対処

| step | 内容 | ok:false のとき |
|------|------|-----------------|
| **1_manufacturer_sources** | DB から myprotein の一覧 URL 取得。 | 登録がない or DB タイムアウト。`manufacturer_sources` に myprotein を登録する。 |
| **2_manufacturer_products** | DB から既存商品の source_url 取得。 | DB タイムアウト。 |
| **3_fetch_list_page** | listUrl へ HTTP GET。 | サイトがブロック or 遅延。**マイプロテインがサーバーアクセスを弾いている可能性。** |
| **4_read_list_body** | レスポンス body を .text() で取得。 | 接続はあるが body が返ってこない or 読み取りでハング。 |
| **5_parse_links** | HTML から **商品詳細URLのみ** 抽出（`/p/.../数値ID/` 形式に限定。カテゴリ `/c/...` は含めない）。 | **detail.links_count が 0** → 初回 HTML に商品詳細リンクが無い（SPA で JS 描画、または TOP に /p/ リンクが無い）。 |
| **6_fetch_first_detail** | 1本目のリンク先を取得し #product-title の有無を確認。 | 詳細ページの取得 or パースで失敗。 |

### 結果の解釈の例

- **3 で ok:false / タイムアウト** → マイプロテインがサーバーからのアクセスをブロック or 遅延している。
- **4 で ok:false** → 接続はあるが body の読み取りで止まっている。
- **5 で ok:true だが detail.links_count が 0** → 初回 HTML に商品リンクが無い（JS で描画している）。手動で `urls` を渡す運用が現実的。

### コマンド例（1行ずつコピーして実行）

次の行は**1行ずつ**コピーして実行してください。`#` や `...` をそのまま貼ると「command not found」になります。

```bash
curl -s -X POST "http://localhost:3001/api/manufacturers/ai-extract-test" -H "Content-Type: application/json" -d '{"debug":true}' | jq .
```

steps だけ見る場合（上と同じ curl の末尾を `| jq '.steps'` に変更）:

```bash
curl -s -X POST "http://localhost:3001/api/manufacturers/ai-extract-test" -H "Content-Type: application/json" -d '{"debug":true}' | jq '.steps'
```

失敗した step だけ見る場合:

```bash
curl -s -X POST "http://localhost:3001/api/manufacturers/ai-extract-test" -H "Content-Type: application/json" -d '{"debug":true}' | jq '.steps[] | select(.ok == false) | {step, error}'
```

jq が入っていない場合は、`| jq .` を外すと生の JSON が表示されます。

## 関連

- API: `app/api/manufacturers/ai-extract-test/route.ts`
- AI 抽出: `app/api/ai-extract-product/route.ts`
- 既存メーカースクレイプ: `app/api/manufacturers/scrape/route.ts`（Cheerio のみ、AI は未使用）

# メーカー一括スクレイプの実行手順

メーカーサイト（MY ROUTINE 含む）の取得を実行するためのコマンドと、デバッグのやり方。

---

## 1. 開発サーバー起動

```bash
npm run dev
```

デフォルトで **http://localhost:3000** で起動。ポートを変えている場合はターミナル表示に従う。

---

## 2. manufacturer_sources の登録（MY ROUTINE）

MY ROUTINE を取得するには、Supabase の `manufacturer_sources` に次の条件で 1 行ある必要がある。

| カラム | 値 |
|--------|-----|
| `url` | `https://www.myroutine.jp/product_protein/` |
| `manufacturer_code` | **`myroutine`**（小文字推奨） |
| `manufacturer_name` | 任意（例: `MY ROUTINE`） |

- `manufacturer_code` が `myroutine` でなくても、**URL が上記の一覧ページ**なら、コード側の URL 一致フォールバックで MY ROUTINE 用の処理（一覧→AJAX→各詳細）が動く。
- デバッグ API で「一覧URLは登録済みですが manufacturer_code が 'myroutine'（小文字）でない可能性があります」と出る場合は、登録はあるが code が不一致。スクレイプは実行される。

---

## 3. デバッグ API（MY ROUTINE の動作確認）

どこで失敗しているか確認したいときに使う。

```bash
# 開発サーバー起動後
curl http://localhost:3000/api/manufacturers/scrape-debug
```

またはブラウザで **http://localhost:3000/api/manufacturers/scrape-debug** を開く。

### 結果の見方

| 項目 | 期待値・意味 |
|------|----------------|
| `manufacturer_sources.myroutine_found` | `true` なら DB に `manufacturer_code=myroutine` の行あり。`false` でも URL 登録があれば `note` で案内され、本番スクレイプは動く。 |
| `product_detail_link_count` | 一覧から抽出した**商品詳細URL**の数（concept/brand 等は除く）。0 でなければ OK。 |
| `ajax_chunk_link_count` | 「もっと見る」1 回分の HTML から取れたリンク数。6 前後が目安。 |
| `ajax_sample_links` | 正しい商品URL（`/product_protein/スラッグ/`）の並びなら、AJAX の JSON→html パースは成功。 |
| `first_detail_url` | 商品詳細ページの URL になっていること。 |
| `detail_page.has_bottom_area_price` | `true` かつ `bottom_area_price_preview` に価格（例: ￥1,980）が出ていれば、詳細ページの価格取得は成功。 |

**特定URLで価格・栄養のパース結果だけ確認する（原因調査用）:**

```bash
curl "http://localhost:3000/api/manufacturers/scrape-debug?product_url=https://www.myroutine.jp/product_protein/h01-myroutinemaxstr-3000"
```

レスポンスで `price.extracted_text` / `price.parse_result` / `nutrition` / `html_snippet_around_price` を確認できる。詳細は `docs/MY_ROUTINE_DATA_FLOW.md` を参照。

---

## 4. 本番スクレイプの実行

```bash
curl -X POST http://localhost:3000/api/manufacturers/scrape
```

本番環境の場合は、デプロイ先のオリジンに変える。

```bash
curl -X POST https://あなたのドメイン/api/manufacturers/scrape
```

- 全メーカー（`manufacturer_sources` の全件）が対象。

### 1 メーカーだけ実行する（時間短縮）

リクエスト body で `manufacturer_code` または `manufacturer_name` を指定すると、そのメーカーだけスクレイプする。

```bash
# manufacturer_code で指定（推奨・大文字小文字無視）
curl -X POST http://localhost:3000/api/manufacturers/scrape \
  -H "Content-Type: application/json" \
  -d '{"manufacturer_code": "myroutine"}'

# manufacturer_name で部分一致
curl -X POST http://localhost:3000/api/manufacturers/scrape \
  -H "Content-Type: application/json" \
  -d '{"manufacturer_name": "MY ROUTINE"}'
```

- `manufacturer_code`: DB の `manufacturer_code` と完全一致（例: `myroutine`, `myprotein`）。
- `manufacturer_name`: `manufacturer_name` に指定文字列が含まれる、または一致する行のみ対象。

### 1商品だけ指定して更新（動作確認用）

メーカー＋**商品詳細URL**を指定すると、その1商品だけ取得して `manufacturer_products` を更新する。一覧取得や他メーカーは叩かず、そのURL 1回だけ fetch するので短時間で完了する。

```bash
# 商品URLのみ（同一オリジンで登録されているメーカーを自動判定）
curl -X POST http://localhost:3000/api/manufacturers/scrape \
  -H "Content-Type: application/json" \
  -d '{"product_url": "https://www.myroutine.jp/product_protein/h09-lats-strawberry-1000/"}'

# メーカーも明示する場合
curl -X POST http://localhost:3000/api/manufacturers/scrape \
  -H "Content-Type: application/json" \
  -d '{"product_url": "https://www.myroutine.jp/product_protein/h09-lats-strawberry-1000/", "manufacturer_name": "MY ROUTINE"}'
```

- `product_url`: 商品詳細ページのURL（必須）。MY ROUTINE / MyProtein など、登録済みメーカーの詳細ページに対応。
- `manufacturer_name` または `manufacturer_code`: 省略可。同一オリジンに複数メーカー登録がある場合に指定する。
- 成功時は「1商品を更新しました」と返り、import/classify は自動では走らない（手動で実行するか、全体スクレイプで反映）。

---

## 5. 実装の参照先

- **メイン**: `app/api/manufacturers/scrape/route.ts`  
  - MY ROUTINE: `code === "myroutine"` または URL が `myroutine.jp` かつパスが `product_protein` のときに一覧フロー。
  - `parseMyroutineListPage`（一覧＋AJAX）、`parseMyroutinePage`（詳細）、`isMyroutineProductDetailUrl`（商品URL判定）。
- **デバッグ**: `app/api/manufacturers/scrape-debug/route.ts`  
  - 一覧 fetch → リンク数・商品のみ件数 → AJAX 1 回 → 1 件目詳細の h1 / `.bottom_area .price` を返す。

詳細な改善手順・欠損調査は `docs/MANUFACTURER_SCRAPE_IMPROVEMENT.md` を参照。

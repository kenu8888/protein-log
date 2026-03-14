# メーカー系データ取得の精度改善

価格・栄養情報などが取れていないケースを減らすための手順とメモ。

---

## MY ROUTINE の取得フロー（現状）

- **一覧ページ**: `https://www.myroutine.jp/product_protein/` を `manufacturer_sources.url` に登録する。
- スクレイパーはこの URL を **一覧ページ** と判定し、HTML から商品詳細へのリンクを抽出 → 各詳細ページを fetch → 詳細ページ用パーサー（`.bottom_area .price` で価格取得）でパースする。
- **「もっと見る」**: 一覧は「もっと見る」で `admin-ajax.php`（XHR）を叩いて追加読み込みしている。スクレイパー側で **同じ admin-ajax.php に offset 36, 72, 108... で POST し、返ってきた HTML からも商品リンクを収集**している。action 名と nonce は一覧ページの `.entry-more` の `data-action` / `data-nonce` またはインラインスクリプトから自動取得。取得できない場合は初期 HTML に含まれるリンクのみになる。その場合は DevTools の Network で「もっと見る」クリック時の `admin-ajax.php` の Request Payload（`action`, `nonce` など）を確認し、サイトの HTML に `data-action` / `data-nonce` が出力されるようテーマを調整するか、コード側でその action 名をフォールバックとして扱う必要がある。

---

## 調査ステップ 1: 「取れていないケース」を一覧化する（まずここをやる）

**目的**: どのメーカーで価格や栄養が欠けているかを数値で把握し、改善の優先順位をつける。

### 手順

1. **Supabase Dashboard** を開く → 対象プロジェクト → **SQL Editor**。
2. 次の SQL を貼り付けて **Run** する。

```sql
-- メーカー別: 件数・価格欠損数・サンプルURL
select
  manufacturer_name,
  coalesce(manufacturer_code, '(なし)') as manufacturer_code,
  count(*) as total,
  count(*) filter (where price_yen is null) as missing_price_yen,
  count(*) filter (where price_text is null) as missing_price_text,
  count(*) filter (where unit_text is null and unit_kg is null) as missing_unit,
  (array_agg(source_url) filter (where source_url is not null))[1] as sample_url
from manufacturer_products
group by manufacturer_name, manufacturer_code
order by missing_price_yen desc, total desc;
```

3. 結果をコピーして、**メーカー名ごと**に次のように整理する（表計算やメモで可）。
   - **total**: そのメーカーの登録商品数
   - **missing_price_yen**: 価格（数値）が取れていない件数
   - **missing_price_text**: 価格（表示用テキスト）が取れていない件数
   - **missing_unit**: 容量が取れていない件数
   - **sample_url**: 1件の商品URL（ブラウザで開いて「なぜ取れていないか」を確認する用）

4. **欠損が多いメーカー**から、`sample_url` をブラウザで開き、
   - 価格がどの要素・クラスに書かれているか
   - 栄養成分がどのブロック（表・div・クラス名）にあるか  
   をメモする。そのメモが「パーサー改善（セレクタ追加・専用パーサー）」の材料になる。

### 次のアクション

- **価格が取れていない**: `app/api/manufacturers/scrape/route.ts` の、そのメーカー用パーサー（`parseMyproteinPage` / `parseMyroutinePage`）または汎用の `parseManufacturerPage` で、**価格を読んでいるセレクタ・正規表現**を、実際のHTMLに合わせて修正する。
- **栄養が取れていない**: 現状のスクレイパーは栄養を取得していない。上記でメモした「栄養が書いてあるブロック」を元に、`ParsedProduct` と各パーサーに栄養用の抽出ロジックを追加する。

---

## 補足: 栄養カラムがある場合

migration `20260315010000_add_nutrition_to_manufacturer_products.sql` を適用している場合は、次のように栄養の欠損も集計できる。

```sql
select
  manufacturer_name,
  count(*) as total,
  count(*) filter (where price_yen is null) as missing_price_yen,
  count(*) filter (where calories is null) as missing_calories,
  count(*) filter (where protein_g is null) as missing_protein_g,
  (array_agg(source_url) filter (where source_url is not null))[1] as sample_url
from manufacturer_products
group by manufacturer_name
order by missing_price_yen desc, missing_calories desc, total desc;
```

（`calories` / `protein_g` が存在しない場合はこのクエリはエラーになるので、そのときは上の「価格・単位のみ」のクエリを使う。）

# 楽天から商品情報を取得する設計案

Amazon・メーカーと同様に、楽天のプロテイン商品を「取得 → 一覧表示」までつなぐための案をまとめる。

---

## 楽天 API で取得できる項目（必須要件との対応）

[Rakuten Ichiba Item Search API（2022-06-01）](https://webservice.rakuten.co.jp/documentation/ichiba-item-search) の**出力パラメータ**に基づく。

| 欲しい情報 | API の項目 | 取得可否 | 備考 |
|------------|------------|----------|------|
| **価格** | `itemPrice` | ✅ 取得できる | 数値（円）で返る。必須要件を満たす。 |
| **商品名** | `itemName` | ✅ 取得できる | 表示用の商品名。必須要件を満たす。 |
| **フレーバー** | 専用項目なし | ⚠️ 直接は取れない | 商品名や `itemCaption`（商品説明）に「チョコ」「バニラ」等が含まれることは多い。**raw_text に含めて既存の AI 分類（classify）に渡せば、そこでフレーバー推定は可能**。 |
| **栄養成分** | 専用項目なし | ❌ 構造化では取れない | `itemCaption` に説明文として含まれる可能性はあるが、API では項目として提供されない。**「栄養が埋まらない程度」であれば許容する前提で問題ない**。 |

- **結論**: **価格・商品名は API で必須要件を満たせる。** フレーバーは API には項目がないが、商品名＋説明文を `raw_text` として import し、既存の classify でフレーバーを推定すれば補える。栄養は API では取れないが、想定どおり「空でもよい」でよい。

---

## 1. 取得方法の比較

| 方法 | メリット | デメリット | 推奨度 |
|------|----------|------------|--------|
| **楽天市場 API（Ichiba API）** | 公式・安定、スクレイプ不要、利用規約に沿う。キーワード検索で商品一覧・価格・URL・画像を取得可能。 | アプリID取得（無料）が必要。1リクエストあたり最大30件、レート制限あり。 | **推奨** |
| **スクレイピング（Playwright 等）** | 画面と同等の情報を取得できる可能性。 | HTML変更で壊れやすい、楽天の利用規約で禁止されている可能性が高い。 | 非推奨 |

**結論**: **楽天市場 API（Ichiba Item Search）** でキーワード検索し、取得した商品を DB に投入する形が最適。

- 申請: [Rakuten Web Service](https://webservice.rakuten.co.jp/) でアプリ登録 → **アプリID** を取得（無料）。
- API: [楽天商品検索API（IchibaItemSearch）](https://webservice.rakuten.co.jp/documentation/ichiba-item-search) で `keyword=プロテイン` などで検索、ページング（1〜30ページ、1ページ最大30件）で取得。

---

## 2. データフロー（既存と揃える）

```
[楽天 API]  IchibaItemSearch（キーワード検索 + ページング）
        ↓
  rakuten_products  （1商品 = 1 itemCode = 1行、upsert キー: item_code）
        ↓
  import (targets に "rakuten" 追加)  →  protein_source_texts  （source_key = "rakuten:{item_code}"）
        ↓
  classify (既存のまま)  →  product_classification_results
        ↓
  画面表示（既存のまま。楽天由来の行は rakuten_products から価格・画像・URL を補完）
```

- **Amazon** は `scraped_products`、**メーカー** は `manufacturer_products` と分かれているのと同様に、**楽天用に `rakuten_products` を新設**する。
- import で `targets: ["rakuten"]` を追加し、`protein_source_texts` の `source_key` を `rakuten:{item_code}` にする。
- 分類バッチ（classify）は既存のまま。**saveClassificationResult** に「`source_name === "rakuten"` のときは `rakuten_products` から価格・画像・URL を補完する」分岐を追加する。

---

## 3. テーブル案: `rakuten_products`

楽天 API のレスポンスと、既存の `scraped_products` を参考にした最小構成。

| カラム | 型 | 必須 | 説明 |
|--------|------|------|------|
| **item_code** | text | **必須** | 楽天の商品コード（一意キー）。API の `itemCode`。 |
| **title** | text | 推奨 | 商品名。 |
| **shop_name** | text | 任意 | ショップ名。 |
| **image_url** | text | 任意 | 商品画像 URL。 |
| **price** | text | 任意 | 価格の表示用（例: "3,980円"）。 |
| **price_value** | numeric | 任意 | 価格の数値（円）。 |
| **source_url** | text | 推奨 | 商品ページ URL（`itemUrl`）。 |
| **first_seen_at** | timestamptz | 自動 | 初回登録。 |
| **updated_at** | timestamptz | 自動 | 最終更新。 |
| **created_at** | timestamptz | 自動 | 作成日時。 |

- 一意キー: **item_code**（UNIQUE）。
- 将来、楽天 API で栄養やフレーバーが取れれば、`scraped_products` と同様に拡張カラムを追加する想定。

---

## 4. 実装ステップ案

1. **DB**
   - `rakuten_products` テーブルを追加する migration を作成・適用。

2. **取得**
   - **楽天 API を叩いて `rakuten_products` に upsert する**処理を用意する。
     - 例: `app/api/rakuten/sync/route.ts`（Next API）でキーワード検索 → ページングで全件取得 → upsert。
     - または Python/Node のバッチスクリプトで同様の処理（環境変数に `RAKUTEN_APPLICATION_ID` を設定）。

3. **Import**
   - `app/api/source-texts/import/route.ts` の `targets` に `"rakuten"` を追加。
   - `rakuten_products` を select し、`source_key = "rakuten:{item_code}"`、`raw_text` を「楽天用の見出し + 商品名・価格・URL 等」で組み立てて `protein_source_texts` に upsert。

4. **分類結果の補完**
   - `src/lib/batchDb.ts` の **saveClassificationResult** に、`source_name === "rakuten"` かつ `source_key` が `rakuten:` 始まりのとき、`rakuten_products` の同じ `item_code` の行から **price_value, image_url, source_url** を読み、`product_classification_results` の価格・画像・URL に反映する処理を追加。

5. **画面**
   - 一覧・詳細で「楽天」タグやリンクを出したい場合は、`product_classification_results` の `source_name` や `source_url` を参照する既存の表示ロジックに楽天を追加すればよい（既に「販売サイトタグ」で Amazon／メーカー等を出しているなら、そこに楽天を足す）。

---

## 5. 楽天 API 利用のポイント

- **エンドポイント**: `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706`
- **必須パラメータ**: `applicationId`（発行されたアプリID）、`keyword`（検索キーワード）。
- **ページング**: `page` パラメータ（1〜30）。1ページあたり `hits` 最大 30 件。
- **レスポンス**: `Items` 配下に `Item.itemCode`, `Item.itemName`, `Item.itemPrice`, `Item.itemUrl`, `Item.mediumImageUrls[0].imageUrl`, `Item.shopName` など。
- レート制限: アプリごとに制限あり（目安: 1秒1リクエスト程度で問題ない運用が多い）。全ページ取得する場合は `page` をインクリメントし、リクエスト間に少し待機を入れると安全。

---

## 6. まとめ

| 項目 | 内容 |
|------|------|
| 取得方法 | 楽天市場 API（Ichiba Item Search）を推奨。スクレイピングは非推奨。 |
| 保存先 | 新テーブル `rakuten_products`（一意キー: item_code）。 |
| 後続フロー | 既存の import → classify を流用。import に `rakuten` を追加し、saveClassificationResult に楽天用の補完を追加。 |
| 追加実装 | migration、API/スクリプトでの取得、import の rakuten 対応、batchDb の楽天補完。 |

この方針で進めれば、Amazon・メーカーと同じパターンで楽天商品を一覧に載せられる。

---

## 実装後の「必要な対応事項」チェックリスト

1. **楽天アプリIDの取得**
   - [Rakuten Web Service](https://webservice.rakuten.co.jp/) にログインし、アプリを登録する。
   - **※ 登録時にサーバ情報（コールバックURL等）を求められることがある。** 本番サーバやドメインが決まっていない場合は、一旦「開発用」のURLを仮登録するか、サーバ準備後に登録する。
   - 発行された **アプリID（applicationId）** を取得し、`.env.local` に `RAKUTEN_APPLICATION_ID=あなたのアプリID` を追加する。
   - ※ 一部の API バージョンでは **アクセスキー（accessKey）** も必要。エラーになった場合は楽天の管理画面でアクセスキーを確認し、`RAKUTEN_ACCESS_KEY` を設定する（現行実装は applicationId のみ対応。必要なら sync ルートで accessKey をサポートする拡張が必要）。

2. **DB の migration 適用**
   - `supabase/migrations/20260316000000_add_rakuten_products.sql` を適用し、`rakuten_products` テーブルを作成する。
   - 例: Supabase Dashboard の SQL Editor で実行するか、`supabase db push` など。

3. **楽天の取得 → 一覧反映の手順**
   - **取得**: `POST /api/rakuten/sync` を実行する（body: `{ "keyword": "プロテイン", "maxPages": 10 }` など。省略時は keyword=プロテイン、maxPages=10）。
   - **取り込み**: `POST /api/source-texts/import` で `targets: ["rakuten"]` を指定する（または画面の「取り込み」で楽天にチェック）。
   - **分類**: `POST /api/batch/classify` を実行する（または画面の「分類」）。
   - ここまでで楽天商品が一覧・詳細に表示される。

4. **画面で楽天を識別する**
   - 一覧・詳細で「楽天」タグやリンクを出したい場合は、`product_classification_results` の `source_name === "rakuten"` および `product_url` を参照して表示する（既存の Amazon／メーカー表示と同様）。

# Protein Log SPEC

## 1. サービス概要

### サービス名
**Protein Log**

### コンセプト
Protein Log は、プロテインの **ブランド・商品・フレーバー・レビュー** を整理し、  
ユーザーが自分に合うプロテインを見つけられるようにする **レビュー型データベースサービス** である。

### 目的
ユーザーが以下の情報をもとに、プロテインを比較・検討できるようにする。

- ブランド
- 商品
- フレーバー
- 味の評価
- 甘さ
- 溶けやすさ
- レビュー
- 価格
- メーカー情報

### 想定する最終形
**「プロテイン版の食べログ」** のようなサービスを目指す。

#### 想定構造
```text
ブランド
↓
商品
↓
フレーバー
↓
レビュー
↓
ランキング
```

---

## 2. 技術構成

### フロントエンド
- Next.js
- React
- TypeScript

### バックエンド
- Supabase
- PostgreSQL

### AI / データ抽出
- Vertex AI
- Gemini 2.5 Flash-Lite
- Node.js
- @google/genai
- Zod

### インフラ
- GitHub
- Vercel（Webアプリ）
- Google Cloud Run Jobs（バッチ実行）
- Cloud Scheduler（定期実行）
- Secret Manager（機密情報管理）
- Vertex AI（生成AI利用）

---

## 3. 現在の実装状況

### Webアプリ実装済み
- Next.js プロジェクト作成済み
- Supabase 接続済み
- GitHub / Vercel 連携済み

#### 3.1 トップページ

現在のトップページは、**「あなたに合うプロテインを探す」** ための検索・比較 UI を中心とした構成になっている。

- ブランドバー
  - 画面最上部にフル幅のバーを表示（Deep Navy）
  - 左側にロゴテキスト `PROTEIN LOG`
  - 右側に「登録プロテイン n 件」のメトリクスバッジ
  - スクロールしても追従する固定ヘッダー
- ヒーローセクション
  - PC / SP で出し分けたプロテイン袋の背景画像を `background-image` として敷く
  - ラベル: 「プロテイン比較・口コミデータベース」
  - 見出し: 「あなたに合うプロテインが見つかる」
  - 説明文:
    - 「膨大にあるプロテイン情報を毎日更新し、」
    - 「口コミとデータで比較できる『プロテイン専用のレビューサービス』です」
  - CTA ボタン「プロテインを探す」（ブランドネイビー基調）
- 「プロテインを探す」セクション
  - 絞り込みバー（カード内）
    - 甘さスライダー（0〜100）
    - 味の傾向チップ（複数選択可）
      - コーヒー系 / チョコ系 / フルーツ系 / ミルク系 / お菓子系 / 食事系 / プレーン / ヨーグルト / 抹茶
    - 価格帯チップ（1kg あたり、複数選択可）
      - 低価格帯 / 中価格帯 / 高価格帯
  - キーワード検索バー
    - メーカー名・商品名・フレーバーで検索
    - バックエンドでは Supabase pgvector + Gemini embedding を使ったベクトル検索 `/api/search` を呼び出す
  - プロテイン一覧
    - AI によって分類された `product_classification_results` のうち、`is_protein_powder = true` の最新 30 件を表示
    - 各行には以下を表示
      - メーカー名 / 商品名 / フレーバー（`display_*` を優先し、なければ元テキストを表示）
      - 1kg あたりの参考価格 (`price_per_kg`、なければ `price_jpy`)
      - 平均評価 (`avg_rating`) を 5 段階の星で表示
      - フレーバーカテゴリ（味の傾向）バッジ
      - 1食あたりタンパク質量 (`protein_grams_per_serving`)
    - 一覧上部にソートボタン
      - 新着順: DB の登録日時降順（デフォルト）
      - 人気順: `avg_rating` 降順
      - 安い順: `price_per_kg`（なければ `price_jpy`）昇順
    - 各行は `/evaluations/[id]` の詳細ページに遷移するリンクになっている
  - 下部に「人気ブランド / 人気商品 / 人気フレーバー / 人気レビュー」セクション
    - 既存の `brands` / `products` / `flavors` / `reviews` テーブルを用いた簡易ナビ

#### 3.2 プロテイン詳細ページ（評価ページ）

URL パス: `/evaluations/[id]`  
`product_classification_results` の 1 件を詳細に表示し、ユーザーがクイックに評価できる画面。

- 商品情報
  - 商品画像（Amazon / メーカーサイトの画像 URL）
  - メーカー名・商品名・フレーバー（`display_*` を優先して表示）
  - 価格情報
    - 1kg あたりの参考価格 (`price_per_kg`)
    - 総額（`price_jpy`）
  - 栄養情報（1食あたり）
    - カロリー (`calories`)
    - 糖質 (`carbs`)
    - 脂質 (`fat`)
- 評価関連
  - 5 軸レーダーチャート
    - 味の美味しさ
    - 混ざりやすさ
    - コスパ
    - リピート意向
    - 泡立ち
  - 「みんなの評価」
    - 匿名ユーザーの評価を `product_quick_ratings` から集計し、平均スコアと件数を表示
  - 「あなたの評価」
    - 匿名クイック評価フォーム
    - ブラウザごとに `localStorage` に保存された `client_token` でユーザーを識別
    - 1 プロテインにつき 1 件だけ上書き保存（`product_result_id` + `client_token` の一意制約）
    - 入力可能な項目
      - レーダー 5 軸: 味の美味しさ / 混ざりやすさ / コスパ / リピート意向 / 泡立ち（各 1〜5 の星）
      - 好みが分かれる 4 軸: 甘さ / 味の濃さ / ミルク感 / 人工甘味料感（各 1〜5 のスライダー）

### AI / バッチ基盤の実装済み
- Google Cloud プロジェクト作成済み
- Vertex AI API 有効化済み
- Cloud Run Job 用サービスアカウント作成済み
- Secret Manager に `DATABASE_URL` 登録済み
- Vertex AI へのローカル疎通確認済み
- Gemini 2.5 Flash-Lite で JSON 抽出確認済み
- ルールベース除外処理実装済み
- バッチの土台ファイルおよび DB 連携実装済み

#### 現在のバッチ処理構造（概略）

```text
Amazon / メーカーサイトのスクレイピング
  ↓
scraped_products / manufacturer_products に保存
  ↓
protein_source_texts に「未分類テキスト」を取り込み（status = 'pending'）
  ↓
ルールベース除外
  ↓
Gemini 2.5 Flash-Lite に判定依頼
  ↓
JSON 形式で抽出（各種フィールド + 表示用テキスト）
  ↓
Zod で検証
  ↓
product_classification_results に保存
  ↓
（フロントエンドの一覧・詳細画面で利用）
```

---

## 4. データベース設計

### `brands`
ブランド情報を管理するテーブル。

| column     | type      |
|------------|-----------|
| id         | uuid      |
| name       | text      |
| country    | text      |
| created_at | timestamp |

#### 例
- MyProtein
- Gold Standard
- X-PLOSION

### `products`
ブランドごとの商品を管理するテーブル。

| column     | type      |
|------------|-----------|
| id         | uuid      |
| brand_id   | uuid      |
| name       | text      |
| created_at | timestamp |

#### 例
- Impact Whey
- Clear Whey
- Gold Standard Whey

### `flavors`
商品ごとのフレーバーを管理するテーブル。

| column      | type      |
|-------------|-----------|
| id          | uuid      |
| product_id  | uuid      |
| flavor_name | text      |
| created_at  | timestamp |

#### 例
- Chocolate
- Strawberry Cream
- Milk Tea

### `reviews`
今後追加予定のレビュー用テーブル。

| column      | type      |
|-------------|-----------|
| id          | uuid      |
| flavor_id   | uuid      |
| rating      | int4      |
| sweetness   | int4      |
| mixability  | int4      |
| review_text | text      |
| created_at  | timestamp |

### `protein_source_texts`
AI判定対象の元テキストを保存するテーブル。  
Amazon やメーカーサイトから取得した生テキストを一時保存し、未処理データをバッチで分類する用途を想定する。

| column       | type      | 説明 |
|--------------|-----------|------|
| id           | uuid      | PK |
| source_name  | text      | "amazon" / "manufacturer" などの由来識別子 |
| source_url   | text      | 元の商品ページURL |
| source_key   | text      | 冪等判定用キー（例: `amazon:ASIN`, `manufacturer:メーカー|商品|味|容量`）|
| raw_text     | text      | AI に渡す元テキスト（ブランド・商品名・価格などを含む）|
| status       | text      | `pending` / `processed` / `excluded` / `error` |
| error_message| text      | エラー時のメッセージ |
| processed_at | timestamp | 判定完了時刻 |
| created_at   | timestamp | 登録時刻 |

`source_key` には UNIQUE 制約を付与し、同じ商品テキストを二重に登録しない。

### `product_classification_results`
AI による分類結果およびフロントエンド表示用情報を保存するテーブル。

主なカラム（抜粋）:

| column                      | type      | 説明 |
|-----------------------------|-----------|------|
| id                          | uuid      | PK |
| source_text_id              | uuid      | `protein_source_texts.id` への FK（1対1）|
| is_protein_powder           | boolean   | 粉末プロテインかどうか |
| excluded_reason             | text      | 除外理由（`protein_bar` / `eaa` など）|
| manufacturer                | text      | メーカー名（正規化後）|
| product_name                | text      | 商品名（正規化後）|
| flavor                      | text      | フレーバー名 |
| price_jpy                   | numeric   | 価格（スクレイピングした数値価格を優先して保存）|
| protein_grams_per_serving   | numeric   | 1食あたりのタンパク質量 (g) |
| protein_type                | text      | `whey` / `casein` / ... |
| confidence                  | numeric   | 判定の信頼度 (0〜1) |
| product_url                 | text      | 商品ページURL（`protein_source_texts.source_url` をコピー）|
| product_image_url           | text      | 商品画像 URL（Amazon/メーカーの画像パス）|
| calories                    | numeric   | 1食あたりのカロリー (kcal) |
| carbs                       | numeric   | 1食あたりの糖質量 (g) |
| fat                         | numeric   | 1食あたりの脂質量 (g) |
| avg_rating                  | numeric   | 当サイト内での平均評価（クイック評価などから算出予定）|
| price_per_kg                | numeric   | 1kg あたりの参考価格（数値価格と重量から計算）|
| flavor_category             | text      | フレーバーカテゴリ（コーヒー系 / フルーツ系 / プレーン / ヨーグルト / 抹茶 など）|
| display_manufacturer        | text      | 表示用の短いメーカー名（Gemini で生成）|
| display_product_name        | text      | 表示用の短い商品名（Gemini で生成）|
| display_flavor              | text      | 表示用の短いフレーバー名（Gemini で生成）|
| created_at                  | timestamp | 登録時刻 |

> 旧仕様のカラム定義は上記に統合したため、別途「旧仕様」セクションは削除。

---

## 5. データ構造

テーブル間の関係（概略）は以下。

```text
brands
  ↓
products
  ↓
flavors
  ↓
reviews（将来のテキストレビュー機能）
```

AI 取り込み系の補助構造は以下。

```text
scraped_products / manufacturer_products
  ↓
protein_source_texts
  ↓
product_classification_results
  ↓
フロントエンドの一覧 / 詳細表示・評価に利用
```

---

## 6. 画面仕様

### 現在のトップ画面
トップページに以下を表示する。

- ブランド一覧
- 選択中ブランドの商品一覧
- 選択中商品のフレーバー一覧

### 現在のユーザー操作
- ブランドをクリックすると、そのブランドに紐づく商品一覧を表示する
- 商品をクリックすると、その商品に紐づくフレーバー一覧を表示する

### 今後追加する画面
- フレーバー詳細画面
- レビュー一覧表示
- レビュー投稿フォーム
- ランキング画面
- 商品詳細画面
- AI取り込み結果確認画面（管理用）
- 未分類データ確認画面（管理用）

---

## 7. AI取り込みバッチ仕様

### 目的
収集済みのテキストデータから、対象が粉末プロテインかどうかを判定し、  
必要な項目を JSON 形式で抽出して保存する。

### 判定対象
以下のような商品情報テキストを対象とする。

- 商品名
- ブランド名
- フレーバー名
- 価格
- 商品説明文

### AIで抽出する主な項目
- `is_protein_powder`
- `excluded_reason`
- `manufacturer`
- `product_name`
- `flavor`
- `price_jpy`（テキストから読み取れる場合のみ。実際の価格保存はスクレイピング値を優先）
- `protein_grams_per_serving` (1食あたりのタンパク質量 / g)
- `protein_type`
- `confidence`
- `calories`（1食あたりカロリー）
- `carbs`（1食あたり糖質）
- `fat`（1食あたり脂質）
- `price_per_kg`（1kg あたりの参考価格のヒント値）
- `flavor_category`（味のカテゴリ: coffee / chocolate / fruit / milk / candy / meal / plain / yogurt / matcha など）
- `display_manufacturer`（日本語 UI 向けの短いメーカー名）
- `display_product_name`（日本語 UI 向けの短い商品名）
- `display_flavor`（日本語 UI 向けの短いフレーバー名）

### JSON スキーマ（例）
```json
{
  "is_protein_powder": true,
  "excluded_reason": null,
  "manufacturer": "MyProtein",
  "product_name": "Impact Whey Protein",
  "flavor": "Chocolate Smooth",
  "price_jpy": 3980,
  "protein_grams_per_serving": 20,
  "protein_type": "whey",
  "confidence": 0.95,
  "calories": 120,
  "carbs": 3,
  "fat": 1.5,
  "price_per_kg": 3980,
  "flavor_category": "chocolate",
  "display_manufacturer": "マイプロテイン",
  "display_product_name": "インパクトホエイプロテイン",
  "display_flavor": "チョコレートスムース"
}
```

### ルールベース除外
AI コスト削減と精度安定化のため、以下のようなキーワードは AI に送る前に除外する。

- EAA
- BCAA
- プロテインバー
- protein bar
- creatine
- クレアチン
- マルチビタミン
- supplement
- アミノ酸

### AI判定の流れ
```text
入力テキスト
↓
normalize
↓
ルールベース除外
↓
除外対象なら固定JSONを返す
↓
除外対象でなければ Gemini 2.5 Flash-Lite を呼ぶ
↓
Structured Output で JSON を返す
↓
Zod でバリデーション
↓
DB保存
```

### 実装ファイル構成（AI/バッチ関連）
```text
src/
  lib/
    gemini.ts
    proteinSchema.ts
    proteinFilter.ts
    classifyProtein.ts
  batch/
    protein-classify.ts
    backfill-amazon-weight.ts
```

### 各ファイルの役割
- **src/lib/gemini.ts** — Vertex AI クライアント初期化、Gemini 2.5 Flash-Lite 呼び出し、JSON structured output 実行
- **src/lib/proteinSchema.ts** — Zod スキーマ定義、返却 JSON の型検証（栄養・価格・フレーバーカテゴリ・表示用テキストなどを含む）
- **src/lib/proteinFilter.ts** — 除外対象キーワードの先行判定、正規化処理
- **src/lib/classifyProtein.ts** — ルールベース除外と AI 判定の統合関数
- **src/batch/protein-classify.ts** — バッチ本体（未処理データ取得、分類実行、保存処理、ログ出力）
- **src/batch/backfill-amazon-weight.ts** — Amazon 商品タイトルから重量を推定し、`scraped_products.net_weight_kg` / `price_per_kg` を補完するバッチ

---

## 8. バッチ実行構成

### 実行方針
- フロントエンドから Gemini API は直接呼ばない
- バックエンドのバッチ処理のみで利用する
- **1日1回**、「スクレイプ → 価格・重量の補完 → 新規だけ取り込み → 全 pending を分類」までをまとめて実行する

### 構成
```text
Cloud Scheduler
↓
Cloud Run Job
↓
Vertex AI (Gemini 2.5 Flash-Lite)
↓
Supabase / PostgreSQL
```

### 認証方針
- 本番では API キーを使わない
- Cloud Run Job に紐づくサービスアカウントで認証する
- Vertex AI は ADC（Application Default Credentials）を利用する

### GCP 側で利用する要素
- Vertex AI API
- Cloud Run Jobs
- Cloud Scheduler
- Secret Manager
- サービスアカウント

---

## 9. セキュリティ方針

### Webアプリ
- Supabase の RLS（Row Level Security）を利用する。

**現在、少なくとも読み取りを許可するテーブル**
- `brands`
- `products`
- `flavors`

**今後 reviews を追加する際に設定する内容**
- `SELECT` 許可
- `INSERT` 許可

### AI / バッチ側
- フロントエンドから Gemini API は呼ばない
- APIキーは本番運用で使用しない
- Cloud Run Job のサービスアカウント認証を利用する
- DB接続情報は Secret Manager に保存する
- AIの返却値は保存前に必ず Zod で検証する
- 明らかな除外対象は AI に送らずルールベースで処理する

---

## 10. MVPの完成条件

以下が動作すれば MVP とする。

### Webアプリ側
- トップページで AI 分類済みプロテインの一覧表示ができる
- 商品画像・価格（1kg あたりの参考価格を含む）・フレーバーカテゴリを一覧で確認できる
- 各プロテインから詳細ページ（評価ページ）へ遷移できる
- 詳細ページでレーダーチャートとクイック評価 UI（みんなの評価 / あなたの評価）が動作する
- 最低限の UI でスマホからも操作可能

### データ基盤側
- Amazon / メーカーサイトからの商品情報をスクレイピングできる
- 収集済みテキストをバッチで分類できる
- 粉末プロテインかどうか判定できる
- EAA / BCAA / バー系を除外できる
- メーカー、商品名、味、価格、栄養・フレーバーカテゴリ・表示用テキストを JSON で抽出できる
- 結果を DB に保存できる

---

## 11. 次に実装すべき機能

優先順位は以下。

1. protein_source_texts または同等の未処理データ保存先を整備
2. product_classification_results または同等の結果保存先を整備
3. src/batch/protein-classify.ts を DB 取得 / 保存対応にする
4. Cloud Run Job 用 Dockerfile 作成
5. package.json にバッチ実行コマンド追加
6. Cloud Run Job へデプロイ
7. Cloud Scheduler で 3日おき実行設定
8. reviews テーブル作成
9. reviews の RLS 設定
10. flavor クリックでレビュー一覧表示
11. レビュー投稿フォーム作成
12. rating / sweetness / mixability の保存
13. レビュー表示UI改善

---

## 12. 将来追加したい機能

- ログイン機能
- ユーザーごとのレビュー履歴
- 人気ランキング
- SEO向けURL設計
- 価格比較
- AIレコメンド
- 味チャート
- アフィリエイトリンク管理
- 商品情報の自動収集
- 管理画面からの再分類実行
- 分類精度の監視
- 重複商品の自動統合

# Protein Log

プロテインの **ブランド・商品・フレーバー・レビュー** を整理し、ユーザーが自分に合うプロテインを見つけられる **レビュー型データベースサービス** です。「プロテイン版の食べログ」を目指しています。

## 目的

- ブランド・商品・フレーバー・味の評価・甘さ・溶けやすさ・レビュー・価格・メーカー情報をもとに、プロテインを比較・検討できる状態を作る。

## 技術構成

| 領域 | 技術 |
|------|------|
| フロントエンド | Next.js, React, TypeScript |
| バックエンド | Supabase, PostgreSQL |
| AI / データ抽出 | Vertex AI, Gemini 2.5 Flash-Lite, Node.js, @google/genai, Zod |
| インフラ | GitHub, Vercel（Web）, Cloud Run Jobs（バッチ）, Cloud Scheduler, Secret Manager, Vertex AI |

## 現在の実装状況（概要）

### Webアプリ
- Next.js + Supabase 接続済み
- トップページ
  - 最上部にフル幅のブランドバー（`PROTEIN LOG` とロゴ横のキーワード検索バー、スクロール追従）
  - その下にヒーローセクション
    - PC / SP で出し分けたプロテイン袋の背景画像
    - 小ラベル「プロテイン比較・口コミデータベース」
    - 見出し「あなたに合うプロテインが見つかる」
    - 説明「膨大にあるプロテイン情報を毎日更新し、口コミとデータで比較できるプロテイン専用のレビューサービスです」
    - CTA ボタン「プロテインを探す」
    - サマリー表示
      - 登録フレーバー数（`product_classification_results` の `is_protein_powder = true` 件数）
      - 登録メーカー数（`manufacturer_sources` の件数）
      - 最終更新日時（最新の `product_classification_results.created_at` を日付＋時刻で表示）
  - 「プロテインを探す」セクション
    - 絞り込みバー
      - 甘さスライダー
      - フレーバーチップ（コーヒー系 / チョコ系 / フルーツ系 / ミルク系 / お菓子系 / 食事系 / プレーン / ヨーグルト / 抹茶）
      - 好みの傾向チップ（甘さ / 味の濃さ / ミルク感 / 人工甘味料感）※将来的に評価データと連動予定
    - キーワード検索バー（ロゴバーおよびフィルタカード内からベクトル検索を実行）
    - プロテイン一覧（`product_classification_results` の `is_protein_powder = true` 全件をクライアントサイドでページング表示）
      - メーカー / 商品名 / フレーバー（`display_*` を優先）
      - 1kg あたりの参考価格（`price_per_kg` 優先、なければ `price_jpy`）
      - 平均評価 (`avg_rating`) の星表示（未評価はグレーの ☆☆☆☆☆）
      - フレーバーカテゴリバッジ
      - 在庫切れ表示（Amazon 由来で `is_in_stock = false` の場合は価格欄に「在庫切れ」と表示）
      - 一覧上部にソートボタン（新着順 / 人気順 / 安い順）
      - 10 件 / ページのページング（前へ / 次へ）と、切り替え時の軽いフェードインアニメーション
- プロテイン詳細ページ（`/evaluations/[id]`）
  - 商品画像（Amazon / メーカーの画像 URL を利用して表示）
  - 価格情報（1kg あたりの参考価格と総額）
  - 栄養情報（1食あたりのカロリー / 糖質 / 脂質）
  - 5 軸レーダーチャート（味の美味しさ / 混ざりやすさ / コスパ / リピート意向 / 泡立ち）
  - クイック評価 UI
    - 「みんなの評価」：匿名集計された平均スコア
    - 「あなたの評価」：匿名トークン（`client_token`）による 1 人 1 件の評価
    - レーダー 5 軸は 5 段階の星ボタン
    - 甘さ / 味の濃さ / ミルク感 / 人工甘味料感 は 1〜5 のスライダー
- GitHub / Vercel 連携済み

### AI / データ取得・バッチ基盤
- Google Cloud プロジェクト・Vertex AI API 有効化済み
- Cloud Run Job 用サービスアカウント、Secret Manager（`DATABASE_URL`）登録済み
- Vertex AI ローカル疎通・Gemini 2.5 Flash-Lite での JSON 抽出確認済み
- ルールベース除外処理（BCAA・プロテインバーなどを事前に除外）
- `protein_source_texts` / `product_classification_results` テーブルと DB 連携バッチ実装済み
- Amazon（SerpAPI 経由）/ メーカーサイト / iHerb からのスクレイピング結果を取り込み、AI で「粉末プロテインか」「どのようなプロテインか」を分類するパイプライン実装済み
- 価格・在庫まわり
  - Amazon:
    - 検索一覧 (`engine=amazon`) で ASIN 候補を取得し、`scraped_products` に保存
    - 詳細 API (`engine=amazon_product`) で ASIN ごとの価格・在庫テキストを取得し、`scraped_products.price` / `price_value` / `availability_raw` / `is_available` を補完
    - タイトルから推定した `net_weight_kg` と `price_value` から `price_per_kg` を計算（`batch:backfill-amazon-prices`）
  - メーカーサイト:
    - `manufacturer_products.price_yen` / `price_per_kg` / `image_url` を正とし、AI結果より優先して `product_classification_results` にマージ
  - `product_classification_results` には、LLM の推定値ではなく **スクレイピングした数値価格を優先して** `price_jpy` / `price_per_kg` を保存し、Amazon の在庫有無は `is_in_stock` フラグとして保持

## バッチ実行（取り込み + 分類）

1. `scraped_products` / `manufacturer_products` から新規の商品テキストだけを `protein_source_texts` に `pending` で取り込む。
2. `protein_source_texts` の `status = 'pending'` をすべて取得し、AI で分類して `product_classification_results` に保存する。

**環境変数（ローカル）**  
`.env.local` または環境で以下を設定する。

- `NEXT_PUBLIC_SUPABASE_URL` または `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` または `SUPABASE_SERVICE_ROLE_KEY`
- Vertex AI 利用時は ADC または該当キー

**主なコマンド**

```bash
# 取得済みデータから新規だけ取り込む（scraped_products / manufacturer_products → protein_source_texts）
npm run batch:import

# pending がなくなるまで分類（protein_source_texts → product_classification_results）
npm run batch:classify

# まとめて実行（取り込み → 分類）
npm run batch:import-and-classify

# iHerb も含めた 1日分すべて
# Amazon / メーカー / iHerb のスクレイプ → Amazon 詳細取得 → 価格・重量の補完 → 取り込み → 分類
npm run daily:full
```

- `batch:classify` は pending が 0 になるまでループして全件を処理する。
- `batch:import` は `source_key` 単位で新規のみ insert し、同じ商品を二重に判定しない。
- 本番では `npm run daily:full` 相当を Cloud Run Job + Cloud Scheduler で 1日1回実行する想定。

## 定期スクレイピング（推奨スケジュール）

| 対象 | 推奨頻度 | エンドポイント | 保存先 |
|------|----------|----------------|--------|
| **Amazon** | **毎日 1 回** | `POST /api/scrape-protein` | `scraped_products` |
| **メーカーサイト** | **毎日 1 回** | `POST /api/manufacturers/scrape` | `manufacturer_products` |

- **価格・情報の更新**: 同じ商品（Amazon は asin、メーカーは メーカー+商品名+フレーバー+単位）は **上書き** され、`updated_at` が更新されます。
- **新着の判別**: 初めて登録された行は `first_seen_at` が入ります。一覧で「新着」と表示したい場合は、例として `first_seen_at >= now() - interval '1 day'`（Amazon/メーカーとも）で判定できます。

本番では Cloud Scheduler などで上記エンドポイントを指定の頻度で叩く想定です。

## ドキュメント

- **詳細仕様**: [SPEC.md](./SPEC.md) — サービス概要、DB設計、AI取り込みバッチ仕様、バッチ実行構成、セキュリティ、MVP条件、今後の実装予定
- **デザインガイドライン**: [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md) — カラーパレット、タイポグラフィ、余白、コンポーネント設計ルール。フロントエンド実装時は必ず参照すること。

## 今後の予定（概要）

- トップページ
  - 「プロテイン一覧」を「プロテインを探す」にリネーム
  - その直下にフィルタ / ソートバーを配置
  - フレーバーカテゴリをアイコン付きで表示し、クリックで該当カテゴリのみをフィルタ
  - 価格帯（低〜高）のバー / スライダーで並び替え・フィルタ
- ソート・検索の軸
  - 1kg あたり価格、タンパク質量などでのソートスライダー
- Cloud Run Job デプロイと Cloud Scheduler（毎日 4 時）の設定
- 将来的な詳細レビュー（テキストレビュー）機能、ログイン、ランキング、SEO、管理画面など（`SPEC.md` 参照）

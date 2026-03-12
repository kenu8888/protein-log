# Protein Log TASKS

## 現在の実装状況
- Next.js + Supabase 接続済み
- brands / products / flavors 表示済み
- GitHub 連携済み
- Amazon / メーカーサイトのスクレイピング実装済み
- `scraped_products` / `manufacturer_products` に日次で保存
- `protein_source_texts` / `product_classification_results` による Gemini 分類パイプライン実装済み
- `npm run daily:full` で「スクレイプ → 取り込み → 全 pending 分類」まで一括実行可能

## 次にやること
1. Cloud Run Job 用 Dockerfile 作成
2. Cloud Run Job へデプロイ
3. Cloud Scheduler で `npm run daily:full` 相当を 1日1回実行する設定
4. reviews テーブルを作成する
5. reviews の RLS を設定する
6. flavor クリックでレビュー一覧を表示する
7. レビュー投稿フォームを作る
8. rating / sweetness / mixability を保存できるようにする

## 直近の最優先タスク
- Cloud Run Job / Cloud Scheduler を使った日次バッチ実行
- reviews テーブル追加と一覧表示・投稿機能

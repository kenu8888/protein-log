# Protein Log

Protein Log は、プロテインのブランド・商品・フレーバー・レビューを整理し、
ユーザーが自分に合うプロテインを見つけられるようにするレビュー型データベースサービスです。

## 目的

膨大にあるプロテイン情報を整理し、
ユーザーが味・飲みやすさ・甘さ・評価などを参考に比較できる状態を作ることを目的としています。

## 現在の技術構成

- Next.js
- React
- TypeScript
- Supabase
- PostgreSQL
- GitHub

## 現在の実装状況

- Next.js プロジェクト作成済み
- Supabase 接続済み
- brands テーブル表示済み
- products テーブル表示済み
- flavors テーブル表示済み
- ブランド → 商品 → フレーバー の一覧表示が動作済み
- GitHub 連携済み

## 現在の画面構成

```text
Brands
↓
Products
↓
Flavors
#今後の予定

reviews テーブル追加

レビュー一覧表示

レビュー投稿フォーム

rating / sweetness / mixability の保存

ログイン機能

ランキング

SEO向けURL設計

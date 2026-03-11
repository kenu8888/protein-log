# Protein Log SPEC

## 1. サービス概要

### サービス名
**Protein Log**

### コンセプト
Protein Log は、プロテインの**ブランド・商品・フレーバー・レビュー**を整理し、  
ユーザーが自分に合うプロテインを見つけられるようにする**レビュー型データベースサービス**である。

### 目的
ユーザーが以下の情報をもとに、プロテインを比較・検討できるようにする。

- ブランド
- 商品
- フレーバー
- 味の評価
- 甘さ
- 溶けやすさ
- レビュー

### 想定する最終形
**「プロテイン版の食べログ」**のようなサービスを目指す。

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
## 2. 技術構成

### フロントエンド
- Next.js
- React
- TypeScript

### バックエンド
- Supabase
- PostgreSQL

### インフラ
- GitHub
- Vercel（予定）

---

## 3. 現在の実装状況

### 実装済み
- Next.js プロジェクト作成済み
- Supabase 接続済み
- `brands` テーブル作成済み
- `products` テーブル作成済み
- `flavors` テーブル作成済み
- `brands` 一覧表示済み
- ブランドクリックで `products` 表示済み
- 商品クリックで `flavors` 表示済み
- GitHub 連携済み

### 現在の画面構造
```text
Brands
↓
Products
↓
Flavors
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

---

## 5. データ構造

テーブル間の関係は以下。

```text
brands
  ↓
products
  ↓
flavors
  ↓
reviews

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

---

## 7. セキュリティ方針

Supabase の RLS（Row Level Security）を利用する。

### 現在、少なくとも読み取りを許可するテーブル
- `brands`
- `products`
- `flavors`

### 今後 `reviews` を追加する際に設定する内容
- `SELECT` 許可
- `INSERT` 許可

---

## 8. MVPの完成条件

以下が動作すれば MVP とする。

- ブランド一覧表示
- 商品一覧表示
- フレーバー一覧表示
- レビュー一覧表示
- レビュー投稿
- 最低限のUIで操作可能

---

## 9. 次に実装すべき機能

優先順位は以下。

1. `reviews` テーブル作成
2. `reviews` の RLS 設定
3. flavor クリックでレビュー一覧表示
4. レビュー投稿フォーム作成
5. `rating` / `sweetness` / `mixability` の保存
6. レビュー表示UI改善

---

## 10. 将来追加したい機能

- ログイン機能
- ユーザーごとのレビュー履歴
- 人気ランキング
- SEO向けURL設計
- 価格比較
- AIレコメンド
- 味チャート
- アフィリエイトリンク管理
## Protein Log デザインガイドライン

Theme: **Clean Premium**

- **清潔感**
- **信頼感**
- **比較しやすさ**
- **洗練**
- **少し上質**
- **フィットネス感は控えめ**

目指す印象は、**「筋トレっぽい勢い」ではなく、落ち着いて比較できる上質なレビューサービス。**

---

## 1. カラーパレット

### 1-1. Brand / Core Colors

- **Primary**
  - Color: `#1F2A44` (Deep Navy)
  - 用途: ブランドの軸、信頼感、主要見出し、重要なUI、主要CTA

- **Accent (Subtle)**
  - Color: `#0F172A` 〜 `#1F2937`（Deep Slate 系）
  - 用途: 補助的な強調、タグ、サブアクション

### 1-2. Neutral Colors

- **Background**
  - Color: `#F8FAFC` (Off White)
  - 用途: ページ背景、広い面積の下地

- **Surface**
  - Color: `#FFFFFF` (White)
  - 用途: カード、モーダル、入力欄、メニュー

- **Text Primary**
  - Color: `#0F172A` (Slate 900)
  - 用途: 本文、主要テキスト

- **Text Secondary**
  - Color: `#64748B` (Slate 500)
  - 用途: 補足テキスト、メタ情報、説明文

- **Border**
  - Color: `#E2E8F0` (Slate 200)
  - 用途: 枠線、区切り線、input border

- **Muted Background**
  - Color: `#F1F5F9` (Slate 100)
  - 用途: タグ背景、非選択チップ、薄いセクション背景

### 1-3. Semantic Colors

- **Rating / Star**
  - Color: `#F59E0B` (Amber)
  - 用途: 星評価、レーティング数値、注目ラベル

- **Success**
  - Color: `#16A34A` (Green)
  - 用途: 良評価、ポジティブ指標、成功状態

- **Warning**
  - Color: `#F59E0B` (Orange/Amber)
  - 用途: 注意、軽い警告、レビュー注意点

- **Danger**
  - Color: `#DC2626` (Red)
  - 用途: エラー、削除、重大警告

- **Info**
  - Color: `#475569` (Blue Gray)
  - 用途: 補足ステータス、情報タグ

---

## 2. 色の使い方ルール

### ルール1: Neutral をベースにする

- 画面の大部分は **Neutral** で構成する。
- 色を多用せず、**情報が読みやすいことを最優先** にする。

**推奨比率（目安）**

- 75%: Neutral
- 15%: Primary
- 10%: Accent / Semantic

### ルール2: Accent は控えめに使う

Primary（Deep Navy）を基調とし、Accent はその濃淡でごく一部の強調にだけ使う。  
派手なグリーンやティールは使わず、全体として落ち着いたトーンを維持する。

### ルール3: Primary（Deep Navy）は “信頼の骨格” に使う

見出しやナビなど、UI の骨組みに使う。

**使ってよい場所の例**

- ロゴ
- ヘッダー
- 大見出し
- セクションタイトル
- アクティブでない主要ナビ
- 重要ラベル

### ルール4: 評価色はブランド色と混ぜない

- 評価は Amber 系（`#F59E0B`）で独立させる。

**理由**

- 評価色と CTA 色が同じだと意味が混ざる
- 星やスコアは一目で認識できる方がよい

### ルール5: 背景は真っ白一色にしない

- ページ全体は `#F8FAFC` を使う。
- カードやフォームだけ `#FFFFFF` を使う。

これにより、**密度が高い画面でも視認性と上質感を両立** できる。

---

## 3. UI 要素ごとの色指定

### 3-1. ページ全体

- **Page Background**: `#F8FAFC`
- **Main Text**: `#0F172A`
- **Secondary Text**: `#64748B`

### 3-2. Header

- **Header Background**: `#1F2A44`（ブランドバー）
- **Logo / Site Name**: `#FFFFFF`
- **Header Border**: なし（またはごく薄いシャドウのみ）

### 3-3. Search Box

- **Background**: `#FFFFFF`
- **Border**: `#E2E8F0`
- **Placeholder**: `#94A3B8`
- **Input Text**: `#0F172A`
- **Focus Ring**: `#14B8A6`
- **Search Icon**: `#64748B`

### 3-4. Buttons

#### Primary Button（主要CTA / 検索ボタン）

- **Background**: `#1F2A44`
- **Text**: `#FFFFFF`
- **Hover**: `#111827`
- **Active**: `#020617`
- **Disabled**: `#CBD5E1`

#### Secondary Button

- **Background**: `#FFFFFF`
- **Border**: `#E2E8F0`
- **Text**: `#1F2A44`
- **Hover Background**: `#F1F5F9`

#### Ghost Button

- **Background**: `transparent`
- **Text**: `#1F2A44`
- **Hover Background**: `#F1F5F9`

### 3-5. Chips / Filters

#### Default Chip

- **Background**: `#F1F5F9`
- **Text**: `#475569`
- **Border**: `transparent`

#### Selected Chip

- **Background**: `#1F2A44`
- **Text**: `#FFFFFF`

#### Filter Section Label

- **Text**: `#1F2A44`

### 3-6. Cards

- **Card Background**: `#FFFFFF`
- **Card Border**: `#E2E8F0`
- **Card Title**: `#0F172A`
- **Card Meta**: `#64748B`
- **Card Shadow**: ごく薄く

**推奨シャドウ**

```css
box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04),
            0 4px 12px rgba(15, 23, 42, 0.04);
```

### 3-7. Ratings

- **Star**: `#F59E0B`
- **Numeric Score**: `#B45309` もしくは `#F59E0B`
- **Review Count**: `#64748B`

### 3-8. Links

- **Default**: `#1F2A44`
- **Hover**: `#111827`
- **Active**: `#020617`

### 3-9. Tags（例示）

- **Sweetness Tag**
  - Background: `#ECFEFF`
  - Text: `#0F766E`

- **Cost Performance Tag**
  - Background: `#EFF6FF`
  - Text: `#1D4ED8`

- **Beginner Friendly Tag**
  - Background: `#F0FDF4`
  - Text: `#15803D`

- **Warning Tag**
  - Background: `#FFF7ED`
  - Text: `#C2410C`

---

## 4. タイポグラフィ方針

### 4-1. 基本方針

- 可読性重視
- 装飾しすぎない
- 比較サイトとして **見やすさ優先**
- 英数字や商品名が読みやすいフォントを選ぶ

### 4-2. 推奨フォント

- **日本語**: Noto Sans JP
- **英数字 / UI**: Inter または Noto Sans JP に統一

（Next.js / Tailwind 実装時は `font-family` をこれに準拠させること）

### 4-3. 文字階層

- **Page Title**
  - 28px
  - 700
  - Color: `#1F2A44`

- **Section Title**
  - 20px
  - 700
  - Color: `#1F2A44`

- **Card Title**
  - 18px
  - 700
  - Color: `#0F172A`

- **Body**
  - 14px〜16px
  - 400
  - Color: `#0F172A`

- **Meta / Caption**
  - 12px〜13px
  - 400
  - Color: `#64748B`

---

## 5. 余白ルール

### 5-1. 基本方針

このテーマは **色より余白で上品に見せる。**

### 5-2. 余白の目安

- **セクション間**: 32px〜48px
- **カード内 padding**: 16px〜20px
- **チップ間**: 8px
- **見出しと本文の間**: 8px〜12px
- **モバイル画面左右余白**: 16px

---

## 6. コンポーネント設計ルール

### 6-1. 角丸

- 小: 8px
- 標準: 12px
- 大: 16px

**推奨**

- Button: 10px〜12px
- Card: 16px
- Input: 12px
- Chip: 999px（完全な Pill 形状）

### 6-2. 線

- 基本は `1px solid #E2E8F0`
- 線で囲いすぎない
- 区切りは **余白を優先し、必要時のみ線を使う**

### 6-3. シャドウ

- かなり弱く使う
- 派手な浮き上がりは避ける
- 「軽い上質感」に留める

---

## 7. やってはいけないこと

- メインカラーとアクセントカラーを同じ強さで大量に使う
- 赤や蛍光色を多用する
- 背景を真っ白だらけにして画面をまぶしくする
- 評価色を CTA にも流用する
- 色数を増やしすぎる
- 黒ベタ面積を大きくする
- チップやタグをカラフルにしすぎる

---

## 8. このサイトでの見せ方の原則

### 原則1

商品より **「比較しやすさ」** が主役。  
色は商品を派手に見せるためではなく、**情報を整理するため** に使う。

### 原則2

Protein Log は **口コミサイトである前に、判断支援サイトである。**  
落ち着いた色で信頼感を作る。

### 原則3

アクセントは **「ユーザーに次にしてほしい行動」** にだけ使う。

### 原則4（開発運用との整合）

- デザイン上の変更も **コンポーネント単位で段階的にリリース** できるように実装する（全画面が一度に壊れないようにする）。
- 自動バッチ / アフィリエイト連携 / ログイン機能などの追加に伴う UI 変更時も、  
  - まずは限定的な範囲で導線・表示を増やし、  
  - 問題がないことを確認しながら徐々に適用範囲を広げる方針とする。

---

## 9. 実装用カラー一覧（CSS 変数）

```css
:root {
  --color-primary: #1F2A44;
  --color-accent: #1F2A44;

  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;

  --color-text-primary: #0F172A;
  --color-text-secondary: #64748B;

  --color-border: #E2E8F0;
  --color-muted: #F1F5F9;

  --color-rating: #F59E0B;
  --color-success: #16A34A;
  --color-warning: #F59E0B;
  --color-danger: #DC2626;
  --color-info: #475569;
}
```

---

## 10. Tailwind 向けトークン例

Tailwind の `theme.extend.colors` などに設定することを想定。

```ts
colors: {
  brand: {
    primary: "#1F2A44",
    accent: "#1F2A44",
  },
  ui: {
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    muted: "#F1F5F9",
  },
  text: {
    primary: "#0F172A",
    secondary: "#64748B",
  },
  state: {
    rating: "#F59E0B",
    success: "#16A34A",
    warning: "#F59E0B",
    danger: "#DC2626",
    info: "#475569",
  },
}
```

---

## 11. 最終ルール要約（フロント実装時のチェックリスト）

- **信頼感** と **行動導線** は **ネイビー（Primary）** を軸に作る
- **情報整理** は **グレーと余白** で作る
- **評価** は **アンバー（Rating 色）** で見せる
- **清潔感** は **オフホワイト背景 + ホワイトのカード** で作る
- **派手にせず、上質に整える**

フロントエンドの実装・コンポーネント設計・スタイル調整を行う際は、  
**本ドキュメントを必ず参照し、記載のルールから外れないこと。**

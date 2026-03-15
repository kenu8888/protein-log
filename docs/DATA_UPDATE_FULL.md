# 全データ更新（Amazon・メーカー・一覧反映）

Amazon とメーカー（MY ROUTINE 等）を含む全ソースを取得し、import → classify まで一括で反映する手順。

---

## 一括実行（推奨）

**Next の開発サーバーを起動した状態で**（別ターミナルで `npm run dev`）、プロジェクトルートで:

```bash
npm run daily:full
```

実行内容:

1. **daily:scrape** … `POST /api/scrape-protein`（Amazon）＋ `POST /api/manufacturers/scrape`（メーカー）
2. **batch:scrape-iherb** … iHerb 取得
3. **batch:fetch-amazon-details** … Amazon 詳細・価格・在庫で scraped_products 更新
4. **batch:backfill-amazon-prices** … 重量から price_per_kg 算出
5. **batch:import-and-classify** … import（Amazon / メーカー / 楽天）→ classify（pending がなくなるまで 50 件ずつ）

---

## 手順を分けて実行する場合

サーバーは `http://localhost:3000` で起動している前提。

```bash
# 1. Amazon 検索で scraped_products 投入
curl -X POST http://localhost:3000/api/scrape-protein

# 2. メーカー（MY ROUTINE 等）スクレイプで manufacturer_products 投入
curl -X POST http://localhost:3000/api/manufacturers/scrape

# 3. Amazon 詳細・価格・在庫で scraped_products 更新
npm run batch:fetch-amazon-details

# 4. 重量から 1kg あたり価格を計算
npm run batch:backfill-amazon-prices

# 5. iHerb（利用する場合）
npm run batch:scrape-iherb

# 6. 全ソースを protein_source_texts に取り込み
npm run batch:import

# 7. 未分類を classify（pending がなくなるまで繰り返し）
npm run batch:classify
```

classify は 1 回あたり 50 件まで。pending が残る場合は 7 を複数回実行するか、API で件数を指定する:

```bash
curl -X POST http://localhost:3000/api/batch/classify \
  -H "Content-Type: application/json" \
  -d '{"limit": 150}'
```

---

## 注意

- `daily:scrape` の 2 本の curl は **Next が起動している**必要がある。
- `batch:*` は tsx で動くため、Next が止まっていても実行できる。
- ポートが 3001 の場合は、curl の `3000` を `3001` に変更する。

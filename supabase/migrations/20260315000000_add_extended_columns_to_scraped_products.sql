-- 拡張カラム: Playwright 等で取得したメーカー・フレーバー・栄養情報を格納
-- amazon_product_sync.py で AMAZON_SYNC_USE_EXTENDED_COLUMNS=1 にすると payload に含める

alter table scraped_products
  add column if not exists manufacturer text,
  add column if not exists flavor text,
  add column if not exists calories numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists nutrition_basis_raw text,
  add column if not exists nutrition_raw_text text,
  add column if not exists net_weight_raw text;

comment on column scraped_products.manufacturer is 'メーカー名（商品詳細のテーブル等から取得）';
comment on column scraped_products.flavor is 'フレーバー（風味）';
comment on column scraped_products.calories is '1食あたりカロリー (kcal)';
comment on column scraped_products.protein_g is '1食あたりタンパク質 (g)';
comment on column scraped_products.carbs_g is '1食あたり炭水化物 (g)';
comment on column scraped_products.fat_g is '1食あたり脂質 (g)';
comment on column scraped_products.nutrition_basis_raw is '栄養表示の基準（例: 1食30gあたり）';
comment on column scraped_products.nutrition_raw_text is '栄養成分の生テキスト（AI/後処理用）';
comment on column scraped_products.net_weight_raw is '内容量の生表記（例: 1kg×3）';

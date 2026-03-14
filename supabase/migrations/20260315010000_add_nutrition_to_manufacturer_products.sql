-- メーカー取得側でも栄養を保存する場合に使用（scraped_products と対称）
-- 未使用の場合は実行しなくてよい

alter table manufacturer_products
  add column if not exists calories numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists nutrition_raw_text text;

comment on column manufacturer_products.calories is '1食あたりカロリー (kcal)';
comment on column manufacturer_products.protein_g is '1食あたりタンパク質 (g)';
comment on column manufacturer_products.carbs_g is '1食あたり炭水化物 (g)';
comment on column manufacturer_products.fat_g is '1食あたり脂質 (g)';
comment on column manufacturer_products.nutrition_raw_text is '栄養成分の生テキスト';

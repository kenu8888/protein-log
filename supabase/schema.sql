-- Schema for Protein Log (MVP)
-- run with supabase SQL editor or migration tool

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  website_url text,
  created_at timestamp with time zone default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default now()
);

create table if not exists flavors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  flavor_name text not null,
  created_at timestamp with time zone default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  flavor_id uuid references flavors(id) on delete cascade,
  rating int check (rating between 1 and 5),
  sweetness int check (sweetness between 1 and 5),
  mixability int check (mixability between 1 and 5),
  review_text text,
  created_at timestamp with time zone default now()
);

create table if not exists scraped_brand_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  product_name text,
  flavor_name text,
  price_text text,
  source_url text,
  created_at timestamp with time zone default now()
);

create table if not exists scraped_products (
  id uuid primary key default gen_random_uuid(),
  asin text unique,
  title text,
  brand text,
  image_url text,
  price text,
  price_value numeric,
  net_weight_kg numeric,
  price_per_kg numeric,
  rating numeric,
  source_url text,
  first_seen_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create or replace function scraped_products_updated()
returns trigger as $$
begin
  new.updated_at := now();
  new.first_seen_at := old.first_seen_at;
  return new;
end;
$$ language plpgsql;

drop trigger if exists scraped_products_updated_trigger on scraped_products;
create trigger scraped_products_updated_trigger
  before update on scraped_products
  for each row execute function scraped_products_updated();

create table if not exists manufacturer_sources (
  id uuid primary key default gen_random_uuid(),
  manufacturer_name text not null,
  url text not null unique,
  -- メーカーごとにパーサーを切り替えるための安定したコード（例: 'myprotein', 'goldsgym'）
  manufacturer_code text,
  created_at timestamp with time zone default now()
);

create table if not exists manufacturer_products (
  id uuid primary key default gen_random_uuid(),
  manufacturer_name text not null,
  -- manufacturer_sources.manufacturer_code と揃えるためのコード
  manufacturer_code text,
  -- 元ページから取得した生の表記（パーサー改善や再解析用）
  raw_product_name text,
  raw_flavor text,
  raw_unit_text text,
  raw_price_text text,
  product_name text,
  flavor text,
  unit_text text,
  unit_kg numeric,
  price_text text,
  price_yen numeric,
  price_per_kg numeric,
  image_url text,
  source_url text,
  first_seen_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

-- upsert 用の一意キー（メーカー+商品名+フレーバー+単位で同一なら上書き）
alter table manufacturer_products add column if not exists upsert_key text;
alter table manufacturer_products drop constraint if exists manufacturer_products_upsert_key_key;
alter table manufacturer_products add constraint manufacturer_products_upsert_key_key unique (upsert_key);

create or replace function manufacturer_products_updated()
returns trigger as $$
begin
  new.updated_at := now();
  new.first_seen_at := old.first_seen_at;
  return new;
end;
$$ language plpgsql;

drop trigger if exists manufacturer_products_updated_trigger on manufacturer_products;
create trigger manufacturer_products_updated_trigger
  before update on manufacturer_products
  for each row execute function manufacturer_products_updated();

-- AI 取り込みバッチ用: 未処理テキスト保存
create table if not exists protein_source_texts (
  id uuid primary key default gen_random_uuid(),
  source_name text,
  source_url text,
  source_key text,
  raw_text text not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'excluded', 'error')),
  error_message text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create index if not exists idx_protein_source_texts_status on protein_source_texts (status);
alter table protein_source_texts drop constraint if exists protein_source_texts_source_key_key;
alter table protein_source_texts add constraint protein_source_texts_source_key_key unique (source_key);

-- AI 取り込みバッチ用: 分類結果（1 source につき1件、冪等）
create table if not exists product_classification_results (
  id uuid primary key default gen_random_uuid(),
  source_text_id uuid not null references protein_source_texts(id) on delete cascade,
  is_protein_powder boolean not null,
  excluded_reason text check (excluded_reason in ('protein_bar', 'eaa', 'bcaa', 'other_supplement', 'not_protein_related', 'unknown')),
  manufacturer text,
  product_name text,
  flavor text,
  price_jpy numeric,
  protein_grams_per_serving numeric,
  calories numeric,
  carbs numeric,
  fat numeric,
  avg_rating numeric,
  price_per_kg numeric,
  flavor_category text,
  display_manufacturer text,
  display_product_name text,
  display_flavor text,
  protein_type text check (protein_type in ('whey', 'casein', 'soy', 'pea', 'egg', 'mixed', 'unknown')),
  confidence numeric,
  product_url text,
  product_image_url text,
  created_at timestamp with time zone default now(),
  unique (source_text_id)
);

create index if not exists idx_product_classification_results_source on product_classification_results (source_text_id);

-- 匿名の簡易ユーザー評価（ログインなし）
create table if not exists product_quick_ratings (
  id uuid primary key default gen_random_uuid(),
  product_result_id uuid not null references product_classification_results(id) on delete cascade,
  client_token text not null,
  -- レーダーチャート 5軸（1〜5）
  taste int check (taste between 1 and 5),
  mixability int check (mixability between 1 and 5),
  cost_performance int check (cost_performance between 1 and 5),
  repeat_intent int check (repeat_intent between 1 and 5),
  foam int check (foam between 1 and 5),
  -- 好みが分かれる4軸（1〜5をバーで選択）
  sweetness int check (sweetness between 1 and 5),
  richness int check (richness between 1 and 5),
  milk_feel int check (milk_feel between 1 and 5),
  artificial_sweetener int check (artificial_sweetener between 1 and 5),
  created_at timestamp with time zone default now(),
  unique (product_result_id, client_token)
);

create index if not exists idx_product_quick_ratings_product on product_quick_ratings (product_result_id);

-- sample data for development
insert into brands (name,country) values
('MyProtein','UK'),
('Gold Standard','USA'),
('X-PLOSION','オーストリア');

insert into products (brand_id,name)
select id,'Impact Whey' from brands where name='MyProtein';
insert into products (brand_id,name)
select id,'Clear Whey' from brands where name='MyProtein';
insert into products (brand_id,name)
select id,'Gold Standard Whey' from brands where name='Gold Standard';

insert into flavors (product_id,flavor_name)
select p.id,'Chocolate' from products p where p.name='Impact Whey';
insert into flavors (product_id,flavor_name)
select p.id,'Strawberry Cream' from products p where p.name='Impact Whey';
insert into flavors (product_id,flavor_name)
select p.id,'Milk Tea' from products p where p.name='Clear Whey';

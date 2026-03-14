-- 楽天 API 取得商品用テーブル（1商品 = 1 item_code）
create table if not exists rakuten_products (
  id uuid primary key default gen_random_uuid(),
  item_code text not null,
  title text,
  shop_name text,
  image_url text,
  price text,
  price_value numeric,
  source_url text,
  first_seen_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (item_code)
);

comment on table rakuten_products is '楽天市場API（Ichiba Item Search）で取得した商品。import で protein_source_texts に取り込む。';
comment on column rakuten_products.item_code is '楽天の商品コード（API の itemCode）。一意キー。';
comment on column rakuten_products.title is '商品名（itemName）';
comment on column rakuten_products.shop_name is 'ショップ名';
comment on column rakuten_products.image_url is '商品画像 URL（mediumImageUrls 等）';
comment on column rakuten_products.price_value is '価格の数値（円）';
comment on column rakuten_products.source_url is '商品ページ URL（itemUrl）';

create or replace function rakuten_products_updated()
returns trigger as $$
begin
  new.updated_at := now();
  new.first_seen_at := old.first_seen_at;
  return new;
end;
$$ language plpgsql;

drop trigger if exists rakuten_products_updated_trigger on rakuten_products;
create trigger rakuten_products_updated_trigger
  before update on rakuten_products
  for each row execute function rakuten_products_updated();

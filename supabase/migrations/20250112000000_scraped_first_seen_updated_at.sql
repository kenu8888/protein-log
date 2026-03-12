-- scraped_products: 新着判定・価格更新時刻用
alter table scraped_products
  add column if not exists first_seen_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now();

update scraped_products set first_seen_at = created_at, updated_at = created_at where first_seen_at is null;

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

-- manufacturer_products: 同様
alter table manufacturer_products
  add column if not exists first_seen_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now(),
  add column if not exists upsert_key text;

update manufacturer_products set first_seen_at = created_at, updated_at = created_at where first_seen_at is null;

update manufacturer_products set upsert_key = manufacturer_name || '|' || coalesce(product_name,'') || '|' || coalesce(flavor,'') || '|' || coalesce(unit_text,'')
where upsert_key is null;

-- 重複キーがある場合は 1 件だけ残す（最新の id を残す）
delete from manufacturer_products a
using manufacturer_products b
where a.upsert_key is not null and b.upsert_key is not null
  and a.upsert_key = b.upsert_key and a.id < b.id;

drop index if exists manufacturer_products_upsert_key;
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

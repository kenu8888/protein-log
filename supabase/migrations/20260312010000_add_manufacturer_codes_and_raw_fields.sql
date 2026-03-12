-- Add manufacturer_code and raw_* fields for per-manufacturer scraping

alter table manufacturer_sources
  add column if not exists manufacturer_code text;

alter table manufacturer_products
  add column if not exists manufacturer_code text,
  add column if not exists raw_product_name text,
  add column if not exists raw_flavor text,
  add column if not exists raw_unit_text text,
  add column if not exists raw_price_text text;


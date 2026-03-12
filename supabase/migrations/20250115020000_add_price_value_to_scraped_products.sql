alter table scraped_products
  add column if not exists price_value numeric;


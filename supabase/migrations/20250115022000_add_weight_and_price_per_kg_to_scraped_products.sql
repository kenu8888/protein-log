alter table scraped_products
  add column if not exists net_weight_kg numeric,
  add column if not exists price_per_kg numeric;


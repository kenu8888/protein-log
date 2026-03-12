alter table product_classification_results
  add column if not exists avg_rating numeric,
  add column if not exists price_per_kg numeric,
  add column if not exists flavor_category text,
  add column if not exists display_manufacturer text,
  add column if not exists display_product_name text,
  add column if not exists display_flavor text;


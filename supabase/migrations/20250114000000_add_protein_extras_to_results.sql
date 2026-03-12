alter table product_classification_results
  add column if not exists protein_grams_per_serving numeric,
  add column if not exists product_url text,
  add column if not exists product_image_url text;


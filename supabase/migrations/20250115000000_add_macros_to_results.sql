alter table product_classification_results
  add column if not exists calories numeric,
  add column if not exists carbs numeric,
  add column if not exists fat numeric;


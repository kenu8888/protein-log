-- Add stock flag to classification results

alter table product_classification_results
  add column if not exists is_in_stock boolean;


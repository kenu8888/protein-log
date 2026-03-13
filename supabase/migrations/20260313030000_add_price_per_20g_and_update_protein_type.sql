-- Add price_per_20g_protein and refine protein_type categories

alter table product_classification_results
  add column if not exists price_per_20g_protein numeric;

-- Update protein_type check constraint to support detailed categories
alter table product_classification_results
  drop constraint if exists product_classification_results_protein_type_check;

alter table product_classification_results
  add constraint product_classification_results_protein_type_check
  check (
    protein_type in (
      'whey_wpc',
      'whey_wpi',
      'casein',
      'soy',
      'egg',
      'beef',
      'mixed',
      'unknown'
    )
  );


-- Add availability fields for Amazon scraped products

alter table scraped_products
  add column if not exists availability_raw text,
  add column if not exists is_available boolean;


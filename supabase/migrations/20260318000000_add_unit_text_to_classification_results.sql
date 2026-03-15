-- 一覧で「同一商品・複数容量」をまとめて表示するために容量を保持
alter table product_classification_results
  add column if not exists unit_text text;

comment on column product_classification_results.unit_text is '容量表記（例: 700g, 1050g）。manufacturer_products から補完。';

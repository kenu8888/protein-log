-- AI 取り込みバッチ用テーブル（既存 DB に追加する場合に実行）
-- protein_source_texts: 未処理テキスト保存
-- product_classification_results: 分類結果（1 source につき1件、冪等）

create table if not exists protein_source_texts (
  id uuid primary key default gen_random_uuid(),
  source_name text,
  source_url text,
  raw_text text not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'excluded', 'error')),
  error_message text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create index if not exists idx_protein_source_texts_status on protein_source_texts (status);

create table if not exists product_classification_results (
  id uuid primary key default gen_random_uuid(),
  source_text_id uuid not null references protein_source_texts(id) on delete cascade,
  is_protein_powder boolean not null,
  excluded_reason text check (excluded_reason in ('protein_bar', 'eaa', 'bcaa', 'other_supplement', 'not_protein_related', 'unknown')),
  manufacturer text,
  product_name text,
  flavor text,
  price_jpy numeric,
  protein_type text check (protein_type in ('whey', 'casein', 'soy', 'pea', 'egg', 'mixed', 'unknown')),
  confidence numeric,
  created_at timestamp with time zone default now(),
  unique (source_text_id)
);

create index if not exists idx_product_classification_results_source on product_classification_results (source_text_id);

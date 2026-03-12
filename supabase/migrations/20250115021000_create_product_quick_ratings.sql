create table if not exists product_quick_ratings (
  id uuid primary key default gen_random_uuid(),
  product_result_id uuid not null references product_classification_results(id) on delete cascade,
  client_token text not null,
  -- レーダーチャート 5軸（1〜5）
  taste int check (taste between 1 and 5),
  mixability int check (mixability between 1 and 5),
  cost_performance int check (cost_performance between 1 and 5),
  repeat_intent int check (repeat_intent between 1 and 5),
  foam int check (foam between 1 and 5),
  -- 好みが分かれる4軸（1〜5をバーで選択）
  sweetness int check (sweetness between 1 and 5),
  richness int check (richness between 1 and 5),
  milk_feel int check (milk_feel between 1 and 5),
  artificial_sweetener int check (artificial_sweetener between 1 and 5),
  created_at timestamp with time zone default now(),
  unique (product_result_id, client_token)
);

create index if not exists idx_product_quick_ratings_product on product_quick_ratings (product_result_id);



-- protein_type の check 制約を新スキーマに揃える。
-- 1. 既存行で新 enum に無い値（whey, pea 等）を 'unknown' に更新
-- 2. 既存の protein_type 用 check をすべて削除
-- 3. 新しい check を 1 つだけ追加

update product_classification_results
set protein_type = 'unknown'
where protein_type is not null
  and protein_type not in (
    'whey_wpc',
    'whey_wpi',
    'casein',
    'soy',
    'egg',
    'beef',
    'mixed',
    'unknown'
  );

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'product_classification_results'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%protein_type%'
  loop
    execute format('alter table product_classification_results drop constraint if exists %I', r.conname);
  end loop;
end $$;

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

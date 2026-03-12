-- protein_source_texts: 冪等取り込み用キー
alter table protein_source_texts
  add column if not exists source_key text;

-- 既存レコードは一旦 null のまま（重複があり得るため）。今後投入されるデータは source_key を必須運用にする。

alter table protein_source_texts drop constraint if exists protein_source_texts_source_key_key;
alter table protein_source_texts add constraint protein_source_texts_source_key_key unique (source_key);


-- Enable pgvector and add embedding column + search function

create extension if not exists vector;

alter table product_classification_results
  add column if not exists search_embedding vector(768);

-- Approximate nearest neighbor index for cosine distance
create index if not exists product_classification_results_search_embedding_idx
  on product_classification_results
  using ivfflat (search_embedding vector_cosine_ops)
  with (lists = 100);

-- Simple similarity search function for product embeddings
create or replace function match_products (
  query_embedding vector(768),
  match_count int default 20
)
returns table (
  id uuid,
  similarity float
)
language sql
stable
as $$
  select
    id,
    1 - (search_embedding <#> query_embedding) as similarity
  from product_classification_results
  where is_protein_powder = true
    and search_embedding is not null
  order by search_embedding <#> query_embedding
  limit match_count;
$$;


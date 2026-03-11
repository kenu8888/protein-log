-- Schema for Protein Log (MVP)
-- run with supabase SQL editor or migration tool

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  created_at timestamp with time zone default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default now()
);

create table if not exists flavors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  flavor_name text not null,
  created_at timestamp with time zone default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  flavor_id uuid references flavors(id) on delete cascade,
  rating int check (rating between 1 and 5),
  sweetness int check (sweetness between 1 and 5),
  mixability int check (mixability between 1 and 5),
  review_text text,
  created_at timestamp with time zone default now()
);

-- sample data for development
insert into brands (name,country) values
('MyProtein','UK'),
('Gold Standard','USA'),
('X-PLOSION','オーストリア');

insert into products (brand_id,name)
select id,'Impact Whey' from brands where name='MyProtein';
insert into products (brand_id,name)
select id,'Clear Whey' from brands where name='MyProtein';
insert into products (brand_id,name)
select id,'Gold Standard Whey' from brands where name='Gold Standard';

insert into flavors (product_id,flavor_name)
select p.id,'Chocolate' from products p where p.name='Impact Whey';
insert into flavors (product_id,flavor_name)
select p.id,'Strawberry Cream' from products p where p.name='Impact Whey';
insert into flavors (product_id,flavor_name)
select p.id,'Milk Tea' from products p where p.name='Clear Whey';

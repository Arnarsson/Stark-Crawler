-- One-shot cleanup for defective SKUs starting with '.'
-- Safe order: null out collisions first, then update the rest.

-- 1) Preview candidates
-- select id, url, sku from stark_products where sku ~ '^\s*\.' order by id limit 100;

-- 2) Null out rows that would collide after normalization
with normalized as (
  select id,
         coalesce(
           (regexp_matches(url, 'id=([0-9]{4})-([0-9]{6,12})'))[1] || (regexp_matches(url, 'id=([0-9]{4})-([0-9]{6,12})'))[2],
           (regexp_matches(sku, '([0-9]{4})[\s-]*([0-9]{6,12})'))[1] || (regexp_matches(sku, '([0-9]{4})[\s-]*([0-9]{6,12})'))[2]
         ) as new_sku
  from stark_products
  where sku ~ '^\s*\.'
), collisions as (
  select n.id as bad_id, p2.id as good_id, n.new_sku
  from normalized n
  join stark_products p2 on p2.sku = n.new_sku and p2.id <> n.id
)
update stark_products p
set sku = null, updated_at = now()
from collisions c
where p.id = c.bad_id;

-- 3) Update remaining defective rows to corrected sku
with normalized as (
  select id,
         coalesce(
           (regexp_matches(url, 'id=([0-9]{4})-([0-9]{6,12})'))[1] || (regexp_matches(url, 'id=([0-9]{4})-([0-9]{6,12})'))[2],
           (regexp_matches(sku, '([0-9]{4})[\s-]*([0-9]{6,12})'))[1] || (regexp_matches(sku, '([0-9]{4})[\s-]*([0-9]{6,12})'))[2]
         ) as new_sku
  from stark_products
  where sku ~ '^\s*\.'
)
update stark_products p
set sku = n.new_sku, updated_at = now()
from normalized n
where p.id = n.id
  and n.new_sku is not null
  and length(n.new_sku) between 10 and 16
  and not exists (
    select 1 from stark_products q where q.sku = n.new_sku and q.id <> p.id
  );

-- 4) Optional: normalize any non-digit characters, just in case
update stark_products
set sku = regexp_replace(sku, '[^0-9]', '', 'g')
where sku ~ '[^0-9]';


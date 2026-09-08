alter table public.projects
  add column title text not null default '未命名项目'
  check (char_length(title) between 1 and 100);

update public.projects
set title = left(trim(product -> 'productBrief' ->> 'productName'), 100)
where product -> 'productBrief' ->> 'productName' is not null
  and trim(product -> 'productBrief' ->> 'productName') <> '';

comment on column public.projects.title is
  'User-visible project title derived from the latest Product Brief.';

alter table public.project_versions
  add column revision_instruction text not null default ''
  check (char_length(revision_instruction) <= 800);

comment on column public.project_versions.revision_instruction is
  'Natural-language change request that produced this successful version.';

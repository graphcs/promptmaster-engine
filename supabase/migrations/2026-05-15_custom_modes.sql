-- Custom Modes table — user-scoped persona library.
-- Mirrors the templates table pattern: RLS-protected, indexed for the
-- common "list a user's items newest first" query.

create table if not exists custom_modes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  preamble text not null,
  tone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_modes_user_id_idx
  on custom_modes (user_id, created_at desc);

alter table custom_modes enable row level security;

create policy "custom_modes_owner_select" on custom_modes
  for select using (auth.uid() = user_id);

create policy "custom_modes_owner_insert" on custom_modes
  for insert with check (auth.uid() = user_id);

create policy "custom_modes_owner_update" on custom_modes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "custom_modes_owner_delete" on custom_modes
  for delete using (auth.uid() = user_id);

-- Touch updated_at on UPDATE.
create or replace function custom_modes_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists custom_modes_set_updated_at on custom_modes;
create trigger custom_modes_set_updated_at
  before update on custom_modes
  for each row execute function custom_modes_touch_updated_at();

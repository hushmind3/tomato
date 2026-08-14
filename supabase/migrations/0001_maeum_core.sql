create extension if not exists vector with schema extensions;

create type public.actor_kind as enum ('individual', 'team', 'company');
create type public.actor_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.listing_intent as enum ('seeking', 'offering');
create type public.listing_status as enum ('draft', 'active', 'paused', 'closed');
create type public.match_status as enum ('recommended', 'mutual', 'rejected', 'cancelled', 'completed');

create table public.actors (
  id uuid primary key default gen_random_uuid(),
  kind public.actor_kind not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.actor_profiles (
  actor_id uuid primary key references public.actors(id) on delete cascade,
  summary text,
  skills text[] not null default '{}',
  industries text[] not null default '{}',
  countries text[] not null default '{}',
  languages text[] not null default '{}',
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.actor_members (
  actor_id uuid not null references public.actors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.actor_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (actor_id, user_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references public.actors(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.actors(id) on delete cascade,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  intent public.listing_intent not null,
  category text not null,
  title text not null,
  summary text not null,
  requirements jsonb not null default '{}',
  visibility text not null default 'members',
  status public.listing_status not null default 'active',
  target_count integer,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  source_listing_id uuid not null references public.listings(id) on delete cascade,
  target_listing_id uuid not null references public.listings(id) on delete cascade,
  status public.match_status not null default 'recommended',
  source_decision text not null default 'pending',
  target_decision text not null default 'pending',
  score numeric(5,4),
  reasons jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_listing_id, target_listing_id)
);

create index listings_status_idx on public.listings(status);
create index listings_actor_idx on public.listings(actor_id);
create index listings_embedding_idx on public.listings using hnsw (embedding vector_cosine_ops);

alter table public.actors enable row level security;
alter table public.actor_profiles enable row level security;
alter table public.actor_members enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.listings enable row level security;
alter table public.matches enable row level security;

create policy "members can view actors" on public.actors for select to authenticated
using (exists (select 1 from public.actor_members m where m.actor_id = actors.id and m.user_id = auth.uid()));
create policy "users can create actors" on public.actors for insert to authenticated with check (true);
create policy "members manage profiles" on public.actor_profiles for all to authenticated
using (exists (select 1 from public.actor_members m where m.actor_id = actor_profiles.actor_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.actor_members m where m.actor_id = actor_profiles.actor_id and m.user_id = auth.uid()));
create policy "members view membership" on public.actor_members for select to authenticated using (user_id = auth.uid());
create policy "members manage listings" on public.listings for all to authenticated
using (exists (select 1 from public.actor_members m where m.actor_id = listings.actor_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.actor_members m where m.actor_id = listings.actor_id and m.user_id = auth.uid()));
create policy "users manage conversations" on public.conversations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conversation owners manage messages" on public.messages for all to authenticated
using (exists (select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid()))
with check (exists (select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid()));

create or replace function public.create_personal_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_actor uuid;
begin
  insert into public.actors(kind, display_name) values ('individual', coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))) returning id into new_actor;
  insert into public.actor_profiles(actor_id) values (new_actor);
  insert into public.actor_members(actor_id, user_id, role) values (new_actor, new.id, 'owner');
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_personal_actor();

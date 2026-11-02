-- Poruke: schéma databázy pre Supabase (PostgreSQL 15+)
-- Spustí sa raz v SQL Editore alebo cez Management API. Opakované spustenie nevadí.
--
-- Bezpečnosť: web používa len verejný anon kľúč.
--   majstri, fotky_realizacii, hodnotenia  -> anon smie len ČÍTAŤ (verejný zoznam, ilustračné údaje)
--   zakazky, firmy_zaujem                   -> anon smie len VKLADAŤ vybrané stĺpce, čítať nič (osobné údaje, GDPR)
--   storage zakazky-fotky                   -> súkromný bucket, anon smie len nahrať fotku k práve vytvorenej žiadosti
-- Limity: najviac 5 žiadostí a 5 registrácií z jednej IP za 10 minút, 300 žiadostí za hodinu celkovo.

create extension if not exists pgcrypto with schema extensions;

-- Pomocné funkcie sú v schéme private, ktorú REST API Supabase nesprístupňuje (nedajú sa volať ako /rpc/…).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- Tajná soľ pre odtlačok IP: vznikne náhodne v databáze, v repozitári nie je; web ju nevidí
create table if not exists private.nastavenia (kluc text primary key, hodnota text not null);
revoke all on private.nastavenia from public, anon, authenticated;
insert into private.nastavenia (kluc, hodnota)
values ('ip_sol', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (kluc) do nothing;

-- ---------------------------------------------------------------------------
-- 1) Majstri a firmy, fotky z realizácií, hodnotenia (verejné čítanie)
-- ---------------------------------------------------------------------------

create table if not exists public.majstri (
  id integer primary key,               -- poradie v zozname; stránka z neho odvodzuje roky praxe, IČO a pôsobisko
  meno text not null unique check (char_length(meno) between 2 and 120),
  firma boolean not null default false,
  remeslo text not null check (remeslo in ('elektro','voda','kurenie','komin','maliar','obklad','upratovanie','stahovanie',
                                           'montaz','zahrada','okna','solar','murar','podlahy','strecha','stolar')),
  obec text not null check (char_length(obec) between 2 and 80),
  kraj text not null check (kraj in ('BA','TT','TN','NR','ZA','BB','PO','KE')),
  hodnotenie numeric(2,1) not null check (hodnotenie between 1 and 5),
  pocet_hodnoteni integer not null check (pocet_hodnoteni >= 0),
  dokoncene integer not null check (dokoncene >= 0),
  cena text not null check (char_length(cena) between 2 and 80),
  odpoved_h integer not null check (odpoved_h between 1 and 240),
  jazyky text not null check (char_length(jazyky) between 2 and 60),
  stitok text not null check (char_length(stitok) between 2 and 60),
  aktivny boolean not null default true,
  upravene timestamptz not null default now()
);
comment on table public.majstri is 'Majstri a firmy v zozname na webe. Údaje sú ilustračné. aktivny = false skryje majstra zo stránky.';

create table if not exists public.fotky_realizacii (
  id bigint generated always as identity primary key,
  majster_id integer not null references public.majstri(id) on delete cascade,
  poradie smallint not null default 1,
  -- kľúč fotky na webe (napr. pf-kovac-1 = photos/pf-kovac-1.jpg) alebo plná https adresa obrázka
  -- PostgreSQL dovolí v regulárnom výraze najviac {…,255} opakovaní, dĺžka adresy sa preto kontroluje zvlášť
  obrazok text not null check (char_length(obrazok) <= 420 and obrazok ~ '^([a-z0-9-]{2,60}|https://[^[:space:]"''()<>\\]{8,})$'),
  popis text not null check (char_length(popis) between 2 and 160),
  unique (majster_id, poradie)
);
create index if not exists fotky_realizacii_majster_idx on public.fotky_realizacii (majster_id);
comment on table public.fotky_realizacii is 'Fotky z realizácií v profile majstra (sekcia „Fotky z realizácií“).';

create table if not exists public.hodnotenia (
  id bigint generated always as identity primary key,
  majster_id integer not null references public.majstri(id) on delete cascade,
  poradie smallint not null default 1,
  text text not null check (char_length(text) between 2 and 600),
  autor text not null check (char_length(autor) between 2 and 120),
  praca text not null check (char_length(praca) between 2 and 120),
  mesiac text not null check (char_length(mesiac) between 2 and 40),
  hviezdy smallint not null check (hviezdy between 1 and 5),
  unique (majster_id, poradie)
);
create index if not exists hodnotenia_majster_idx on public.hodnotenia (majster_id);
comment on table public.hodnotenia is 'Hodnotenia zobrazené v profile majstra (prvé tri podľa poradia). Ilustračné.';

-- ---------------------------------------------------------------------------
-- 2) Žiadosti o ponuku a firmy so záujmom o profil (len vkladanie z webu)
-- ---------------------------------------------------------------------------

create table if not exists public.zakazky (
  id uuid primary key,                  -- vytvorí prehliadač, aby k nemu vedel priradiť fotky
  vytvorene timestamptz not null default now(),
  druh text not null check (druh in ('elektro','voda','kurenie','komin','maliar','obklad','upratovanie','stahovanie',
                                     'montaz','zahrada','okna','solar','murar','podlahy','strecha','stolar','ine')),
  miesto text not null check (char_length(miesto) between 2 and 80),
  kraj text check (kraj is null or kraj in ('BA','TT','TN','NR','ZA','BB','PO','KE')),
  termin text not null check (char_length(termin) between 2 and 40),
  opis text not null check (char_length(opis) between 10 and 4000),
  rozpocet text check (rozpocet is null or char_length(rozpocet) <= 40),
  jazyk text not null check (char_length(jazyk) between 2 and 30),
  ico text check (ico is null or ico ~ '^[0-9]{8}$'),
  meno text not null check (char_length(meno) between 2 and 120),
  email text not null check (char_length(email) <= 200 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  telefon text check (telefon is null or (char_length(telefon) between 3 and 30 and telefon ~ '^[0-9 +()/.-]+$')),
  majster text check (majster is null or char_length(majster) <= 120),
  fotky_pocet smallint not null default 0 check (fotky_pocet between 0 and 5),
  tipy boolean not null default false,
  suhlas boolean not null check (suhlas),
  stav text not null default 'nova' check (stav in ('nova','spracovana','zrusena','spam')),
  ip_hash text
);
create index if not exists zakazky_vytvorene_idx on public.zakazky (vytvorene desc);
create index if not exists zakazky_ip_idx on public.zakazky (ip_hash, vytvorene desc);
comment on table public.zakazky is 'Žiadosti o ponuku z formulára „Nová zákazka“. Osobné údaje: web ich smie len vložiť, čítať ich vie len správca. Fotky sú v Storage, bucket zakazky-fotky, priečinok = id.';

create table if not exists public.firmy_zaujem (
  id bigint generated always as identity primary key,
  vytvorene timestamptz not null default now(),
  ico text not null check (ico ~ '^[0-9]{8}$'),
  email text not null check (char_length(email) <= 200 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  ip_hash text
);
create index if not exists firmy_zaujem_ip_idx on public.firmy_zaujem (ip_hash, vytvorene desc);
comment on table public.firmy_zaujem is 'Firmy a živnostníci, ktorí v sekcii Pre firmy zadali IČO a e-mail (záujem o profil).';

-- Limit počtu vložení a pseudonymizovaný odtlačok IP (sha256 s tajnou soľou, nie samotná adresa).
-- Odtlačok potrebuje len limit (10 minút), staršie ako hodina sa pri ďalšom vložení vymažú.
create or replace function private.poruke_pred_vlozenim() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  hdr json := nullif(current_setting('request.headers', true), '')::json;
  ip text := trim(split_part(coalesce(hdr->>'cf-connecting-ip', hdr->>'x-forwarded-for', hdr->>'x-real-ip', ''), ',', 1));
  n integer;
  sol text := coalesce((select hodnota from private.nastavenia where kluc = 'ip_sol'), '');
begin
  new.ip_hash := case when ip = '' then null else encode(extensions.digest(ip || '|' || sol, 'sha256'), 'hex') end;
  new.vytvorene := now();
  if tg_table_name = 'zakazky' then
    update public.zakazky set ip_hash = null where ip_hash is not null and vytvorene < now() - interval '1 hour';
    new.stav := 'nova';
    if new.ip_hash is not null then
      select count(*) into n from public.zakazky where ip_hash = new.ip_hash and vytvorene > now() - interval '10 minutes';
      if n >= 5 then raise exception 'Príliš veľa žiadostí naraz, skúste to o pár minút.' using errcode = 'P0001'; end if;
    end if;
    select count(*) into n from public.zakazky where vytvorene > now() - interval '1 hour';
    if n >= 300 then raise exception 'Služba je dočasne preťažená, skúste to neskôr.' using errcode = 'P0001'; end if;
  else
    update public.firmy_zaujem set ip_hash = null where ip_hash is not null and vytvorene < now() - interval '1 hour';
    if new.ip_hash is not null then
      select count(*) into n from public.firmy_zaujem where ip_hash = new.ip_hash and vytvorene > now() - interval '10 minutes';
      if n >= 5 then raise exception 'Príliš veľa pokusov naraz, skúste to o pár minút.' using errcode = 'P0001'; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists zakazky_pred_vlozenim on public.zakazky;
create trigger zakazky_pred_vlozenim before insert on public.zakazky
  for each row execute function private.poruke_pred_vlozenim();
drop trigger if exists firmy_zaujem_pred_vlozenim on public.firmy_zaujem;
create trigger firmy_zaujem_pred_vlozenim before insert on public.firmy_zaujem
  for each row execute function private.poruke_pred_vlozenim();
drop function if exists public.poruke_pred_vlozenim();

-- ---------------------------------------------------------------------------
-- 3) Práva a pravidlá RLS
-- ---------------------------------------------------------------------------

alter table public.majstri enable row level security;
alter table public.fotky_realizacii enable row level security;
alter table public.hodnotenia enable row level security;
alter table public.zakazky enable row level security;
alter table public.firmy_zaujem enable row level security;

revoke all on public.majstri, public.fotky_realizacii, public.hodnotenia, public.zakazky, public.firmy_zaujem from anon, authenticated;
grant select on public.majstri, public.fotky_realizacii, public.hodnotenia to anon, authenticated;
grant insert (id, druh, miesto, kraj, termin, opis, rozpocet, jazyk, ico, meno, email, telefon, majster, fotky_pocet, tipy, suhlas)
  on public.zakazky to anon, authenticated;
grant insert (ico, email) on public.firmy_zaujem to anon, authenticated;
revoke execute on function private.poruke_pred_vlozenim() from public, anon, authenticated;

drop policy if exists "verejne citanie" on public.majstri;
create policy "verejne citanie" on public.majstri for select to anon, authenticated using (aktivny);

drop policy if exists "verejne citanie" on public.fotky_realizacii;
create policy "verejne citanie" on public.fotky_realizacii for select to anon, authenticated
  using (exists (select 1 from public.majstri m where m.id = majster_id and m.aktivny));

drop policy if exists "verejne citanie" on public.hodnotenia;
create policy "verejne citanie" on public.hodnotenia for select to anon, authenticated
  using (exists (select 1 from public.majstri m where m.id = majster_id and m.aktivny));

drop policy if exists "web vklada ziadosti" on public.zakazky;
create policy "web vklada ziadosti" on public.zakazky for insert to anon, authenticated with check (suhlas);

drop policy if exists "web vklada zaujem" on public.firmy_zaujem;
create policy "web vklada zaujem" on public.firmy_zaujem for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------------
-- 4) Fotky k žiadostiam: súkromný bucket, len nahratie k žiadosti mladšej ako 15 minút
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zakazky-fotky', 'zakazky-fotky', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- názov súboru: <id žiadosti>/<1 až 5>.jpg, číslo najviac fotky_pocet danej žiadosti
create or replace function private.zakazka_prijima_fotku(nazov text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if nazov is null or nazov !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[1-5]\.jpg$' then
    return false;
  end if;
  return exists (
    select 1 from public.zakazky z
    where z.id = split_part(nazov, '/', 1)::uuid
      and z.vytvorene > now() - interval '15 minutes'
      and left(split_part(nazov, '/', 2), 1)::integer <= z.fotky_pocet
  );
end $$;
revoke execute on function private.zakazka_prijima_fotku(text) from public;
grant execute on function private.zakazka_prijima_fotku(text) to anon, authenticated;

drop policy if exists "web nahrava fotky k ziadostiam" on storage.objects;
create policy "web nahrava fotky k ziadostiam" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'zakazky-fotky' and private.zakazka_prijima_fotku(name));
drop function if exists public.zakazka_prijima_fotku(text);

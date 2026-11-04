-- Lägger till planerad slang och "på avrop" på uppdrag och förfrågningar.
-- Kör en gång i Supabase SQL Editor på en databas som redan har schema.sql.
-- Går att köra flera gånger utan skada.

alter table public.jobs     add column if not exists slang_m numeric;
alter table public.jobs     add column if not exists avrop   boolean not null default false;
alter table public.requests add column if not exists slang_m numeric;
alter table public.requests add column if not exists avrop   boolean not null default false;

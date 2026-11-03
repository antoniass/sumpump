-- Pumplogg: databas och säkerhetsregler
-- Kör hela filen i Supabase: SQL Editor -> New query -> klistra in -> Run.
-- Filen kan köras en gång på ett tomt projekt.

------------------------------------------------------------------
-- Tabeller
------------------------------------------------------------------

-- Konton: chaufförer, kunder och admin. Skapas av admin innan personen loggar in.
-- user_id fylls i när personen kopplar sin inloggning med en kod.
create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,
  roll          text not null check (roll in ('admin','chauffor','kund')),
  namn          text not null,
  kontakt       text,
  telefon       text,
  epost         text,
  fordon        text,
  prislista_id  uuid,
  created_at    timestamptz not null default now()
);

-- Koderna ligger i egen tabell så att bara admin kan läsa dem.
create table public.account_codes (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  kod        text not null unique
);

create table public.price_lists (
  id            uuid primary key default gen_random_uuid(),
  namn          text not null,
  standard      boolean not null default false,
  etablering    numeric not null default 0,
  timpris       numeric not null default 0,
  slang         numeric not null default 0,   -- kr per meter
  kubik         numeric not null default 0,   -- kr per m3
  avetablering  numeric not null default 0,
  tvatt         numeric not null default 0,
  min_timmar    numeric not null default 0,
  moms          numeric not null default 25,
  ovriga        jsonb   not null default '[]', -- [{id, namn, pris, enhet}]
  created_at    timestamptz not null default now()
);
create unique index price_lists_one_standard on public.price_lists (standard) where standard;

alter table public.accounts
  add constraint accounts_prislista_fk foreign key (prislista_id) references public.price_lists(id) on delete set null;

create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  datum         date not null,
  planerad      time,
  kund_id       uuid not null references public.accounts(id),
  chauffor_id   uuid references public.accounts(id) on delete set null,
  prislista_id  uuid references public.price_lists(id) on delete set null,
  plats         text not null,
  beskrivning   text,
  plan_m3       numeric,
  notis         text,
  created_at    timestamptz not null default now()
);
create index jobs_datum_idx on public.jobs (datum);
create index jobs_chauffor_idx on public.jobs (chauffor_id);
create index jobs_kund_idx on public.jobs (kund_id);

create table public.reports (
  job_id        uuid primary key references public.jobs(id) on delete cascade,
  chauffor_id   uuid not null references public.accounts(id),
  ankomst       time,
  start         time,
  slut          time,
  avfard        time,
  rast_min      integer not null default 0,
  m3            numeric not null default 0,
  slang_m       numeric not null default 0,
  tvatt         boolean not null default false,
  ovriga        jsonb   not null default '{}', -- {artikel-id: antal}
  mottagare     text,
  notering      text,
  status        text not null default 'utkast' check (status in ('utkast','inskickad')),
  skickad_at    timestamptz,
  updated_at    timestamptz not null default now()
);

create table public.invoices (
  id         uuid primary key default gen_random_uuid(),
  nummer     text not null unique,
  kund_id    uuid not null references public.accounts(id),
  rader      jsonb not null,
  netto      numeric not null,
  moms       numeric not null,
  brutto     numeric not null,
  skapad     timestamptz not null default now(),
  skapad_av  uuid references auth.users(id)
);

-- Godkännande med låst pris (snap) så att senare prisändringar inte påverkar.
create table public.approvals (
  job_id      uuid primary key references public.jobs(id) on delete cascade,
  godkand_at  timestamptz not null default now(),
  godkand_av  uuid references auth.users(id),
  snap        jsonb not null, -- {lines, net, vat, gross, moms, prislista}
  faktura_id  uuid references public.invoices(id) on delete set null
);

create table public.requests (
  id           uuid primary key default gen_random_uuid(),
  kund_id      uuid not null references public.accounts(id),
  datum        date not null,
  planerad     time,
  plats        text not null,
  beskrivning  text,
  plan_m3      numeric,
  status       text not null default 'ny' check (status in ('ny','bokad','avvisad')),
  job_id       uuid references public.jobs(id) on delete set null,
  skapad       timestamptz not null default now()
);

------------------------------------------------------------------
-- Hjälpfunktioner (körs med högre rättigheter så att reglerna inte går i cirkel)
------------------------------------------------------------------

create function public.my_account_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.accounts where user_id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.accounts where user_id = auth.uid() and roll = 'admin')
$$;

-- Koppla inloggningen till ett konto med kod från admin.
create function public.claim_account(p_kod text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad.'; end if;
  if exists (select 1 from accounts where user_id = auth.uid()) then
    raise exception 'Din inloggning är redan kopplad till ett konto.';
  end if;
  select a.id into v_id
    from account_codes c join accounts a on a.id = c.account_id
   where upper(c.kod) = upper(trim(p_kod)) and a.user_id is null;
  if v_id is null then raise exception 'Koden hittades inte eller är redan använd.'; end if;
  update accounts set user_id = auth.uid() where id = v_id;
  return v_id;
end $$;

-- Den allra första inloggningen kan göra sig själv till admin, bara om ingen admin finns.
create function public.claim_first_admin(p_namn text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad.'; end if;
  if exists (select 1 from accounts where roll = 'admin' and user_id is not null) then
    raise exception 'Det finns redan en admin.';
  end if;
  insert into accounts (user_id, roll, namn) values (auth.uid(), 'admin', coalesce(nullif(trim(p_namn), ''), 'Admin'))
  returning id into v_id;
  return v_id;
end $$;

-- Prislistan som gäller för ett uppdrag: uppdragets egen, annars kundens, annars standard.
create function public.resolve_price_list(p_job uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(j.prislista_id, a.prislista_id, (select id from price_lists where standard limit 1))
    from jobs j join accounts a on a.id = j.kund_id
   where j.id = p_job
$$;

-- Chauffören får se artikelnamn (utan priser) för sitt uppdrag.
create function public.report_articles(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_list uuid; v_res jsonb;
begin
  if not (is_admin() or exists (select 1 from jobs where id = p_job and chauffor_id = my_account_id())) then
    raise exception 'Ingen åtkomst.';
  end if;
  v_list := resolve_price_list(p_job);
  select jsonb_build_object(
           'tvatt', coalesce(tvatt > 0, false),
           'min_timmar', min_timmar,
           'ovriga', coalesce((select jsonb_agg(jsonb_build_object('id', o->>'id', 'namn', o->>'namn', 'enhet', o->>'enhet'))
                                 from jsonb_array_elements(ovriga) o), '[]'::jsonb))
    into v_res from price_lists where id = v_list;
  return coalesce(v_res, jsonb_build_object('tvatt', false, 'min_timmar', 0, 'ovriga', '[]'::jsonb));
end $$;

------------------------------------------------------------------
-- Säkerhetsregler (Row Level Security): vem får läsa och skriva vad
------------------------------------------------------------------

alter table public.accounts      enable row level security;
alter table public.account_codes enable row level security;
alter table public.price_lists   enable row level security;
alter table public.jobs          enable row level security;
alter table public.reports       enable row level security;
alter table public.approvals     enable row level security;
alter table public.invoices      enable row level security;
alter table public.requests      enable row level security;

-- accounts: admin allt. Övriga ser sig själva samt personen i andra änden av sina uppdrag.
create policy accounts_admin on public.accounts for all to authenticated
  using (is_admin()) with check (is_admin());
create policy accounts_self on public.accounts for select to authenticated
  using (user_id = auth.uid());
create policy accounts_counterpart on public.accounts for select to authenticated
  using (
    id in (select kund_id from public.jobs where chauffor_id = my_account_id())
    or id in (select chauffor_id from public.jobs where kund_id = my_account_id() and chauffor_id is not null)
  );

create policy codes_admin on public.account_codes for all to authenticated
  using (is_admin()) with check (is_admin());

-- Prislistor: bara admin. Chaufförer och kunder ser aldrig prislistor.
create policy price_lists_admin on public.price_lists for all to authenticated
  using (is_admin()) with check (is_admin());

-- jobs: admin allt. Chauffören och kunden ser sina egna.
create policy jobs_admin on public.jobs for all to authenticated
  using (is_admin()) with check (is_admin());
create policy jobs_chauffor on public.jobs for select to authenticated
  using (chauffor_id = my_account_id());
create policy jobs_kund on public.jobs for select to authenticated
  using (kund_id = my_account_id());

-- reports: chauffören skriver sin egen rapport tills den är godkänd.
create policy reports_admin on public.reports for all to authenticated
  using (is_admin()) with check (is_admin());
create policy reports_chauffor_select on public.reports for select to authenticated
  using (chauffor_id = my_account_id());
create policy reports_chauffor_insert on public.reports for insert to authenticated
  with check (
    chauffor_id = my_account_id()
    and exists (select 1 from public.jobs j where j.id = job_id and j.chauffor_id = my_account_id())
  );
create policy reports_chauffor_update on public.reports for update to authenticated
  using (chauffor_id = my_account_id() and not exists (select 1 from public.approvals a where a.job_id = reports.job_id))
  with check (chauffor_id = my_account_id());
create policy reports_kund_select on public.reports for select to authenticated
  using (
    exists (select 1 from public.approvals a join public.jobs j on j.id = a.job_id
             where a.job_id = reports.job_id and j.kund_id = my_account_id())
  );

-- approvals: admin skriver. Chaufför och kund ser status för sina egna uppdrag.
create policy approvals_admin on public.approvals for all to authenticated
  using (is_admin()) with check (is_admin());
create policy approvals_chauffor on public.approvals for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.chauffor_id = my_account_id()));
create policy approvals_kund on public.approvals for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.kund_id = my_account_id()));

-- invoices: bara admin.
create policy invoices_admin on public.invoices for all to authenticated
  using (is_admin()) with check (is_admin());

-- requests: kunden skickar och ser sina egna, admin hanterar.
create policy requests_admin on public.requests for all to authenticated
  using (is_admin()) with check (is_admin());
create policy requests_kund_select on public.requests for select to authenticated
  using (kund_id = my_account_id());
create policy requests_kund_insert on public.requests for insert to authenticated
  with check (kund_id = my_account_id() and status = 'ny' and job_id is null);

------------------------------------------------------------------
-- Behörigheter: utloggade (anon) får ingenting
------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function
  public.my_account_id(), public.is_admin(), public.claim_account(text),
  public.claim_first_admin(text), public.resolve_price_list(uuid), public.report_articles(uuid)
  to authenticated;

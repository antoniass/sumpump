-- Tar bort alla exempelrader (id som börjar på e0000000). Dina egna uppgifter påverkas inte.
delete from public.requests    where kund_id::text like 'e0000000%';
delete from public.invoices    where kund_id::text like 'e0000000%';
delete from public.jobs        where id::text like 'e0000000%';   -- tar även bort rapporter och godkännanden
delete from public.accounts    where id::text like 'e0000000%';   -- tar även bort koderna
delete from public.price_lists where id::text like 'e0000000%';

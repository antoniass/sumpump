-- Exempeldata för att prova Pumplogg utan att skriva in allt själv.
-- Kör i Supabase SQL Editor EFTER schema.sql. Datumen följer dagens datum.
-- Ta bort allt igen med rensa_exempeldata.sql.
-- Alla exempelrader har id som börjar på e0000000.

insert into public.price_lists (id, namn, standard, etablering, timpris, slang, kubik, avetablering, tvatt, ovriga) values
 ('e0000000-0000-0000-0000-000000000101','Standard (exempel)', not exists (select 1 from public.price_lists where standard), 2200, 900, 50, 40, 500, 1000,
  '[{"id":"o1","namn":"Väntetid, sen betong","pris":600,"enhet":"tim"}]'),
 ('e0000000-0000-0000-0000-000000000102','Bergmans avtal (exempel)', false, 2000, 850, 45, 38, 450, 900,
  '[{"id":"o1","namn":"Väntetid, sen betong","pris":550,"enhet":"tim"}]');

insert into public.accounts (id, roll, namn, kontakt, telefon, fordon, prislista_id) values
 ('e0000000-0000-0000-0000-000000000001','chauffor','Marcus Lindqvist (exempel)',null,'070-555 01 21','Pumpbil 36 m, ABC 123',null),
 ('e0000000-0000-0000-0000-000000000002','chauffor','Jonas Ekström (exempel)',null,'070-555 01 22','Pumpbil 24 m, DEF 456',null),
 ('e0000000-0000-0000-0000-000000000003','chauffor','Sara Nyberg (exempel)',null,'070-555 01 23','Pumpbil 42 m, GHI 789',null),
 ('e0000000-0000-0000-0000-000000000004','kund','Bergmans Bygg AB (exempel)','Daniel Bergman','08-555 10 10',null,'e0000000-0000-0000-0000-000000000102'),
 ('e0000000-0000-0000-0000-000000000005','kund','Norra Husbyggarna (exempel)','Elin Holm','08-555 20 20',null,null),
 ('e0000000-0000-0000-0000-000000000006','kund','Stenhamn Entreprenad (exempel)','Hassan Ali','08-555 30 30',null,null);

insert into public.account_codes (account_id, kod) values
 ('e0000000-0000-0000-0000-000000000001','MRC47K'),('e0000000-0000-0000-0000-000000000002','JNS2T5'),('e0000000-0000-0000-0000-000000000003','SRA9Q3'),
 ('e0000000-0000-0000-0000-000000000004','BRG41P'),('e0000000-0000-0000-0000-000000000005','NRD66H'),('e0000000-0000-0000-0000-000000000006','STN07M');

insert into public.jobs (id, datum, planerad, kund_id, chauffor_id, plats, beskrivning, plan_m3, notis) values
 ('e0000000-0000-0000-0000-000000000201', current_date-4,'07:30','e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000001','Ekängsvägen 14, Täby','Källarväggar',60,null),
 ('e0000000-0000-0000-0000-000000000202', current_date-3,'07:00','e0000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000002','Kvarnbacken 3, Sollentuna','Garagebotten',18,null),
 ('e0000000-0000-0000-0000-000000000203', current_date-3,'16:30','e0000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000003','Hamnvägen 22, Nacka','Pelare och bjälklag plan 1',55,null),
 ('e0000000-0000-0000-0000-000000000204', current_date-1,'15:30','e0000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000003','Hamnvägen 22, Nacka','Bjälklag plan 2',60,null),
 ('e0000000-0000-0000-0000-000000000205', current_date,'07:00','e0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000001','Ekängsvägen 14, Täby','Väggar våning 1',35,'Portkod 4821. Kontakt på plats: Daniel.'),
 ('e0000000-0000-0000-0000-000000000206', current_date,'09:30','e0000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000002','Kvarnbacken 3, Sollentuna','Uterumsplatta',14,null),
 ('e0000000-0000-0000-0000-000000000207', current_date+1,'06:00','e0000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000003','Hamnvägen 22, Nacka','Bjälklag plan 3',90,'Tidig start, grannar är informerade.'),
 ('e0000000-0000-0000-0000-000000000208', current_date+2,'08:00','e0000000-0000-0000-0000-000000000005',null,'Kvarnbacken 3, Sollentuna','Stödmur',22,null),
 ('e0000000-0000-0000-0000-000000000209', current_date+3,'07:30','e0000000-0000-0000-0000-000000000004',null,'Ekängsvägen 14, Täby','Trappa och balkong',12,null),
 ('e0000000-0000-0000-0000-000000000210', current_date+7,'07:00','e0000000-0000-0000-0000-000000000006','e0000000-0000-0000-0000-000000000003','Hamnvägen 22, Nacka','Bjälklag plan 4',85,null);

insert into public.reports (job_id, chauffor_id, ankomst, start, slut, avfard, rast_min, m3, slang_m, tvatt, ovriga, mottagare, notering, status, skickad_at) values
 ('e0000000-0000-0000-0000-000000000201','e0000000-0000-0000-0000-000000000001','07:15','07:50','11:30','12:30',30,62,30,true,'{}','Daniel, platschef','Extra slang ner i källaren.','inskickad', now()-interval '4 days'),
 ('e0000000-0000-0000-0000-000000000202','e0000000-0000-0000-0000-000000000002','06:50','07:20','08:30','09:15',0,18,0,true,'{"o1":0.5}','Elin','Betongen kom 20 min sent.','inskickad', now()-interval '3 days'),
 ('e0000000-0000-0000-0000-000000000203','e0000000-0000-0000-0000-000000000003','16:20','17:00','19:10','20:15',0,54,0,true,'{"o1":1}','Hassan','Gjutning drog över på grund av väntan på armering.','inskickad', now()-interval '3 days');
insert into public.reports (job_id, chauffor_id, ankomst, start, slut, avfard, rast_min, m3, slang_m, tvatt, ovriga, status) values
 ('e0000000-0000-0000-0000-000000000204','e0000000-0000-0000-0000-000000000003','15:20','16:00',null,null,0,0,0,false,'{}','utkast');

-- Ett redan godkänt uppdrag (Bergmans, med deras avtalspris), utan faktura än.
insert into public.approvals (job_id, snap) values
 ('e0000000-0000-0000-0000-000000000201', '{"net":11306,"vat":2827,"gross":14133,"moms":25,"prislista":"Bergmans avtal (exempel)","lines":[
   {"txt":"Etablering","antal":1,"enhet":"st","apris":2000,"belopp":2000},
   {"txt":"Timdebitering","antal":5,"enhet":"tim","apris":850,"belopp":4250},
   {"txt":"Slang","antal":30,"enhet":"m","apris":45,"belopp":1350},
   {"txt":"Kubik","antal":62,"enhet":"m³","apris":38,"belopp":2356},
   {"txt":"Avetablering","antal":1,"enhet":"st","apris":450,"belopp":450},
   {"txt":"Tvätt","antal":1,"enhet":"st","apris":900,"belopp":900}]}');

insert into public.requests (kund_id, datum, planerad, plats, beskrivning, plan_m3) values
 ('e0000000-0000-0000-0000-000000000005', current_date+4,'08:00','Kvarnbacken 3, Sollentuna','Platta garage',20);

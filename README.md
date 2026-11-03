# Pumplogg

Samordning av betongpumpar. Admin lägger upp uppdrag och delar ut dem till chaufförer, chaufförerna rapporterar tider och kubik i mobilen eller på surfplatta, kunderna följer sina uppdrag och kontoret får fakturaunderlag.

Webbappen är vanliga filer (HTML, CSS, JavaScript) utan byggsteg. Data och inloggning ligger i Supabase.

## Mappar

- `public/` är hela webbappen. `config.js` är filen du fyller i med dina Supabase-uppgifter.
- `supabase/schema.sql` skapar databasen och säkerhetsreglerna.
- `supabase/exempeldata.sql` lägger in exempelkonton, prislistor och uppdrag. `rensa_exempeldata.sql` tar bort dem igen.
- `vercel.json` säger åt Vercel att publicera mappen `public`.

## Så sätter du upp det

1. **Supabase.** Skapa projekt, region Stockholm. Öppna SQL Editor, klistra in hela `supabase/schema.sql` och tryck Run.
2. **Inloggning.** Authentication, Sign In / Providers, Email: lämna påslaget. Under Authentication, URL Configuration, fyll i din Vercel-adress som Site URL när du har den. För en pilot kan du stänga av "Confirm email" så slipper användarna bekräfta via mejl.
3. **Nycklar.** Project Settings, API. Kopiera Project URL och nyckeln `anon` (publishable). Klistra in dem i `public/config.js`. Använd aldrig `service_role` eller `secret` i appen.
4. **Vercel.** Add New Project, välj arkivet. Framework Preset: Other. Lämna Build Command tomt. Output Directory: `public`.
5. **Första admin.** Öppna appen, välj Ny användare och skapa din inloggning, välj sedan "Första gången? Skapa adminkonto". Gör det direkt efter att sidan är uppe. Den första som gör det blir admin.
6. **Konton.** Under Konton skapar du chaufförer, kunder och fler admin. Varje konto får en kod som personen skriver in första gången den loggar in.

## Säkerhet i korthet

Reglerna ligger i databasen (Row Level Security), inte i webbsidan. Chaufförer ser bara sina uppdrag och aldrig prislistor. Kunder ser bara sina egna uppdrag, och belopp först efter godkännande. Utloggade ser ingenting.

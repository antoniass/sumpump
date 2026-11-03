// Här kopplar du appen till din Supabase.
// Hitta värdena i Supabase: Project Settings -> API.
//   SUPABASE_URL      = "Project URL"
//   SUPABASE_ANON_KEY = nyckeln som heter "anon" / "public" (publishable key)
// Använd ALDRIG nyckeln som heter "service_role" eller "secret" här.
// Anon-nyckeln är gjord för att ligga i webbsidor. Säkerheten ligger i databasreglerna.
window.PUMPLOGG_CONFIG = {
  SUPABASE_URL: "sumpump.vercel.app",
  SUPABASE_ANON_KEY: "sb_publishable_RgMupy6NkhhP58RksPg9MA_M81IwCcP"
};

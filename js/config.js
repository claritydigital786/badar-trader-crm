// ── Supabase credentials ──────────────────────────────────────
// Find these in: Supabase Dashboard → Project Settings → API
const SUPABASE_URL      = 'YOUR_PROJECT_URL';   // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';      // starts with eyJ...

const { createClient } = supabase;              // supabase global comes from the CDN <script>
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

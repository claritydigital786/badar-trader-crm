import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const META_API_BASE = "https://graph.facebook.com/v19.0";

Deno.serve(async (): Promise<Response> => {
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const get = async (k: string) => (await sb.from("settings").select("value").eq("key", k).maybeSingle()).data?.value?.trim() || "";
    const token = await get("meta_token");
    const acct = await get("meta_account_id");

    async function call(url: string) { const r = await fetch(url); const j = await r.json(); return { status: r.status, body: j }; }

    const campaigns = await call(`${META_API_BASE}/${acct}/campaigns?fields=name,status,objective,created_time,start_time,stop_time&limit=100&access_token=${token}`);
    const insights90d = await call(`${META_API_BASE}/${acct}/insights?level=campaign&fields=campaign_name,impressions,clicks,spend,actions&date_preset=last_90d&limit=50&access_token=${token}`);
    const insightsToday = await call(`${META_API_BASE}/${acct}/insights?level=campaign&fields=campaign_name,impressions,clicks,spend,actions&date_preset=today&limit=50&access_token=${token}`);

    return new Response(JSON.stringify({ campaigns, insights90d, insightsToday }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } }); }
});

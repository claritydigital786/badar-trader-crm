import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (): Promise<Response> => {
  const report: Record<string, any> = {};
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: settingsRows } = await sb.from("settings").select("key, value").in("key", ["wa_access_token", "wa_phone_number_id"]);
    const token = settingsRows?.find((r: any) => r.key === "wa_access_token")?.value?.trim() || "";
    const phoneId = settingsRows?.find((r: any) => r.key === "wa_phone_number_id")?.value?.trim() || "";
    if (!token || !phoneId) throw new Error("missing wa credentials in settings");

    const { data: leads, error } = await sb.from("leads").select("id, phone, bot_stage, needs_human").eq("bot_stage", "awaiting_broker").eq("needs_human", false);
    if (error) throw error;

    for (const lead of leads || []) {
      const to = lead.phone.replace(/^\+/, "");
      const payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "Thanks for your patience! Which broker would you like to use to get started?" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "broker_exness", title: "Exness" } },
              { type: "reply", reply: { id: "broker_doprime", title: "Do Prime" } },
            ],
          },
        },
      };
      const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      report[lead.phone] = { status: r.status, ok: r.ok, body: j };
      if (r.ok) {
        await sb.from("communications").insert({
          lead_id: lead.id, type: "whatsapp", direction: "outbound",
          body: "[nudge: broker choice re-sent after outage fix]", created_at: new Date().toISOString(),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, report }), { headers: { "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ ok: false, report, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } }); }
});

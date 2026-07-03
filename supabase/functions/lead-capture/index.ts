// Lead Capture Edge Function
// Accepts landing page form submissions and inserts them into the leads table.
// Uses service role key (auto-injected by Supabase) to bypass RLS.
// Deploy with: supabase functions deploy lead-capture

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { full_name, email, phone, source, notes, instrument_type } = body;

    if (!full_name || (!email && !phone)) {
      return new Response(JSON.stringify({ error: 'full_name and at least one of email/phone are required' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await supabase.from('leads').insert({
      full_name: full_name.trim(),
      email:     email?.trim()  || null,
      phone:     phone?.trim()  || null,
      source:    source         || 'website',
      notes:     notes?.trim()  || null,
      instrument_type: instrument_type?.trim() || null,
      status:    'new',
    }).select('id').single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, lead_id: data.id }), {
      status: 201, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('lead-capture error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

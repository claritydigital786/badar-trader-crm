-- Deploy Supabase Edge Function: whatsapp-webhook
-- This opens Terminal and runs the deploy commands
-- You will need to log in to Supabase when prompted (opens browser)

tell application "Terminal"
	activate
	do script "echo '🚀 Deploying whatsapp-webhook Edge Function...' && cd '/Users/muhammad/badar-trader-crm' && npx supabase@latest login && npx supabase@latest link --project-ref vfskqzgphrunjxquqpks && npx supabase@latest functions deploy whatsapp-webhook --no-verify-jwt && echo '✅ Done! Edge function deployed.'"
end tell

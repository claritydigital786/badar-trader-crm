-- Push CRM update to GitHub (removes demo mode + adds suspend feature)
tell application "Terminal"
    activate
    do script "echo '🚀 Pushing CRM update...' && cd '/Users/muhammad/badar-trader-crm' && rm -f .git/index.lock && git add index.html supabase/schema.sql && git commit -m 'Add agent suspend/unsuspend + clean up demo mode code' && git push origin main && echo '✅ Done! Vercel will redeploy automatically in ~30 seconds.'"
end tell

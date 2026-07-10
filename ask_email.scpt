tell application "System Events"
	set emailAnswer to text returned of (display dialog "What email address should Badar use to log in to the CRM?" default answer "badar@example.com" buttons {"Cancel", "Continue"} default button "Continue" with title "Badar Trader CRM Setup")
	display dialog "Got it! Email: " & emailAnswer & return & return & "Now go to:" & return & "supabase.com/dashboard/project/vfskqzgphrunjxquqpks/auth/users" & return & return & "Click Add user → paste that email → set a password → Create." & return & return & "Then log in to the CRM and set his role to Admin in the Team tab." buttons {"OK"} default button "OK" with title "Next Steps"
end tell

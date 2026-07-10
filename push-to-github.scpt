-- Push badar-trader-crm to GitHub
-- Double-click this file in Finder to run it

set repoPath to "/Users/muhammad/badar-trader-crm"

set commitMsg to "Remove Demo Mode button from login screen"

set shellScript to "cd " & quoted form of repoPath & " && git add index.html && git commit -m " & quoted form of commitMsg & " && git push origin main 2>&1"

set result to do shell script shellScript

display dialog "✅ Pushed to GitHub successfully!

" & result buttons {"OK"} default button "OK"

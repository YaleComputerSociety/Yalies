# Browser exporters

These scripts run entirely in an authenticated Yale browser tab and download
versioned JSON files. They do not send Yale data to Yalies or any third party.

1. Sign in at `https://students.yale.edu/facebook/`, select **Yale** in the
   organization dropdown, open DevTools → Console, paste all of
   `facebook-export.js`, and press Enter. It refuses to download fewer than
   5,000 students or fewer than 14 colleges.
2. Sign in at `https://directory.yale.edu/`, open DevTools → Console, paste all
   of `directory-export.js`, and press Enter. Select the Facebook JSON when the
   file picker opens. Keep the tab open until the Directory JSON downloads.

Directory progress is checkpointed every 25 people in the site's IndexedDB.
If the session expires, reload, sign in, paste the script again, choose the same
Facebook JSON, and accept the resume prompt.

The script retries transient requests three times. To repair an already
downloaded Directory export, rerun it and select both the Facebook JSON and the
existing Directory JSON together in the initial multi-file chooser (Cmd-click
or Ctrl-click). Only missing/error entries are queried again. The terminal
importer refuses any Directory export that still contains known request errors.

Treat both downloads as confidential Yale data. Keep them out of git and delete
them when the database run and verification are complete.

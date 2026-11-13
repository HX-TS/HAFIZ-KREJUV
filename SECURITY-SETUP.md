# Enable private Google Sheets access

The code is prepared, but your LIVE site and sheets are NOT secured by downloading
these files. Complete the account settings and deployment below.

GitHub Pages still serves a public page shell and public source code. Google
enforces access to the reference records through the Sheets API. Do not hardcode
confidential records, passwords, or credentials in this repository.

## 1. Restrict all four source spreadsheets now

Open each sheet using the Google account that owns it:

| Page / source | Spreadsheet |
| --- | --- |
| Main bookmarks, permits, equipment | https://docs.google.com/spreadsheets/d/1TO2V5GSsTv73uxyCsBCO-e-oKGKVuPMea8tuok6Y2jE/edit |
| Swabbing | https://docs.google.com/spreadsheets/d/1dPQfygx00SWQLDKmLbK1zyKX5by40ub6xZqm1VAUaDs/edit |
| Dew point | https://docs.google.com/spreadsheets/d/1vdrb81qWoamvrjqI-t6nSOUjYlK1ldnMxKduUAZxTWM/edit |
| Summary | https://docs.google.com/spreadsheets/d/1WxRyDXfI7RCg14E-G3beG2dNeyP5IUU9vBKt6T_C8SM/edit |

For EACH spreadsheet:

1. **Share → General access → Restricted → Done**.
2. Review **People with access**, including groups, and remove anyone who should
   not have access. For personal use, only your account needs access.
3. Open **File → Share → Publish to web**. If it is published, choose **Stop
   publishing**. Restricting normal sharing does not replace this step.
4. Test in a private browser window while signed out of Google. The spreadsheet
   and its old export/data URLs must no longer return records.

This intentionally stops the old website from loading fresh data until the new
version is deployed. Previously downloaded records and other people's browser
caches cannot be remotely erased. The new version removes this site's old
localStorage cache on devices where it runs.

## 2. Create a Google OAuth client (no password or client secret needed)

1. Open https://console.cloud.google.com/ and create or select your project.
2. Under **APIs & Services → Library**, enable **Google Sheets API**.
3. Open **Google Auth Platform** (or **OAuth consent screen**). Set the app name,
   support email, and contact email. For a personal Gmail account, choose the
   **External** audience. If using a company account, follow its admin policy.
4. Under **Data Access / Scopes**, add:
   `https://www.googleapis.com/auth/spreadsheets.readonly`.
   This scope grants read-only access to spreadsheets your signed-in account can
   access; it is not limited to these four sheets. The application requests only
   these configured sheets and never requests editing permission.
5. Keep the app in **Testing** for personal testing and add your own Google email
   under **Audience → Test users**. Testing apps may require consent again after
   seven days. Wider distribution may require Google's verification process.
6. Under **Clients / Credentials → Create OAuth client ID**, choose
   **Web application**.
7. Add this **Authorized JavaScript origin**, without the repository path:
   `https://hx-ts.github.io`
8. For local testing, optionally also add `http://localhost:8080`.
   The popup token flow does not need an authorized redirect URI.
9. Copy the public **Client ID**, ending in `.apps.googleusercontent.com`, into
   `googleClientId` in `security-config.js`. Keep the surrounding quotes.
   Do not put a client secret in any website file or send one in chat.

Google may restrict `github.io` domains during app registration or verification.
If your console rejects this origin or requires a verified domain, use a custom
domain you control and add that exact HTTPS origin instead. Do not disable
Google's checks to work around a registration failure.

## 3. Deploy to your existing GitHub Pages site

Replace/upload these files to the SAME branch and folder currently used by
**hx-ts/HAFIZ-KREJUV → Settings → Pages**:

- `index.html`
- `SWABBING/index.html`
- `SUMMARY/index.html`
- `security.js`
- `security.css`
- `security-config.js` (with your public client ID)

Keep the folders exactly as shown. Uploading only the main HTML file is not
enough. If Pages uses a build workflow, ensure it copies the new JS and CSS files.
Commit the files and wait for the GitHub Pages deployment to succeed.

The app stays locked if the client ID is blank, Google sign-in fails, a session
expires, or Google refuses access to a sheet. There is no public export fallback.
Each page has its own in-memory login session; you may need to sign in again when
navigating between pages. Signing out also notifies other open updated pages on
the same origin when the browser supports BroadcastChannel.

## 4. Verify the LIVE setup

- Signed-out/private window: each of the three pages shows **Continue with
  Google**, with no reference records and no Sheets API request before sign-in.
- Your Google account: sign-in loads the tables, bookmarks, and graphs.
- An account without sheet permission: Google refuses the data. With OAuth in
  Testing, accounts not on the test-user list may be blocked even earlier.
- Sign out: records disappear. Reload and browser Back must not restore records
  without a new sign-in. Tokens and data must not appear in localStorage or
  sessionStorage.
- In a signed-out window, test the OLD public endpoints too, for every sheet:
  `https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/tq?sheet=DATA&tqx=out:json`
  and `https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0`.
  These must refuse access. Also test any old published `/d/e/.../pub...` links
  if you previously used Publish to web.

Anonymous-access refusal must be checked after changing Google settings. The
application cannot make a public sheet private by itself.

## Maintenance

The pages contain a Content Security Policy that blocks arbitrary inline
scripts, third-party music scripts, and the old public Sheets endpoints. The
SoundCloud background player was removed so its third-party JavaScript cannot
run alongside your signed-in session.

After editing any inline JavaScript in an HTML page, run:

```sh
python3 update_security_policy.py
```

Deploy the updated HTML together with the changes. Otherwise the browser will
block the edited script. No build step is needed for the supplied version.

Enable two-factor authentication for your GitHub and Google accounts. Keep the
links' destination documents private as well; protecting this dashboard does
not change permissions on the documents it links to.

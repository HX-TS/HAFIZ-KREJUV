# Public records, private spreadsheets

Visitors see the existing records without signing in. Only your Google account
can edit the source spreadsheets. A Google Apps Script Web app, executing as you,
reads the private sheets and returns selected dataset responses to the website.

The public website contains a service URL and dataset names. Source spreadsheet
IDs are stored in the Apps Script project's private Script Properties. The
service has no write endpoint and requests read-only Google Sheets permission.

Public visitors can copy the displayed records or read the public service's
responses directly. A no-login service cannot guarantee that only this website
can consume its public data. Hiding a spreadsheet ID is not an access control;
the spreadsheet's Restricted sharing setting protects the source workbook.

## 1. Keep the source spreadsheets private

For all four spreadsheets (main, swabbing, dew point, summary):

- Keep **Share → General access → Restricted**.
- Under **People with access**, keep only your Google account if visitors should
  have no direct workbook access. Review group and organization access too.
- Under **File → Share → Publish to web**, stop publishing if enabled.
- Keep linked documents private or shared according to the audience you intend.
  Publicizing this dashboard does not change their permissions.

The IDs were present in older public commits. Removing them from current pages
does not erase that history; Restricted permissions protect the actual workbook.

## 2. Create the read-only Google Apps Script service

1. Sign in to the Google account that owns all four sheets and open
   https://script.google.com/ . Create a **New project**.
2. Paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs) into its
   `Code.gs` file. The code contains no actual source spreadsheet IDs.
3. Open **Project Settings**, enable **Show appsscript.json manifest file in
   editor**, then replace that file with
   [`apps-script/appsscript.json`](apps-script/appsscript.json).
4. In the editor, confirm **Services** includes **Google Sheets API v4**. If
   necessary, use **Services → + → Google Sheets API → Add**. If you attached a
   standard Google Cloud project, enable the Google Sheets API in that project
   as well. A default Apps Script Cloud project normally enables it when the
   advanced service is added.
5. Open **Project Settings → Script Properties → Add script property**. Add:

   | Property | Value |
   | --- | --- |
   | `MAIN_SHEET_ID` | ID from your main spreadsheet URL |
   | `SWABBING_SHEET_ID` | ID from your swabbing spreadsheet URL |
   | `DEW_SHEET_ID` | ID from your dew-point spreadsheet URL |
   | `SUMMARY_SHEET_ID` | ID from your summary spreadsheet URL |

   In `https://docs.google.com/spreadsheets/d/ID/edit`, copy only `ID`.
   Save these properties privately in Apps Script, not in GitHub or website JS.
   These IDs are identifiers, not passwords, but keeping them out of the public
   files satisfies the separation between the workbook and website.
6. The main workbook must have the `DATA`, `EQUIPMENT`, and `BOOKMARKS` tabs used
   by the existing site. The other workbooks use tab ID `0`, as before. If the
   tabs have different numeric IDs, update the corresponding `gid` values in
   `PUBLIC_DATASETS` in the private Apps Script project.

## 3. Deploy the service under your account

1. Choose **Deploy → New deployment → Select type → Web app**.
2. Set **Execute as: Me** (the sheet-owning account).
3. Set **Who has access: Anyone**, including signed-out visitors. Choosing
   **Anyone with Google account** would still require login.
4. Click **Deploy**, authorize the service as the owner, and copy the Web app URL
   ending in `/exec`. Visitors do not need an OAuth client ID or Google account.
5. If your Workspace administrator does not permit anonymous Apps Script Web
   apps, this hosting method cannot provide no-login access in that account.
   Use an account/host that permits the intended public service.

Use the deployed `/exec` URL. The editor's `/dev` test URL is restricted to editors.
Your Apps Script source/project and spreadsheet sharing remain private even
though the deployed Web app returns public records.

## 4. Connect the website

Send the `/exec` URL to the assistant, or paste it into `endpoint` in
`public-config.js`. It is a public service URL, not a password or access token.

Deploy the updated HTML, `public-data.js`, `public-data.css`, and
`public-config.js` to GitHub Pages together. The public version replaces the
previous OAuth frontend and removes its client configuration and login controls.
Until a service URL is configured, the new page shows an unavailable-records
message. Keep this change as a draft until the service works.

## 5. Verify before publishing

- In a private/signed-out window, append `?dataset=main` to the `/exec` URL.
  It should return JSON with `"ok":true`. Repeat with `swabbing`, `dew`, and
  `summary`. Do not share account credentials if there is an error.
- Confirm no response includes any of your four source spreadsheet IDs. The
  service also redacts references to those workbooks from returned cell text.
- Open each of the three website pages without signing in. Tables, bookmarks,
  and graphs should load and refresh. There should be no sign-in/edit controls.
- Update a record in Google Sheets as the owner. It should appear on the site
  within approximately two minutes, depending on refresh timing.
- In the signed-out window, direct spreadsheet and old export URLs must still
  refuse workbook access. Public service records are readable by design.

The service exposes only the four named datasets and the existing A:Z record
columns. It does not accept a visitor-provided source ID, arbitrary range, or
write operation. Backend exceptions are replaced with a generic error message.

## Maintenance and limits

After editing inline page JavaScript, regenerate CSP hashes with
`python3 update_security_policy.py`. The policy permits the Apps Script JSONP
transport and blocks the former Google sign-in and direct Sheets API hosts.

Apps Script has execution and API quotas. The service caches successful dataset
responses for 50 seconds, and the browser coalesces concurrent requests. It is
suited to a modest public reference site; sustained high traffic may need a
different backend. Previously copied public records cannot be remotely recalled.

For server-code changes, use **Deploy → Manage deployments → Edit → New version**
to update the existing Web app deployment while keeping its URL. Source-property
changes are read server-side; no source IDs need to be added to the website.

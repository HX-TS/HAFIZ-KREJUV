// Browser regression tests with synthetic Google responses. No real credentials.
// Start: python3 -m http.server 8080 --bind 127.0.0.1
// Run: node verify-security.cjs (requires Playwright and Chromium).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.TEST_SITE_URL || 'http://127.0.0.1:8080';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const sheetIds = {
  main: '1TO2V5GSsTv73uxyCsBCO-e-oKGKVuPMea8tuok6Y2jE',
  summary: '1WxRyDXfI7RCg14E-G3beG2dNeyP5IUU9vBKt6T_C8SM',
};
const stringCell = value => ({ effectiveValue: { stringValue: value }, formattedValue: value });
const dateCell = { effectiveValue: { numberValue: 46244.5 }, formattedValue: '10/08/2026 12:00', effectiveFormat: { numberFormat: { type: 'DATE_TIME' } } };
function gridFor(url) {
  const range = url.searchParams.get('ranges') || '';
  let rows;
  if (url.pathname.includes(sheetIds.summary)) {
    rows = [['NO','STEPS','PIG ARRANGEMENT / ACTIVITIES','PIG','START/LAUNCH','END/ARRIVAL'], ['1','Step 1','PRIVATE REFERENCE FIXTURE','A','10/08/2026 12:00','11/08/2026 12:00']];
  } else if (range.includes('BOOKMARKS')) {
    rows = [['SECTION','NAME','URL','ORDER'], ['MAIN SITE','PRIVATE REFERENCE FIXTURE <img src=x onerror=alert(1)>','https://example.com','1']];
  } else if (range.includes('EQUIPMENT')) {
    rows = [['PTW_NO','LOCATION','EQUIPMENT','EXPIRY_DATE']];
  } else if (url.pathname.includes(sheetIds.main)) {
    rows = [['TYPE','SECTION','LOCATION','NUMBER','START','END','DESCRIPTION','URL','VEC_NO','VEC_START','VEC_END','VEC_DESCRIPTION','VEC_URL']];
  } else {
    rows = [['DATE','TIME','LOCATION','READING'], ['10/08/2026','12:00','PRIVATE REFERENCE FIXTURE','-15']];
  }
  const rowData = rows.map(row => ({ values: row.map(stringCell) }));
  if (!url.pathname.includes(sheetIds.main) && !url.pathname.includes(sheetIds.summary)) rowData[1].values[0] = dateCell;
  return { sheets: [{ data: [{ rowData }] }] };
}
const googleMock = `window.google = {accounts:{oauth2:{
  initTokenClient(options) { window.mockTokenOptions = options; return {
    requestAccessToken() { window.mockRequested = true; }
  }; },
  hasGrantedAllScopes(response, scope) { return response.scope === scope; },
  revoke(token, callback) { callback(); }
}}};`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    for (const path of ['/', '/SWABBING/', '/SUMMARY/']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      const violations = [];
      let denied = false;
      let delayResponse;
      page.on('pageerror', error => errors.push(error.message));
      await page.exposeFunction('reportCSP', item => violations.push(item));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', event => window.reportCSP({ directive: event.effectiveDirective, url: event.blockedURI }));
        localStorage.setItem('krejuv-fec-sheet-data-v7', '[{"private":"OLD CACHE"}]');
      });
      await context.route('**/security-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.PRIVATE_SITE_CONFIG={googleClientId:"test-client.apps.googleusercontent.com"};' }));
      await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: googleMock }));
      await context.route('https://i.ibb.co/**', route => route.abort());
      await context.route('https://sheets.googleapis.com/**', async route => {
        requests.push(route.request());
        if (delayResponse) await delayResponse;
        const url = new URL(route.request().url());
        const body = denied ? { error: { message: 'Access denied' } } : url.searchParams.has('ranges') ? gridFor(url) : { sheets: [{ properties: { sheetId: 0, title: 'Data' } }] };
        try { await route.fulfill({ status: denied ? 403 : 200, contentType: 'application/json', body: JSON.stringify(body) }); } catch { /* Requests may have been aborted at sign-out. */ }
      });
      const signIn = async (expires = 3600, scope = SCOPE) => {
        await page.locator('#security-signin').click();
        await page.evaluate(({expires,scope}) => window.mockTokenOptions.callback({ access_token: 'synthetic-test-token', expires_in: expires, scope }), {expires,scope});
      };

      await page.goto(BASE + path);
      await page.waitForFunction(() => !document.getElementById('security-signin').disabled);
      assert.equal(await page.locator('#private-app').isVisible(), false);
      assert.equal(requests.length, 0, 'No data requests before sign-in');
      assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0, 'Old cache removed');
      await signIn();
      await page.locator('#private-app').waitFor({ state: 'visible' });
      assert.ok((await page.locator('#private-app').innerText()).includes('PRIVATE REFERENCE FIXTURE'));
      assert.ok(requests.every(request => request.headers().authorization === 'Bearer synthetic-test-token'));
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      assert.equal(await page.locator('img[src="x"]').count(), 0, 'Sheet text does not become executable HTML');
      assert.deepEqual(errors, [], 'No page exceptions');
      assert.deepEqual(violations, [], 'CSP allows the intended application');

      await page.locator('#security-signout').click();
      assert.equal(await page.locator('#private-app').isVisible(), false);
      assert.ok(!(await page.locator('#private-app').innerText()).includes('PRIVATE REFERENCE FIXTURE'));
      assert.equal(await page.evaluate(() => SecureSheets.isAuthenticated()), false);
      const count = requests.length;
      assert.equal(await page.evaluate(async () => {
        try { await SecureSheets.readCSV('anything', { gid: '0' }); return false; } catch { return true; }
      }), true);
      assert.equal(requests.length, count, 'Signed-out API calls are blocked');

      await signIn(3600, '');
      assert.equal(await page.locator('#private-app').isVisible(), false);
      assert.equal(requests.length, count, 'Denied consent makes no data request');

      denied = true;
      await signIn();
      assert.equal(await page.locator('#private-app').isVisible(), false);
      assert.match(await page.locator('#security-status').innerText(), /Access denied/);
      denied = false;
      await signIn(61);
      await page.locator('#private-app').waitFor({ state: 'visible' });
      await page.locator('#security-gate').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => SecureSheets.isAuthenticated()), false);
      assert.ok(!(await page.locator('#private-app').innerText()).includes('PRIVATE REFERENCE FIXTURE'));

      // Revocation during an in-flight read must discard its eventual response.
      await signIn();
      await page.locator('#private-app').waitFor({ state: 'visible' });
      let release;
      delayResponse = new Promise(resolve => { release = resolve; });
      await page.evaluate(() => {
        window.pendingRead = SecureSheets.readCSV('test-sheet', { sheetName: 'Data' }).then(() => false, () => true);
      });
      await page.locator('#security-signout').click();
      release();
      delayResponse = null;
      assert.equal(await page.evaluate(() => window.pendingRead), true, 'In-flight response rejected at sign-out');

      // Browser-side password-style bypasses cannot obtain a Google token.
      const beforeBypass = requests.length;
      await page.evaluate(() => {
        document.getElementById('private-app').hidden = false;
        document.getElementById('security-gate').hidden = true;
      });
      assert.equal(await page.evaluate(() => SecureSheets.isAuthenticated()), false);
      assert.equal(requests.length, beforeBypass);
      assert.ok(!(await page.locator('#private-app').innerText()).includes('PRIVATE REFERENCE FIXTURE'));
      console.log(`PASS ${path}: signed-out, authorised, denied, expiry, sign-out, cache removal, in-flight cancellation, CSP`);
      await context.close();
    }

    const page = await browser.newPage();
    const requests = [];
    page.on('request', request => { if (request.url().includes('sheets.googleapis.com')) requests.push(request); });
    await page.goto(BASE);
    await page.getByText('Google sign-in setup is required.', { exact: false }).waitFor();
    assert.equal(await page.locator('#security-signin').isDisabled(), true);
    assert.equal(await page.locator('#private-app').isVisible(), false);
    assert.equal(requests.length, 0);
    console.log('PASS missing configuration stays locked');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

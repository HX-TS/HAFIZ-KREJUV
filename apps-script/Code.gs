/** Public read-only records API. Store all source IDs in SCRIPT PROPERTIES.
 * No doPost, write methods, arbitrary sheet IDs, OAuth tokens, or source URLs
 * are returned to visitors. Uses the built-in SpreadsheetApp service.
 */
const PUBLIC_DATASETS = Object.freeze({
  main: { property: 'MAIN_SHEET_ID', tabs: ['DATA', 'EQUIPMENT', 'BOOKMARKS'] },
  swabbing: { property: 'SWABBING_SHEET_ID', gid: 0 },
  dew: { property: 'DEW_SHEET_ID', gid: 0 },
  summary: { property: 'SUMMARY_SHEET_ID', gid: 0 },
});

// Run this manually in the Apps Script editor to diagnose owner-side setup.
// It is not an HTTP endpoint and never prints source IDs or spreadsheet records.
function checkSetup() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const result = Object.keys(PUBLIC_DATASETS).map(dataset => {
    const configuration = PUBLIC_DATASETS[dataset];
    const id = properties[configuration.property];
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return { dataset: dataset, property: configuration.property, status: 'missing_or_invalid_property' };
    }
    try {
      const workbook = SpreadsheetApp.openById(id);
      const tabs = workbook.getSheets().map(sheet => ({ name: sheet.getName(), gid: sheet.getSheetId() }));
      if (configuration.tabs) {
        const missing = configuration.tabs.filter(name => !workbook.getSheetByName(name));
        return { dataset: dataset, status: missing.length ? 'required_tabs_missing' : 'ready', missingTabs: missing, availableTabs: tabs };
      }
      return { dataset: dataset, status: tabs.some(tab => tab.gid === configuration.gid) ? 'ready' : 'tab_id_missing', expectedGid: configuration.gid, availableTabs: tabs };
    } catch (ignored) {
      return { dataset: dataset, property: configuration.property, status: 'workbook_unavailable_check_id_and_owner_access' };
    }
  });
  Logger.log(JSON.stringify(result));
  return result;
}

function doGet(event) {
  const parameters = event && event.parameter || {};
  const callback = parameters.callback || '';
  if (callback && !/^__hafizPublicData_[a-f0-9]{32}$/.test(callback)) {
    return output_({ ok: false, error: 'Invalid callback.' }, '');
  }
  const dataset = parameters.dataset || '';
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_DATASETS, dataset)) {
    return output_({ ok: false, error: 'Unknown dataset.' }, callback);
  }
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const configuration = PUBLIC_DATASETS[dataset];
    const sourceId = properties[configuration.property];
    if (!sourceId || !/^[a-zA-Z0-9_-]+$/.test(sourceId)) throw new Error('Source configuration required.');
    const sourceIds = Object.keys(PUBLIC_DATASETS).map(key => properties[PUBLIC_DATASETS[key].property]).filter(Boolean);
    const signature = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(sourceIds)));
    const cacheKey = 'public-v2-' + dataset + '-' + signature;
    const cache = CacheService.getScriptCache();
    const cached = cache.get(cacheKey);
    if (cached) return output_(JSON.parse(cached), callback);

    const workbook = SpreadsheetApp.openById(sourceId);
    const sheets = configuration.tabs
      ? configuration.tabs.map(name => workbook.getSheetByName(name))
      : [workbook.getSheets().find(sheet => sheet.getSheetId() === configuration.gid)];
    if (sheets.some(sheet => !sheet)) throw new Error('Configured tab unavailable.');
    const timeZone = workbook.getSpreadsheetTimeZone();
    const tabs = sheets.map(sheet => sheet.getName());
    const tables = {};
    const displayRows = {};
    sheets.forEach(sheet => {
      const lastRow = sheet.getLastRow();
      const lastColumn = Math.min(sheet.getLastColumn(), 26);
      let rows = [];
      if (lastRow > 0 && lastColumn > 0) {
        const range = sheet.getRange(1, 1, lastRow, lastColumn);
        const values = range.getValues();
        const display = range.getDisplayValues();
        rows = values.map((row, rowIndex) => row.map((value, columnIndex) =>
          cell_(value, display[rowIndex][columnIndex], timeZone, sourceIds)));
      }
      const headers = rows[0] || [];
      const width = rows.reduce((size, row) => Math.max(size, row.length), headers.length);
      tables[sheet.getName()] = { table: {
        cols: Array.from({ length: width }, (_, index) => ({ label: headers[index] ? headers[index].f : '' })),
        rows: rows.slice(1).map(row => ({ c: Array.from({ length: width }, (_, index) => row[index] || { v: '', f: '' }) })),
      } };
      displayRows[sheet.getName()] = rows.map(row => row.map(cell => cell.f));
    });
    if (tabs.some(name => !tables[name])) throw new Error('Configured table unavailable.');
    const data = dataset === 'main' ? { tables: tables }
      : dataset === 'summary' ? { rows: displayRows[tabs[0]] }
      : { table: tables[tabs[0]] };
    const payload = { ok: true, data: data };
    // Cache writes are optional: large datasets may exceed Apps Script's limit.
    try { cache.put(cacheKey, JSON.stringify(payload), 50); } catch (ignored) {}
    return output_(payload, callback);
  } catch (ignored) {
    // Never expose Google's exception text, source IDs, or private URLs.
    return output_({ ok: false, error: 'Reference data is temporarily unavailable.' }, callback);
  }
}

function cell_(rawValue, display, timeZone, sourceIds) {
  let value = rawValue;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (!isNaN(value.getTime())) {
      const parts = Utilities.formatDate(value, timeZone, 'yyyy,M,d,H,m,s').split(',').map(Number);
      parts[1] -= 1; // GViz-compatible month index, preserving spreadsheet time zone.
      value = 'Date(' + parts.join(',') + ')';
    } else value = '';
  }
  if (typeof value === 'string') value = redact_(value, sourceIds);
  return { v: value === null || value === undefined ? '' : value,
    f: redact_(String(display === null || display === undefined ? '' : display), sourceIds) };
}

function redact_(text, sourceIds) {
  let output = String(text).replace(/https?:\/\/[^\s<>"']+/g, url =>
    sourceIds.some(id => url.indexOf(id) !== -1) ? '[source spreadsheet]' : url);
  sourceIds.forEach(id => { output = output.split(id).join('[source spreadsheet]'); });
  return output;
}

function output_(payload, callback) {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

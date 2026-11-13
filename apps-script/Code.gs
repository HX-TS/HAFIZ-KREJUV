/** Public read-only records API. Store all source IDs in SCRIPT PROPERTIES.
 * No doPost, write methods, arbitrary sheet IDs, OAuth tokens, or source URLs
 * are returned to visitors. Enable the Google Sheets advanced service (v4).
 */
const PUBLIC_DATASETS = Object.freeze({
  main: { property: 'MAIN_SHEET_ID', tabs: ['DATA', 'EQUIPMENT', 'BOOKMARKS'] },
  swabbing: { property: 'SWABBING_SHEET_ID', gid: 0 },
  dew: { property: 'DEW_SHEET_ID', gid: 0 },
  summary: { property: 'SUMMARY_SHEET_ID', gid: 0 },
});

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
    const cacheKey = 'public-v1-' + dataset + '-' + signature;
    const cache = CacheService.getScriptCache();
    const cached = cache.get(cacheKey);
    if (cached) return output_(JSON.parse(cached), callback);

    let tabs = configuration.tabs;
    if (!tabs) {
      const metadata = Sheets.Spreadsheets.get(sourceId, { fields: 'sheets.properties(sheetId,title)' });
      const tab = (metadata.sheets || []).find(item => item.properties.sheetId === configuration.gid);
      if (!tab) throw new Error('Configured tab unavailable.');
      tabs = [tab.properties.title];
    }
    const response = Sheets.Spreadsheets.get(sourceId, {
      ranges: tabs.map(name => "'" + name.replace(/'/g, "''") + "'!A:Z"),
      includeGridData: true,
      fields: 'sheets(properties(title),data(rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat)))))',
    });
    const tables = {};
    const displayRows = {};
    (response.sheets || []).forEach(sheet => {
      const grid = sheet.data && sheet.data[0] && sheet.data[0].rowData || [];
      const rows = grid.map(row => (row.values || []).map(cell => cell_(cell, sourceIds)));
      const headers = rows[0] || [];
      const width = rows.reduce((size, row) => Math.max(size, row.length), headers.length);
      tables[sheet.properties.title] = { table: {
        cols: Array.from({ length: width }, (_, index) => ({ label: headers[index] ? headers[index].f : '' })),
        rows: rows.slice(1).map(row => ({ c: Array.from({ length: width }, (_, index) => row[index] || { v: '', f: '' }) })),
      } };
      displayRows[sheet.properties.title] = rows.map(row => row.map(cell => cell.f));
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

function cell_(cell, sourceIds) {
  const effective = cell.effectiveValue || {};
  let value = effective.stringValue !== undefined ? redact_(effective.stringValue, sourceIds)
    : effective.numberValue !== undefined ? effective.numberValue
    : effective.boolValue !== undefined ? effective.boolValue : '';
  const numberType = cell.effectiveFormat && cell.effectiveFormat.numberFormat && cell.effectiveFormat.numberFormat.type;
  if (typeof value === 'number' && (numberType === 'DATE' || numberType === 'DATE_TIME')) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    value = 'Date(' + [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].join(',') + ')';
  }
  const display = cell.formattedValue !== undefined ? cell.formattedValue : String(value);
  return { v: value, f: redact_(String(display), sourceIds) };
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

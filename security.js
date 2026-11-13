/* Google enforces access to each private spreadsheet. The page shell is public.
   Tokens and sheet data stay in memory; never fall back to anonymous endpoints. */
(() => {
  "use strict";
  const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
  const API = "https://sheets.googleapis.com/v4/spreadsheets/";
  const DAY_MS = 86400000;
  let accessToken = "";
  let expiresAt = 0;
  let expiryTimer;
  let tokenClient;
  let onReady;
  let onLock;
  let started = false;
  let busy = false;
  let generation = 0;
  const requests = new Set();
  const metadata = new Map();
  const channel = typeof BroadcastChannel === "function"
    ? new BroadcastChannel("hafiz-krejuv-security") : null;

  const element = id => document.getElementById(id);
  const signedIn = () => Boolean(accessToken) && Date.now() < expiresAt;
  const status = message => { element("security-status").textContent = message; };

  function removeLegacyCache() {
    try {
      Object.keys(localStorage).filter(key => key.startsWith("krejuv-fec-sheet-"))
        .forEach(key => localStorage.removeItem(key));
    } catch { /* Storage can be unavailable in private browsing. */ }
  }

  function lock(message = "Sign in to view your reference data.") {
    generation += 1;
    accessToken = "";
    expiresAt = 0;
    clearTimeout(expiryTimer);
    requests.forEach(controller => controller.abort());
    requests.clear();
    metadata.clear();
    element("private-app").hidden = true;
    element("security-gate").hidden = false;
    busy = false;
    element("security-signin").disabled = !tokenClient;
    removeLegacyCache();
    onLock?.();
    status(message);
  }

  function signOut(broadcast = true) {
    const previousToken = accessToken;
    lock("Signed out. Your reference data has been cleared from this page.");
    if (broadcast) channel?.postMessage("signout");
    // Revoke this app's grant in addition to clearing the local session.
    if (previousToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(previousToken, () => {});
    }
  }

  async function fetchJSON(path) {
    if (!signedIn()) throw new Error("Sign in to read the private Google Sheet.");
    const requestGeneration = generation;
    const controller = new AbortController();
    requests.add(controller);
    try {
      const response = await fetch(API + path, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store", credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (requestGeneration !== generation) throw new Error("Session ended.");
      if (response.status === 401 || response.status === 403) {
        lock(response.status === 401
          ? "Your session expired. Sign in again."
          : "Access denied. Use a Google account with permission to view this sheet. Also check that the Google Sheets API is enabled.");
        throw new Error("Google Sheets access denied.");
      }
      if (!response.ok) throw new Error(`Google Sheets request failed (${response.status}).`);
      const result = await response.json();
      if (requestGeneration !== generation || !signedIn()) throw new Error("Session ended.");
      return result;
    } finally {
      requests.delete(controller);
    }
  }

  async function sheetTitle(id, gid) {
    if (!metadata.has(id)) {
      metadata.set(id, fetchJSON(`${encodeURIComponent(id)}?fields=sheets.properties(sheetId,title)`)
        .catch(error => { metadata.delete(id); throw error; }));
    }
    const result = await metadata.get(id);
    const sheet = result.sheets?.find(item => String(item.properties.sheetId) === String(gid));
    if (!sheet) throw new Error("The configured sheet tab was not found.");
    return sheet.properties.title;
  }

  async function readGrid(id, { sheetName, gid, range = "A:Z" } = {}) {
    const name = sheetName ?? await sheetTitle(id, gid ?? "0");
    const a1 = `'${name.replace(/'/g, "''")}'!${range}`;
    const query = new URLSearchParams({
      ranges: a1, includeGridData: "true",
      fields: "sheets(data(rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat)))))",
    });
    const result = await fetchJSON(`${encodeURIComponent(id)}?${query}`);
    return result.sheets?.[0]?.data?.[0]?.rowData?.map(row => row.values || []) || [];
  }

  // Keep the existing table/graph renderers' date and numeric behavior.
  function toCell(cell = {}) {
    const effective = cell.effectiveValue || {};
    let value = effective.stringValue ?? effective.numberValue ?? effective.boolValue ?? "";
    const type = cell.effectiveFormat?.numberFormat?.type;
    if (typeof value === "number" && (type === "DATE" || type === "DATE_TIME")) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * DAY_MS));
      value = `Date(${date.getUTCFullYear()},${date.getUTCMonth()},${date.getUTCDate()},${date.getUTCHours()},${date.getUTCMinutes()},${date.getUTCSeconds()})`;
    }
    return { v: value, f: cell.formattedValue ?? String(value) };
  }

  async function readTable(id, options) {
    const grid = await readGrid(id, options);
    const [headers = [], ...rows] = grid;
    const width = rows.reduce((size, row) => Math.max(size, row.length), headers.length);
    return { table: {
      cols: Array.from({ length: width }, (_, index) => ({
        label: headers[index]?.formattedValue ?? String(headers[index]?.effectiveValue?.stringValue ?? ""),
      })),
      rows: rows.map(row => ({ c: Array.from({ length: width }, (_, index) => toCell(row[index])) })),
    } };
  }

  async function readCSV(id, options) {
    const grid = await readGrid(id, options);
    return grid.map(row => row.map(cell => {
      const effective = cell.effectiveValue || {};
      const value = cell.formattedValue ?? effective.stringValue ?? effective.numberValue ?? effective.boolValue ?? "";
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
  }

  async function receiveToken(response) {
    if (!busy) return; // Ignore callbacks from a cancelled sign-in.
    if (response.error || !response.access_token) {
      lock("Sign-in was cancelled or denied. Try again when you are ready.");
      return;
    }
    if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
      lock("Read-only Google Sheets permission is required to load your reference data.");
      return;
    }
    const lifetime = Number(response.expires_in);
    if (!Number.isFinite(lifetime) || lifetime <= 60) {
      lock("Google returned an invalid session. Please sign in again.");
      return;
    }
    accessToken = response.access_token;
    expiresAt = Date.now() + (lifetime - 60) * 1000;
    const sessionGeneration = generation;
    expiryTimer = setTimeout(() => lock("Your session expired. Sign in again."), expiresAt - Date.now());
    status("Loading your private reference data…");
    try {
      await onReady();
      if (sessionGeneration !== generation || !signedIn()) return;
      element("private-app").hidden = false;
      element("security-gate").hidden = true;
      busy = false;
      element("security-signin").disabled = false;
    } catch {
      if (sessionGeneration === generation) {
        lock("Unable to load your private data. Check your connection and Google account permissions, then sign in again.");
      }
    }
  }

  function initialise() {
    removeLegacyCache();
    const clientId = window.PRIVATE_SITE_CONFIG?.googleClientId;
    if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId || "")) {
      lock("Google sign-in setup is required. The site owner must add the OAuth client ID before this page can load data.");
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.onerror = () => lock("Google sign-in could not load. Check your connection and reload this page.");
    script.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE, include_granted_scopes: false,
        callback: receiveToken,
        error_callback: () => lock("The Google sign-in window was closed or blocked. Please try again."),
      });
      lock();
    };
    document.head.appendChild(script);
    element("security-signin").addEventListener("click", () => {
      if (!tokenClient || busy) return;
      busy = true;
      element("security-signin").disabled = true;
      status("Complete sign-in in the Google window.");
      try { tokenClient.requestAccessToken({ prompt: "select_account" }); }
      catch { lock("Google sign-in could not open. Please try again."); }
    });
    element("security-signout").addEventListener("click", () => signOut());
    if (channel) channel.onmessage = event => { if (event.data === "signout") signOut(false); };
    window.addEventListener("pageshow", event => {
      if (event.persisted) lock("Sign in again to view your private data.");
    });
    window.addEventListener("pagehide", () => lock());
    document.addEventListener("visibilitychange", () => {
      if (accessToken && !signedIn()) lock("Your session expired. Sign in again.");
    });
  }

  window.SecureSheets = Object.freeze({
    isAuthenticated: signedIn, readTable, readCSV,
    start(ready, clear) {
      if (started) throw new Error("Security was already initialised.");
      started = true;
      onReady = ready;
      onLock = clear;
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialise, { once: true });
      else initialise();
    },
  });
})();

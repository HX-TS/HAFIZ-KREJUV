/* Anonymous, read-only data service. Source spreadsheets stay private.
   JSONP supports Apps Script's cross-origin redirects without OAuth or CORS. */
(() => {
  "use strict";
  const DATASETS = new Set(["main", "swabbing", "dew", "summary"]);
  const cache = new Map();
  const pending = new Map();
  const endpoint = window.PUBLIC_REFERENCE_CONFIG?.endpoint || "";
  const configured = /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(endpoint);
  const statusElement = () => document.getElementById("public-data-status");

  function showError() {
    const element = statusElement();
    if (!element) return;
    element.hidden = false;
    element.textContent = "Reference records are temporarily unavailable. Please try again later.";
  }

  function clearError() {
    const element = statusElement();
    if (element) element.hidden = true;
  }

  function request(dataset) {
    if (!configured) return Promise.reject(new Error("Public reference service is not configured."));
    if (!DATASETS.has(dataset)) return Promise.reject(new Error("Unknown dataset."));
    return new Promise((resolve, reject) => {
      const callback = "__hafizPublicData_" + crypto.randomUUID().replace(/-/g, "");
      const script = document.createElement("script");
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        script.remove();
        // A callback that arrives just after timeout must not run stale work.
        window[callback] = () => {};
        setTimeout(() => { delete window[callback]; }, 60000);
      };
      window[callback] = result => {
        cleanup();
        if (!result || result.ok !== true || !result.data) {
          reject(new Error("The reference service could not return records."));
          return;
        }
        resolve(result.data);
      };
      script.onerror = () => { cleanup(); reject(new Error("The reference service could not be reached.")); };
      const url = new URL(endpoint);
      url.searchParams.set("dataset", dataset);
      url.searchParams.set("callback", callback);
      script.src = url.href;
      script.async = true;
      script.referrerPolicy = "no-referrer";
      timer = setTimeout(() => { cleanup(); reject(new Error("The reference service timed out.")); }, 20000);
      document.head.appendChild(script);
    });
  }

  async function load(dataset) {
    const previous = cache.get(dataset);
    if (previous && Date.now() - previous.time < 25000) return previous.data;
    if (!pending.has(dataset)) {
      pending.set(dataset, request(dataset).then(data => {
        cache.set(dataset, { time: Date.now(), data });
        clearError();
        return data;
      }).catch(error => { showError(); throw error; }).finally(() => pending.delete(dataset)));
    }
    return pending.get(dataset);
  }

  async function readTable(dataset, { sheetName } = {}) {
    const data = await load(dataset);
    const result = sheetName ? data.tables?.[sheetName] : data.table;
    if (!result?.table || !Array.isArray(result.table.cols) || !Array.isArray(result.table.rows)) {
      showError();
      throw new Error("The reference service returned an invalid table.");
    }
    return result;
  }

  async function readCSV(dataset) {
    const data = await load(dataset);
    if (!Array.isArray(data.rows)) throw new Error("The reference service returned invalid rows.");
    return data.rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  }

  window.PublicData = Object.freeze({
    isReady: () => configured, readTable, readCSV,
    start(loadPage) {
      const initialise = async () => {
        try {
          Object.keys(localStorage).filter(key => key.startsWith("krejuv-fec-sheet-"))
            .forEach(key => localStorage.removeItem(key));
        } catch { /* Storage can be unavailable. */ }
        if (!configured) { showError(); return; }
        try { await loadPage(); clearError(); } catch { showError(); }
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialise, { once: true });
      else initialise();
    },
  });
})();
